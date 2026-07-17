#!/bin/sh

# Vencord, a Discord client mod
# Copyright (c) 2026 Vendicated and contributors
# SPDX-License-Identifier: GPL-3.0-or-later

set -u

log() {
    printf '%s\n' "[Vencord Update Guard] $*" >&2
}

notify() {
    if [ "${VENCORD_DISABLE_NOTIFICATIONS:-0}" = "1" ]; then
        return
    fi

    if command -v notify-send >/dev/null 2>&1; then
        notify-send "Vencord Update Guard" "$1" >/dev/null 2>&1 || true
    fi
}

script_path=$(readlink -f -- "$0") || {
    log "Could not resolve the launcher path."
    exit 1
}
repo_dir=${VENCORD_REPO_DIR:-$(CDPATH= cd -- "$(dirname -- "$script_path")/.." && pwd)}
home_dir=${HOME:-}

if [ -z "$home_dir" ]; then
    log "HOME is not set; launching Discord without automatic repair."
    exec "${VENCORD_DISCORD_SYSTEM_LAUNCHER:-/usr/bin/discord}" "$@"
fi

config_home=${VENCORD_DISCORD_CONFIG_HOME:-${XDG_CONFIG_HOME:-"$home_dir/.config"}}
cache_home=${VENCORD_DISCORD_CACHE_HOME:-${XDG_CACHE_HOME:-"$home_dir/.cache"}}
discord_host="$config_home/discord/Discord"
discord_install_directory=$(dirname -- "$discord_host")
system_launcher=${VENCORD_DISCORD_SYSTEM_LAUNCHER:-/usr/bin/discord}
installer=${VENCORD_INSTALLER_PATH:-"$repo_dir/dist/Installer/VencordInstallerCli-linux"}
resources_dir=
lock_held=0

resolve_resources() {
    if [ ! -x "$discord_host" ]; then
        return 1
    fi

    resolved_host=$(readlink -f -- "$discord_host") || return 1
    resources_dir="$(dirname -- "$resolved_host")/resources"
    [ -d "$resources_dir" ]
}

is_injected() {
    [ -f "$resources_dir/app.asar" ] && [ -f "$resources_dir/_app.asar" ]
}

release_lock() {
    if [ "$lock_held" = "1" ]; then
        flock -u 9 >/dev/null 2>&1 || true
        lock_held=0
    fi
}

acquire_lock() {
    if ! command -v flock >/dev/null 2>&1; then
        return 0
    fi

    mkdir -p -- "$cache_home"
    exec 9>"$cache_home/vencord-discord-update-guard.lock"
    if ! flock -w 30 9; then
        log "Timed out waiting for another repair process."
        return 1
    fi

    lock_held=1
}

repair_if_needed() {
    if ! resolve_resources; then
        return 0
    fi

    if is_injected; then
        return 0
    fi

    if [ ! -x "$installer" ]; then
        log "Discord is not injected and the cached installer is missing: $installer"
        notify "Discord updated, but the cached Vencord installer is missing. Run pnpm inject from the repository."
        return 1
    fi

    if [ ! -f "$repo_dir/dist/patcher.js" ] || [ ! -f "$repo_dir/dist/profilePickerPreload.js" ]; then
        log "Discord is not injected and the Vencord desktop build is missing."
        notify "Discord updated, but the Vencord build is missing. Run pnpm build from the repository."
        return 1
    fi

    if ! acquire_lock; then
        return 1
    fi

    # Another guarded launch may have completed the repair while we waited.
    if ! resolve_resources || is_injected; then
        release_lock
        return 0
    fi

    log "Discord update detected; restoring Vencord in $(dirname -- "$resources_dir")."
    if ! VENCORD_USER_DATA_DIR="$repo_dir" VENCORD_DEV_INSTALL=1 "$installer" --install --location "$discord_install_directory"; then
        release_lock
        log "Automatic Vencord repair failed; continuing with Discord."
        notify "Automatic repair failed. Run pnpm inject from the Vencord repository."
        return 1
    fi

    if ! resolve_resources || ! is_injected; then
        release_lock
        log "The installer finished, but the current Discord version is still not injected."
        notify "The Vencord installer finished without patching the current Discord version."
        return 1
    fi

    release_lock
    log "Vencord was restored successfully."
    notify "Vencord was restored after a Discord update."
    return 0
}

repair_status=0
repair_if_needed || repair_status=$?

if [ "${1:-}" = "--vencord-repair-only" ]; then
    exit "$repair_status"
fi

if [ ! -x "$system_launcher" ]; then
    log "Discord launcher not found: $system_launcher"
    exit 1
fi

"$system_launcher" "$@"
discord_status=$?

# Discord can install a clean version while it is running. Repair that new
# current version after Discord exits so the following launch stays injected.
repair_if_needed || true

exit "$discord_status"
