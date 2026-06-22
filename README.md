# Evinced AI Plugins

Evinced plugins and skills marketplace for AI coding agents.

This repository hosts the official Evinced plugins. Each plugin is independently
versioned, installable, and auto-updates on session start. Plugins ship manifests for
**Claude Code**, **Cursor**, and **Codex**, and work with **GitHub Copilot CLI** (which
reads the Claude manifest).

## Plugins

| Plugin | What it ships | Underlying package |
|---|---|---|
| `evinced-mobile-mcp` | Evinced Mobile MCP server — automated accessibility analysis and remediation guidance for iOS and Android apps. | `@evinced/mcp-server-mobile` |

## Prerequisites

- A supported client: **Claude Code**, **Cursor**, **Codex**, or **GitHub Copilot CLI**.
- **npm access to the `@evinced` scope.** The MCP server is hosted on Evinced's private
  JFrog registry, so your `~/.npmrc` must be configured to resolve `@evinced/*` packages
  before `npx` can pull them. This is the same prerequisite as installing the Evinced MCP
  servers directly.

## Install (Claude Code)

Add the marketplace once:

```
/plugin marketplace add GetEvinced/evinced-ai-marketplace
```

Then install the plugin:

```
/plugin install evinced-mobile-mcp@evinced-ai-marketplace
```

Restart Claude Code after installing. The installed MCP-server plugin appears under
`/mcp`; any bundled skills are picked up automatically by skill discovery.

## Auto-updates

Each plugin ships a `SessionStart` hook (`scripts/refresh-marketplace.sh`) that pulls the
latest published version on every session start. The script is identical across all
plugins — it derives the plugin name at runtime and runs the active client's update
command:

- **Claude Code** — `claude plugin marketplace update` + `claude plugin update`
- **Codex** — `codex plugin marketplace upgrade` + `codex plugin add`
- **GitHub Copilot CLI** — `copilot plugin update`
- **Cursor** — no startup hook; updates flow through the Cursor marketplace.

The hook always exits `0`, so a transient network failure never blocks session start. It
writes diagnostics to `/tmp/evinced-plugin-refresh.log`.

> **Two-restart roll-over (expected).** When a new version is published, the first session
> restart fires the hook and downloads it into the plugin cache; the **second** restart
> loads it. This is expected behavior of the client plugin runtimes, not a bug in this repo.

## Troubleshooting

**MCP server fails to start after install.** Most often this is a JFrog auth issue. Run
`npx -y @evinced/mcp-server-mobile@latest --version` in a fresh terminal — if `npx` cannot
resolve the package, your `~/.npmrc` is not configured for the `@evinced` scope. Fix
`~/.npmrc` and restart the client.

**Plugin not updating after a version bump.** Inspect the hook log:

```bash
tail -n 40 /tmp/evinced-plugin-refresh.log
```

Look for failures in the `marketplace`/`update` steps, and remember the two-restart caveat
above — a single restart only stages the update.

**Plugin appears in the marketplace but not in `/mcp` after install.** Make sure you fully
restarted the client after installing, not just reloaded the session.

## Repository layout

```
evinced-ai-marketplace/
├── README.md
├── LICENSE
├── .claude-plugin/
│   └── marketplace.json                  # Catalog — lists the plugins
└── plugins/
    └── mobile-mcp/
        ├── .claude-plugin/plugin.json    # Claude manifest (also read by Copilot)
        ├── .cursor-plugin/plugin.json    # Cursor manifest
        ├── .codex-plugin/plugin.json     # Codex manifest
        ├── .mcp.json                     # MCP config — all clients (Cursor via the manifest's mcpServers)
        ├── hooks/                         # SessionStart auto-update registration per client
        ├── scripts/refresh-marketplace.sh
        └── skills/                        # Plugin-scoped skills (e.g. setup helpers)
```

Design notes:

- **One plugin folder, all clients.** Shared content (skills, hooks, MCP config) is authored
  once at the plugin root; only the thin per-client manifest differs.
- **No shared assets between plugins.** Each plugin is a fully self-contained subtree, so
  release cadences stay independent.
- **No toolchain in the published tree.** The published repo is pure JSON + Markdown + one
  shell script per plugin — no build step, no `node_modules`.

## License

MIT — see [LICENSE](./LICENSE).
