# Vencord Discord Profile Manager

A desktop profile manager for running multiple isolated Discord sessions through Vencord.

This project extends [Vencord](https://github.com/Vendicated/Vencord) with persistent Discord profiles. Each profile receives an isolated Electron data directory, allowing separate Discord accounts to remain logged in simultaneously without copying or exposing authentication tokens.

> This is an independent Vencord fork and is not an official Vencord feature.

## Demo

<!-- Add a screenshot or GIF of:
1. Vencord Settings → Discord Profiles
2. Personal and Work profiles listed
3. Two Discord windows open simultaneously
-->

## Features

* Create isolated Discord profiles from Vencord Settings
* Optionally choose a profile before Discord starts
* Run multiple Discord accounts simultaneously
* Preserve each profile’s login between restarts
* Launch profiles without terminal commands
* Display the currently active profile
* Open a profile’s local data folder
* Support command-line profile launching
* Preserve Discord Stable, PTB, and Canary separation
* Share Vencord plugins, themes, QuickCSS, and settings between profiles
* Prevent path traversal and malformed profile names
* Prevent case-insensitive profile collisions
* Restore the original Discord environment when launching profiles
* Keep normal Discord single-instance behavior by default

## How it works

Profiles are isolated through separate Electron `userData` directories.

For example, on Linux:

```text
~/.config/discord
~/.config/discord-vencord-profile-personal/discord
~/.config/discord-vencord-profile-work/discord
```

Each isolated profile receives separate:

* Cookies
* Local Storage
* IndexedDB
* Cache
* Service-worker data
* Discord login state

The profiles continue sharing:

* Vencord settings
* Enabled plugins
* Themes
* QuickCSS

No Discord tokens, cookies, credentials, or session files are copied between profiles.

## Profile Manager

After installation, open:

```text
User Settings → Vencord → Discord Profiles
```

From there, profiles can be created and opened without using a terminal.

Profile names may contain:

```text
A-Z
a-z
0-9
_
-
```

Names are limited to 64 characters. Paths and traversal sequences such as `../profile` are rejected.

## Startup Profile Chooser

The optional startup chooser runs in a small standalone Electron window before Discord's original application, login screen, renderer, Vencord plugins, or themes are loaded.

<!-- Add a screenshot or GIF of the startup chooser listing Default, Personal, and Work. -->

Enable it from:

```text
User Settings → Vencord → Show profile chooser on startup
```

Restart Discord after changing the setting. A normal Discord launch will then offer `Default` and every valid isolated profile. Explicit `--vencord-profile` and `--multi-instance` launches continue directly without showing the chooser.

The profile manager also provides an `Open Profile Chooser` button for testing or reopening it manually. The chooser uses a separate Vencord-owned Electron data directory and single-instance lock, so it does not compete with Default or isolated Discord processes.

Profile icons are deterministic local initials. The chooser does not inspect Discord account data, tokens, cookies, usernames, user IDs, or avatars.

## Command-line usage

Profiles can also be launched directly:

```bash
discord --vencord-profile=personal
discord --vencord-profile=work
```

The split argument form is also supported:

```bash
discord --vencord-profile personal
```

Launching the same profile twice retains Discord’s normal single-instance behavior.

### Same-profile multi-instance mode

```bash
discord --multi-instance
```

This permits multiple Discord processes to use the same data directory.

It is not recommended for separate accounts because concurrent Chromium access to one profile may cause data races or corruption. Isolated profiles should be used instead.

## Architecture

The implementation runs primarily in Electron’s main process rather than as a normal renderer plugin.

Main components:

```text
src/main/earlyStartup.ts
```

Parses the selected profile before Discord and Vencord settings initialize, snapshots the original data paths, and configures Electron’s isolated `userData` directory.

```text
src/main/multiInstance.ts
```

Contains profile argument parsing, validation, deterministic path derivation, directory-name parsing, and launch-environment sanitization.

```text
src/main/discordProfiles.ts
src/main/discordProfileOperations.ts
```

Implements profile discovery, creation, shared process launching, folder opening, and narrowly scoped IPC handlers.

```text
src/main/profilePickerBootstrap.ts
src/main/profilePickerMain.ts
src/main/profilePickerPreload.ts
src/main/profilePicker.html
```

Decides whether the normal runtime or isolated chooser should start, owns the chooser-only lock and window, and exposes its four-method sandboxed bridge.

```text
src/shared/DiscordProfiles.ts
```

Provides shared validation, result types, error codes, and case-insensitive collision checks.

```text
src/components/settings/tabs/vencord/DiscordProfiles.tsx
```

Provides the React-based profile manager interface.

## Security decisions

The profile manager:

* Never reads or displays Discord authentication tokens
* Never copies cookies or browser storage
* Never accepts arbitrary filesystem paths from the renderer
* Never exposes generic filesystem or process execution APIs
* Validates profile names again in the main process
* Launches Discord using argument arrays with `shell: false`
* Rejects symbolic-link profile directories during discovery
* Restricts discovery to the expected Discord profile parent
* Returns profile names rather than filesystem paths through IPC
* Sanitizes `DISCORD_USER_DATA_DIR` before launching another profile
* Runs the chooser with sandboxing, context isolation, no Node integration, and a restrictive Content Security Policy
* Does not load Discord's renderer, Vencord plugins, themes, or original `app.asar` while choosing

Profile deletion is intentionally not included because reliably detecting whether a profile is currently running is not straightforward across all supported operating systems.

## Platform status

| Platform     | Profile manager | Startup chooser validation |
| ------------ | --------------: | -------------------------: |
| Debian Linux |          Passed |                    Pending |
| Windows      |     Implemented |                    Pending |
| macOS        |     Implemented |                    Pending |

The launcher uses Electron’s current executable path and Node’s cross-platform process APIs. No operating-system-specific Discord installation path is hardcoded.

## Installation from source

### Requirements

* Node.js 22 or newer
* pnpm 11.9
* An existing supported Discord desktop installation

Clone the repository:

```bash
git clone https://github.com/misaelucas/Vencord.git

cd Vencord
```

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Build and inject:

```bash
pnpm build
pnpm inject
```

Restart Discord after installation.

### Surviving Discord updates on Linux

Discord updates replace the injected `app.asar`. Install the user-level update guard once to route both terminal and application-menu launches through a stable launcher outside Discord's versioned installation directory:

```bash
pnpm installUpdateGuard
pnpm repairDiscord
```

The guard checks the currently selected Discord version before every launch. When an update removes Vencord, it uses the cached development installer and current `dist` build to restore the injection, then forwards every original Discord argument unchanged. It checks again after Discord exits because Discord can install a clean version while running.

The installation creates only these user-level entries:

```text
~/.local/bin/discord
~/.local/share/applications/discord.desktop
```

The local desktop entry overrides Discord's system entry without modifying `/usr/bin/discord` or `/usr/share/applications/discord.desktop`, so normal Discord package updates do not overwrite the guard. Keep this repository and its `dist` build at the same location while using the development injection.

Remove the guard with:

```bash
pnpm uninstallUpdateGuard
```

### Uninstall

From the repository:

```bash
pnpm uninject
```

## Validation

The implementation passes:

```bash
pnpm install --frozen-lockfile
pnpm testTsc
pnpm lint
pnpm lint-styles
pnpm testProfilePicker
pnpm testUpdateGuard
pnpm build
pnpm buildWeb --skip-extension
pnpm test
```

The profile manager has been manually tested on Debian with multiple persistent Discord accounts. The startup chooser still requires the manual platform matrix described in the implementation handoff.

## Current limitations

* Windows and macOS still require manual end-to-end validation.
* The startup chooser still requires manual end-to-end validation on all platforms.
* macOS Finder or Dock launches may activate an existing application process instead of starting a new chooser process; direct executable launches require separate validation.
* Profile directories must currently be removed manually.
* Multiple profiles may share the same Discord taskbar or dock identity.
* Discord updates could change internal data-directory initialization behavior.
* Explicit same-profile multi-instance mode can risk Chromium profile corruption.

## Upstream project

This repository is a fork of:

* [Vendicated/Vencord](https://github.com/Vendicated/Vencord)

Vencord is maintained by Vendicated and its contributors. This profile manager is an independent extension and is not endorsed or maintained by the upstream Vencord project.

## License

Vencord and the modifications in this fork are distributed under the GNU General Public License, version 3 or later.

See [LICENSE](./LICENSE).

## Disclaimer

Discord is a trademark of Discord Inc. Its use here is solely descriptive and does not imply affiliation with or endorsement by Discord Inc.

Discord client modifications may violate Discord’s Terms of Service. Use this software at your own discretion.
