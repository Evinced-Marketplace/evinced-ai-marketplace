#!/usr/bin/env node
//
// Generic plugin auto-update hook. Byte-identical in every Evinced plugin.
//
// Runs on session start (registered as a SessionStart/sessionStart command hook).
// It derives the plugin's own name at runtime from its manifest and runs the
// active client's plugin-update command, so the same script works unmodified for
// any plugin and any supported client. It never blocks session start: it exits 0
// on every failure and only logs for diagnostics.
//
// Written in Node.js (not bash) for cross-platform portability: `node` is a real
// binary on macOS, Linux, and Windows and is already present wherever a plugin's
// `.mcp.json` launches its server via `npx`, so there is no dependency on bash,
// Git Bash, or a POSIX shell, and no shebang/CRLF pitfalls.
//
// Supported clients (Cursor is excluded on purpose; its marketplace self-updates):
//   Claude Code     claude plugin marketplace update <mkt>  + claude plugin update <plugin>@<mkt>
//   OpenAI Codex    codex  plugin marketplace upgrade <mkt>  + codex  plugin add    <plugin>@<mkt>
//   GitHub Copilot  copilot plugin update <plugin>
//
// Client is detected by the environment each one exports to plugin hooks. Copilot
// and Codex also export CLAUDE_PLUGIN_ROOT, so their specific signals are checked
// first; name derivation stays client-agnostic.

import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const MARKETPLACE = process.env.EVINCED_MARKETPLACE || 'evinced-ai-marketplace';

// Logs go to ~/.evinced/logs, the shared diagnostics directory the Evinced MCP
// servers already use. One file for every plugin's hook; each line names the
// plugin, so a single shared log reads fine and never collides with the
// servers' own rotated logs.
const LOG_FILE = join(homedir(), '.evinced', 'logs', 'plugin-refresh.log');

function log(msg) {
  // Diagnostics only; a logging failure must never abort session start.
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* ignore */ }
}

// Prefer the client-provided var (all clients set CLAUDE_PLUGIN_ROOT); otherwise
// derive from this script's own location via import.meta.url, which resolves
// regardless of how the script was invoked or whether the env var is set.
function pluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

function pluginName(root) {
  try {
    const parsed = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
    return typeof parsed.name === 'string' ? parsed.name : null;
  } catch {
    return null;
  }
}

// Run a command, logging its outcome but never throwing. Returns 'ok' | 'failed'
// | 'missing'; a missing CLI (ENOENT) is not an error, the session just continues.
function run(cmd, args) {
  log(`+ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.error) {
    if (res.error.code === 'ENOENT') {
      log(`  ${cmd} not on PATH; skipping`);
      return 'missing';
    }
    log(`  error: ${res.error.message}`);
    return 'failed';
  }
  if (res.status === 0) {
    log('  ok');
    return 'ok';
  }
  log(`  exit ${res.status}${res.stderr ? `: ${res.stderr.trim()}` : ''}`);
  return 'failed';
}

function summarize(client, results) {
  if (results[0] === 'missing') return `skipped, ${client} CLI not on PATH`;
  if (results.some((r) => r === 'failed')) return `error via ${client}, see above`;
  return `ok, updated via ${client}`;
}

function updateClaude(qualified) {
  const r1 = run('claude', ['plugin', 'marketplace', 'update', MARKETPLACE]);
  const r2 = r1 === 'missing' ? 'missing' : run('claude', ['plugin', 'update', qualified]);
  return summarize('claude', [r1, r2]);
}

function updateCodex(qualified) {
  const r1 = run('codex', ['plugin', 'marketplace', 'upgrade', MARKETPLACE]);
  const r2 = r1 === 'missing' ? 'missing' : run('codex', ['plugin', 'add', qualified]);
  return summarize('codex', [r1, r2]);
}

function updateCopilot(name) {
  return summarize('copilot', [run('copilot', ['plugin', 'update', name])]);
}

// Copilot (VS Code agent and CLI) exports COPILOT_* env vars, and it also sets
// CLAUDE_PLUGIN_ROOT, so its COPILOT_* signal must be checked before the claude
// branch or it gets misdetected as Claude. Confirmed from a real VS Code Copilot
// session: it sets e.g. COPILOT_OTEL_FILE_EXPORTER_PATH (and no COPILOT_PLUGIN_ROOT,
// which we once wrongly assumed). Codex is distinguished by PLUGIN_ROOT/PLUGIN_DATA.
function detectClient(env) {
  if (Object.keys(env).some((k) => k.startsWith('COPILOT'))) return 'copilot';
  if (env.PLUGIN_DATA || env.PLUGIN_ROOT) return 'codex';
  if (env.CLAUDE_PLUGIN_ROOT) return 'claude';
  return '';
}

// No client signal in the environment: best-effort by whichever CLI exists.
function bestEffort(qualified, name) {
  const claudeMkt = run('claude', ['plugin', 'marketplace', 'update', MARKETPLACE]);
  if (claudeMkt !== 'missing') {
    return summarize('claude', [claudeMkt, run('claude', ['plugin', 'update', qualified])]);
  }
  const codexMkt = run('codex', ['plugin', 'marketplace', 'upgrade', MARKETPLACE]);
  if (codexMkt !== 'missing') {
    return summarize('codex', [codexMkt, run('codex', ['plugin', 'add', qualified])]);
  }
  return updateCopilot(name);
}

function main() {
  const root = pluginRoot();
  const name = pluginName(root);
  if (!name) {
    log(`skipped: no plugin name in ${join(root, '.claude-plugin', 'plugin.json')}`);
    return;
  }

  const client = detectClient(process.env) || 'auto';
  log(`auto-update: ${name} via ${client} (node ${process.version}, ${process.platform})`);

  const qualified = `${name}@${MARKETPLACE}`;
  let outcome;
  switch (client) {
    case 'copilot': outcome = updateCopilot(name); break;
    case 'codex': outcome = updateCodex(qualified); break;
    case 'claude': outcome = updateClaude(qualified); break;
    default: outcome = bestEffort(qualified, name); break;
  }
  log(`result: ${outcome}`);
}

// Everything is wrapped so a failed update never aborts the session.
try {
  main();
} catch (err) {
  log(`unexpected error, session continues: ${err && err.message}`);
}
process.exit(0);
