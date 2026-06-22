#!/usr/bin/env bash
#
# Generic plugin auto-update hook — byte-identical in every Evinced plugin.
#
# Runs on session start (registered as a SessionStart/sessionStart command hook).
# It derives the plugin's own name at runtime from its manifest and runs the
# active client's plugin-update command, so the same script works unmodified for
# any plugin and any supported client. It NEVER blocks session start: it exits 0
# on every failure and only logs for diagnostics.
#
# Supported clients (Cursor is intentionally excluded — its marketplace updates):
#   Claude Code     claude plugin marketplace update <mkt>  +  claude plugin update <plugin>@<mkt>
#   OpenAI Codex    codex  plugin marketplace upgrade <mkt>  +  codex  plugin add    <plugin>@<mkt>
#   GitHub Copilot  copilot plugin update <plugin>
#
# Client is detected by the environment each one exports to plugin hooks:
#   Copilot → COPILOT_PLUGIN_ROOT / COPILOT_AGENT_SESSION_ID
#   Codex   → PLUGIN_ROOT / PLUGIN_DATA (also aliases CLAUDE_PLUGIN_ROOT)
#   Claude  → CLAUDE_PLUGIN_ROOT only
# All three also export CLAUDE_PLUGIN_ROOT, so name derivation is client-agnostic.

# Note: deliberately NOT `set -e` — a failed update must never abort the session.
set -uo pipefail

MARKETPLACE="${EVINCED_MARKETPLACE:-evinced-ai-marketplace}"
LOG_FILE="${TMPDIR:-/tmp}/evinced-plugin-refresh.log"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >>"$LOG_FILE" 2>&1; }

# --- locate the plugin root -------------------------------------------------
# Prefer the client-provided var (all three set CLAUDE_PLUGIN_ROOT); otherwise
# derive from this script's own location: <plugin>/scripts/refresh-marketplace.sh
ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$ROOT" ]; then
  ROOT="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)"
fi

# --- derive the plugin name from the manifest (no hardcoded name) -----------
MANIFEST="$ROOT/.claude-plugin/plugin.json"
PLUGIN_NAME=""
if [ -f "$MANIFEST" ]; then
  if command -v jq >/dev/null 2>&1; then
    PLUGIN_NAME="$(jq -r '.name // empty' "$MANIFEST" 2>/dev/null || true)"
  fi
  if [ -z "$PLUGIN_NAME" ]; then
    # Portable fallback if jq is unavailable: first "name": "..." value.
    PLUGIN_NAME="$(sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$MANIFEST" 2>/dev/null | head -1)"
  fi
fi

if [ -z "$PLUGIN_NAME" ]; then
  log "could not derive plugin name from '$MANIFEST'; skipping auto-update"
  exit 0
fi

QUALIFIED="${PLUGIN_NAME}@${MARKETPLACE}"

# --- run a command, logging failures but never aborting ---------------------
run() {
  log "+ $*"
  if "$@" >>"$LOG_FILE" 2>&1; then
    log "  ok"
  else
    log "  (exit $?) — ignored, session continues"
  fi
}

# --- detect the active client and update ------------------------------------
{
  log "--- SessionStart auto-update (plugin=$PLUGIN_NAME marketplace=$MARKETPLACE)"

  if [ -n "${COPILOT_PLUGIN_ROOT:-}" ] || [ -n "${COPILOT_AGENT_SESSION_ID:-}" ]; then
    if command -v copilot >/dev/null 2>&1; then
      run copilot plugin update "$PLUGIN_NAME"
    else
      log "copilot not on PATH; skipping"
    fi

  elif [ -n "${PLUGIN_DATA:-}" ] || [ -n "${PLUGIN_ROOT:-}" ]; then
    # Codex (excluded Copilot above; Claude does not set PLUGIN_ROOT/PLUGIN_DATA).
    if command -v codex >/dev/null 2>&1; then
      run codex plugin marketplace upgrade "$MARKETPLACE"
      run codex plugin add "$QUALIFIED"
    else
      log "codex not on PATH; skipping"
    fi

  elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
    if command -v claude >/dev/null 2>&1; then
      run claude plugin marketplace update "$MARKETPLACE"
      run claude plugin update "$QUALIFIED"
    else
      log "claude not on PATH; skipping"
    fi

  else
    # No client signal in the environment — best-effort by whichever CLI exists.
    if command -v claude >/dev/null 2>&1; then
      run claude plugin marketplace update "$MARKETPLACE"
      run claude plugin update "$QUALIFIED"
    elif command -v codex >/dev/null 2>&1; then
      run codex plugin marketplace upgrade "$MARKETPLACE"
      run codex plugin add "$QUALIFIED"
    elif command -v copilot >/dev/null 2>&1; then
      run copilot plugin update "$PLUGIN_NAME"
    else
      log "no supported client CLI detected; skipping"
    fi
  fi
} >>"$LOG_FILE" 2>&1

exit 0
