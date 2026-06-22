---
name: setup-evinced-mobile-mcp
description: Set up or troubleshoot the Evinced Mobile MCP server for iOS or Android. Use when the user wants to install, configure, or fix Evinced Mobile MCP; when the evinced-mobile-mcp MCP server shows as disconnected; when a scan fails because no device is found or WebDriverAgent is not reachable; when JFrog/npm auth fails pulling @evinced/mcp-server-mobile; when the Evinced Web Login loops or hangs; or when the user asks how to launch WDA, configure ADB, or set up an iOS simulator / iOS device / Android emulator / Android device for Evinced scans.
---

# Setup Evinced Mobile MCP

## When to use this skill

Use this skill when:

- The user is installing or configuring Evinced Mobile MCP for the first time.
- The `evinced-mobile-mcp` MCP server is not connected, its tools are missing from `/mcp`, or scans fail at startup.
- `evinced_accessibility_analyze` reports no device, or that WebDriverAgent / ADB is not reachable.
- JFrog/npm auth fails when Claude tries to pull `@evinced/mcp-server-mobile`.
- The user reports a Web Login loop or an "unauthenticated" error.

Do NOT use this skill when:

- The user just wants to boot a simulator, build the app, or launch the app — that is a build/run task, not Evinced setup.
- The user wants to run an actual accessibility scan — call `evinced_accessibility_analyze` directly.
- The user wants to fix a specific accessibility issue — call `evinced_get_remediation_instructions`.

## Core principle: diagnose first, fix only what's broken

NEVER walk through the full setup blindly. The user almost always has at least some pieces in place. Your job:

1. Run the diagnostics in §1 and report what is working vs missing.
2. Fix only the broken pieces.
3. Before any change to the user's machine (`~/.npmrc`, shell profile, cloning WDA, launching long-running processes), state the exact change and ask for explicit confirmation.

## 1. Diagnose

Run these checks in order. Cheap, read-only first. Stop early if everything passes.

### 1.1 MCP server registration

```bash
claude mcp get evinced-mobile-mcp 2>&1
```

The MCP server is registered as `evinced-mobile-mcp` both by the marketplace plugin (`evinced-mobile-mcp@evinced-ai-marketplace`) and by the direct `claude mcp add` path from the upstream README.

- Not registered → user is missing the install. Prefer `/plugin install evinced-mobile-mcp@evinced-ai-marketplace`. Direct alternative: `claude mcp add --transport stdio -- evinced-mobile-mcp npx -y @evinced/mcp-server-mobile@latest`.
- Registered but disconnected → continue to 1.2; the root cause is almost always JFrog auth.

### 1.2 JFrog npm registry in `~/.npmrc`

```bash
grep -E '^@evinced:registry=' ~/.npmrc 2>/dev/null || echo "MISSING: @evinced scope"
grep -E '^//evinced\.jfrog\.io.*_authToken=.+$' ~/.npmrc 2>/dev/null || echo "MISSING: non-empty JFrog token line"
```

If either line is missing, mark JFrog auth as broken → fix in §2.

### 1.3 Platform target

Ask the user OR detect:

```bash
# iOS simulators that are currently booted
xcrun simctl list devices booted 2>/dev/null | sed -n '/^-- /,/^--/p' | grep -v '^--' || true

# iOS physical devices (Xcode 15+)
xcrun devicectl list devices 2>/dev/null | tail -n +3 || true

# Android (emulators + physical)
adb devices 2>/dev/null | tail -n +2 | grep -v '^$' || echo "adb: not installed"

echo "ANDROID_HOME=${ANDROID_HOME:-<unset>}"
```

If nothing is connected or the user has not said which platform they want, ASK: iOS Simulator, iOS Device, Android Emulator (via Android Studio), or Android Device (via standalone ADB)? Only branch into the path they confirm.

### 1.4 WebDriverAgent reachability (iOS only)

```bash
curl -s --max-time 2 -o /dev/null -w "8100:%{http_code}\n" http://localhost:8100/status
curl -s --max-time 2 -o /dev/null -w "13001:%{http_code}\n" http://localhost:13001/status
```

`200` on either port = WDA up. The MCP auto-discovers between 8100 (manual Xcode launch) and 13001 (mobile-mcp / mobilecli). `000` on both = nothing listening → §4.A or §4.B.

### 1.5 ADB reachability (Android only)

```bash
adb version 2>&1 | head -n 1 || echo "adb: not installed"
adb devices 2>&1 | tail -n +2
```

If `adb` is not on PATH → §4.C (with Android Studio) or §4.D (standalone).

### 1.6 Report

Summarize the diagnosis as a short table before doing anything else. Example:

```
MCP server:        connected as `evinced-mobile-mcp`
JFrog ~/.npmrc:    OK
iOS Simulator:     iPhone 16 booted
WebDriverAgent:    NOT REACHABLE (8100 and 13001 both unresponsive)
Next step:         launch WDA against iPhone 16 (§4.A).
```

Only proceed with fixes after the user confirms.

## 2. Fix JFrog npm auth

Only if §1.2 reported missing entries.

### 2.1 NEVER ask for the token in the chat

The JFrog token is a secret credential. **Never** ask the user to paste, type, or send the token (or any other credential) in this chat — the transcript is not a safe place for secrets. Instead, you write the registry lines with a `<TOKEN>` placeholder, then tell the user to open `~/.npmrc` and paste the real token in place of the placeholder themselves. You never see the token.

If the user asks where to get the token: it comes from their Evinced contact.

### 2.2 Write the block with a placeholder

Show the exact block you will add to `~/.npmrc`, keeping `<TOKEN>` as a literal placeholder. Ask for explicit confirmation, then write it.

```
@evinced:registry=https://evinced.jfrog.io/artifactory/api/npm/restricted-npm/
//evinced.jfrog.io/artifactory/api/npm/restricted-npm/:_authToken=<TOKEN>
//evinced.jfrog.io/artifactory/api/npm/restricted-npm/:always-auth=true
```

### 2.3 Tell the user to insert the token themselves

After writing the block, instruct the user:

> "I've added the registry lines to `~/.npmrc` with a `<TOKEN>` placeholder. Open `~/.npmrc` and replace `<TOKEN>` on the `_authToken` line with your real JFrog token, then save. Don't paste the token here."

### 2.4 Append, never overwrite

- If `~/.npmrc` does not exist → create it with just the block above (token left as `<TOKEN>`).
- If `~/.npmrc` exists without `@evinced` entries → append the block.
- If `~/.npmrc` already has stale `@evinced` / `evinced.jfrog.io` lines → make a backup (`cp ~/.npmrc ~/.npmrc.bak.$(date +%s)`), show the user the backup path, then replace only the stale lines.

### 2.5 Verify

```bash
npm view @evinced/mcp-server-mobile version
```

Expected: a version string (e.g. `0.1.16`). On `E401` / `ENEEDAUTH` the token is wrong — re-prompt the user.

After fixing `~/.npmrc`, the user must fully restart Claude Code for the MCP server to retry the failed `npx` pull.

## 3. Evinced authentication (Web Login)

The Evinced Mobile MCP uses **Web Login** as its authentication flow. There is no advance setup: the first Evinced tool call opens a browser, the user authenticates, and the credential is cached in the system keychain for future sessions.

If the user reports a stuck Web Login (loop, "already logged in" but tools still fail, browser tab keeps reopening), reset the cached credential:

```shell
npx @evinced/mcp-server-mobile@latest --logout
npx @evinced/mcp-server-mobile@latest --login
```

Then retry the failing tool call.

## 4. Platform setup

Run only the branch the user needs based on §1.3.

### 4.0 Choose where to install WebDriverAgent (iOS only)

Before cloning WebDriverAgent (needed for §4.A and §4.B), ASK the user where to put it. Never decide silently. Offer:

> "WebDriverAgent needs to live somewhere outside this project repo. Where would you like it?
> - Give me an explicit path, or
> - I can clone it into your home directory (`~/WebDriverAgent`), or
> - somewhere alongside the project (a sibling directory, not inside it).
>
> It must NOT go inside the project repository."

Rules:

- **Never** clone WebDriverAgent inside the project repo, regardless of what the user picks.
- If the user gives a path, validate it is outside the project tree before using it; if it is inside, push back and re-ask.
- Default only if the user has no preference: `~/WebDriverAgent`.
- Use the confirmed path as `$WDA_DIR` in the steps below (the examples show `~/WebDriverAgent`; substitute the chosen path).

### 4.A iOS Simulator

Prerequisites: Xcode + command line tools (`xcode-select -p` returns a path), a booted simulator.

1. Confirm the WebDriverAgent location with the user per §4.0, then clone it there (one-time per machine). Substitute the confirmed path for `~/WebDriverAgent`:

   ```bash
   WDA_DIR=~/WebDriverAgent   # the path confirmed in §4.0
   if [ ! -d "$WDA_DIR" ]; then
     git clone --depth 1 https://github.com/appium/WebDriverAgent.git "$WDA_DIR"
   fi
   ```

2. Confirm the simulator name with the user (use the one from §1.3). If multiple simulators are booted, note that the MCP uses the first one listed.

3. Launch WDA. Substitute the real simulator name for `iPhone 16`:

   ```bash
   cd "$WDA_DIR"
   xcodebuild \
     -project WebDriverAgent.xcodeproj \
     -scheme WebDriverAgentRunner \
     -destination 'platform=iOS Simulator,name=iPhone 16' \
     test
   ```

   This is a **long-running** process — it keeps WDA up while the xcodebuild test runs. The user must leave this terminal open. Recommend a dedicated terminal tab. Do NOT detach it from this skill.

4. Verify:

   ```bash
   curl -s --max-time 2 -o /dev/null -w "%{http_code}\n" http://localhost:8100/status
   ```

   Expect `200`.

### 4.B iOS Physical Device

Prerequisites:

- Free Apple Developer account is enough.
- Developer mode enabled on the device (Settings → Privacy & Security → Developer Mode).
- Device connected via USB and trusted by the Mac.

1. Get device UDID:

   ```bash
   xcrun devicectl list devices
   ```

   Or in Xcode → Window → Devices and Simulators. Confirm the UDID with the user.

2. Confirm the WebDriverAgent location with the user per §4.0, then clone it there (one-time). Substitute the confirmed path for `~/WebDriverAgent`:

   ```bash
   WDA_DIR=~/WebDriverAgent   # the path confirmed in §4.0
   if [ ! -d "$WDA_DIR" ]; then
     git clone --depth 1 https://github.com/appium/WebDriverAgent.git "$WDA_DIR"
   fi
   ```

3. **Open `$WDA_DIR/WebDriverAgent.xcodeproj` in Xcode** and set the WebDriverAgentRunner bundle identifier to something unique (e.g. `com.<your-handle>.WebDriverAgentRunner`) plus a signing team. This must be done in Xcode — do not edit `project.pbxproj` from the CLI.

4. Launch WDA on the device:

   ```bash
   cd "$WDA_DIR"
   xcodebuild \
     -project WebDriverAgent.xcodeproj \
     -scheme WebDriverAgentRunner \
     -destination 'platform=iOS,id=<UDID>' \
     test
   ```

5. On first launch the device will need to trust the developer profile: Settings → General → VPN & Device Management → trust the profile.

6. Verify with the same `curl` as 4.A step 4.

### 4.C Android via Android Studio

Prerequisites: Android Studio installed.

1. Confirm `ANDROID_HOME`. If unset, find the SDK path in Android Studio → Tools → SDK Manager → Android SDK Location, then add to `~/.zshrc` (or `~/.bash_profile`):

   ```shell
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$PATH"
   ```

   Reload the shell and fully restart Claude Code so the MCP child process inherits the new env.

2. Start an emulator OR connect a physical device with USB debugging enabled.

3. Verify:

   ```bash
   adb devices
   ```

   Expect at least one line ending in `device` (not `offline` or `unauthorized`).

### 4.D Standalone ADB (no Android Studio)

1. Download Android Platform Tools from <https://developer.android.com/tools/releases/platform-tools>.
2. Extract to a stable location, e.g. `~/android-platform-tools/`.
3. Add to PATH via `~/.zshrc` / `~/.bash_profile`:

   ```shell
   export PATH="$HOME/android-platform-tools:$PATH"
   ```

4. Reload the shell, restart Claude Code.
5. Verify:

   ```bash
   adb --version
   adb devices
   ```

## 5. Optional configuration

Surface these only when the user asks or hits a related symptom.

- **`WDA_PORT`** — set if your WDA listens on a non-default port. Default auto-discovery handles 8100 (Xcode manual) and 13001 (mobile-mcp). The marketplace plugin's `.mcp.json` does not set this env var; if the user needs it, they must register the MCP directly (with `claude mcp add` + `--env WDA_PORT=...`) instead of relying on the plugin.
- **`VALIDATION_CONFIG_PATH`** — absolute path to a JSON config that selects which Evinced rules run and at what severity. Same constraint as `WDA_PORT`: the plugin does not inject env vars, so use a direct `claude mcp add` registration.

## 6. End-to-end verification

After fixes, verify the full chain:

1. Server up:

   ```bash
   claude mcp get evinced-mobile-mcp 2>&1
   ```

   Expect a connected status.

2. Real scan: ask the agent to call `evinced_accessibility_analyze` against the discovered device. A successful scan proves npm resolve → server start → auth → WDA/ADB → app analysis all work.

   If the user has no app screen ready, fall back to confirming the server is listed under `/mcp` and that its tools appear.

## 7. Troubleshooting cookbook

Match the symptom to ONE recipe; do not run all of them.

| Symptom | Likely cause | Action |
|---|---|---|
| `evinced-mobile-mcp` disconnected right after install. | JFrog token missing or wrong → `npx` cannot pull `@evinced/mcp-server-mobile`. | §2, then fully restart Claude Code. |
| Scan returns "no device found". | Nothing booted/connected, or WDA/ADB not running. | §1.3 + §1.4/§1.5 → branch into §4.A–§4.D. |
| WDA exits immediately with a code-signing error on a physical device. | Bundle ID not unique or no signing team. | §4.B step 3 in Xcode. |
| WDA reachable on `curl :8100/status` but scan still says "WDA not reachable". | Port mismatch (WDA on non-default port). | §5 — set `WDA_PORT`, or restart WDA on 8100. |
| Browser keeps reopening the Evinced login. | Stale keychain entry. | §3 — `--logout` then `--login`. |
| `npm ERR! 401 Unauthorized` in MCP startup logs. | JFrog token expired. | New token from Evinced contact → §2. |
| `adb devices` shows the device as `unauthorized`. | USB debugging trust prompt not accepted. | Unlock the device, accept the "Allow USB debugging from this computer" prompt. |
| `xcrun devicectl` command not found. | Xcode < 15. | Use `xcrun xctrace list devices` instead, or check Xcode → Devices and Simulators. |

## 8. Safety rules

- **Never** ask the user to paste, type, or send the JFrog token — or any other credential/secret — in this chat. Write the registry lines with a `<TOKEN>` placeholder and have the user fill in the real token by editing `~/.npmrc` themselves.
- **Never** write the JFrog token to any file inside the project repository. Only `~/.npmrc` is an acceptable destination.
- **Never** overwrite `~/.npmrc`, `~/.zshrc`, or `~/.bash_profile`. Show the exact diff first, append on user confirmation, and back up before replacing any existing line.
- **Never** clone WebDriverAgent into the project repo. Always ask the user where to put it (§4.0) — an explicit path, the home directory, or alongside the project — and never decide silently.
- **Never** run `xcodebuild ... test` detached/in-background from this skill. The user must own that long-running process so they can stop it. Recommend a dedicated terminal tab.
- **Never** auto-restart Claude Code. Ask the user to restart it themselves.
- **Never** echo, log, or copy the JFrog token. It belongs only in `~/.npmrc`, entered by the user.
