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
```

Implements profile discovery, creation, process launching, folder opening, and narrowly scoped IPC handlers.

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

Profile deletion is intentionally not included because reliably detecting whether a profile is currently running is not straightforward across all supported operating systems.

## Platform status

| Platform     | Implementation | Manual validation |
| ------------ | -------------: | ----------------: |
| Debian Linux |      Supported |            Passed |
| Windows      |    Implemented |           Pending |
| macOS        |    Implemented |           Pending |

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
pnpm build
pnpm buildWeb --skip-extension
pnpm test
```

It has also been manually tested on Debian with multiple persistent Discord accounts.

## Current limitations

* Windows and macOS still require manual end-to-end validation.
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
