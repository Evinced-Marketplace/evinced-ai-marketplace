# Evinced AI Marketplace

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
- **Node.js** on your `PATH` (used by the auto-update hook and by `npx`-launched MCP servers).
- For plugins that ship an Evinced MCP server: **npm access to the `@evinced` scope.** The
  servers are hosted on Evinced's private JFrog registry, so your `~/.npmrc` must be
  configured to resolve `@evinced/*` packages before `npx` can pull them. This is the same
  prerequisite as installing the Evinced MCP servers directly.

## Install

Every client follows the same two steps: add the `evinced-ai-marketplace` marketplace once,
then install any plugin from it by name. The examples below install `evinced-mobile-mcp`;
substitute the name of any plugin from the table above.

### Claude Code

Add the marketplace once:

```
/plugin marketplace add GetEvinced/evinced-ai-marketplace
```

Then install the plugin, e.g. Evinced Mobile MCP:

```
/plugin install evinced-mobile-mcp@evinced-ai-marketplace
```

Restart Claude Code after installing. MCP servers appear under `/mcp`; bundled skills are
picked up automatically. The same commands work from a terminal as
`claude plugin marketplace add …` and `claude plugin install …`.

### GitHub Copilot CLI

Add the marketplace once:

```bash
copilot plugin marketplace add GetEvinced/evinced-ai-marketplace
```

Then install the plugin, e.g. Evinced Mobile MCP:

```bash
copilot plugin install evinced-mobile-mcp@evinced-ai-marketplace
```

Inside an interactive session, use `/plugin marketplace add …` and `/plugin install …`
instead. Start a new session after installing.

### Codex

Add the marketplace once:

```bash
codex plugin marketplace add GetEvinced/evinced-ai-marketplace
```

Then install the plugin, e.g. Evinced Mobile MCP:

```bash
codex plugin add evinced-mobile-mcp@evinced-ai-marketplace
```

You can also browse and install interactively with `/plugins`. Start a new session after
installing.

### Cursor

Cursor installs plugins from a marketplace through the **Customize** page:

1. Open **Customize** in the sidebar.
2. Find the plugin, e.g. Evinced Mobile MCP (`evinced-mobile-mcp`).
3. Select **Install** and choose a project or user scope.

If your organization uses a Cursor **team marketplace**, an admin can make these plugins
available to the whole team: in the Cursor dashboard go to **Plugins & MCPs → Team
Marketplaces → Add Marketplace → Import from Repo** and paste
`https://github.com/GetEvinced/evinced-ai-marketplace`.

## Auto-updates

Each plugin ships a `SessionStart` hook (`scripts/refresh-marketplace.mjs`, run via
`node`) that pulls the latest published version on every session start. The script is
identical across all plugins — it derives the plugin name at runtime and runs the active
client's update command. It's written in Node.js so it runs unchanged on macOS, Linux,
and Windows (no bash/Git Bash dependency):

- **Claude Code** — `claude plugin marketplace update` + `claude plugin update`
- **Codex** — `codex plugin marketplace upgrade` + `codex plugin add`
- **GitHub Copilot CLI** — `copilot plugin update`
- **Cursor** — no startup hook; updates flow through the Cursor marketplace.

The hook always exits `0`, so a transient network failure never blocks session start. It
writes diagnostics to `~/.evinced/logs/plugin-refresh.log` (the shared Evinced log dir).

> **Two-restart roll-over (expected).** When a new version is published, the first session
> restart fires the hook and downloads it into the plugin cache; the **second** restart
> loads it. This is expected behavior of the client plugin runtimes, not a bug in this repo.

## Repository layout

```
evinced-ai-marketplace/
├── README.md
├── LICENSE
├── .claude-plugin/
│   └── marketplace.json                  # Catalog — Claude Code, Codex, Copilot CLI
├── .cursor-plugin/
│   └── marketplace.json                  # Catalog — Cursor
└── plugins/
    └── mobile-mcp/
        ├── .claude-plugin/plugin.json    # Claude manifest (also read by Copilot)
        ├── .cursor-plugin/plugin.json    # Cursor manifest
        ├── .codex-plugin/plugin.json     # Codex manifest
        ├── .mcp.json                     # MCP config — all clients (Cursor via the manifest's mcpServers)
        ├── hooks/                         # SessionStart auto-update registration per client
        ├── scripts/refresh-marketplace.mjs
        └── skills/                        # Plugin-scoped skills (e.g. setup helpers)
```

Design notes:

- **One plugin folder, all clients.** Shared content (skills, hooks, MCP config) is authored
  once at the plugin root; only the thin per-client manifest differs.
- **No shared assets between plugins.** Each plugin is a fully self-contained subtree, so
  release cadences stay independent.
- **No toolchain in the published tree.** The published repo is pure JSON + Markdown + one
  Node.js script per plugin — no build step, no `node_modules`.

## License

The contents of this repository (plugin manifests, skills, hooks, and scripts) are licensed
under MIT — see [LICENSE](./LICENSE). The Evinced products these plugins install or connect
to, such as the `@evinced/*` npm packages and Evinced services, are not covered by this
license and remain subject to Evinced's own terms.
