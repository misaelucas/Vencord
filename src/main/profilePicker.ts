/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { validateProfileName } from "@shared/DiscordProfiles";

import { parseProfileArgument } from "./multiInstance";

export const PROFILE_PICKER_SKIP_ARGUMENT = "--vencord-skip-profile-picker";
export const PROFILE_PICKER_OPEN_ARGUMENT = "--vencord-open-profile-picker";

export function shouldShowProfilePicker(argv: readonly string[], settingEnabled: boolean): boolean {
    if (
        argv.includes(PROFILE_PICKER_SKIP_ARGUMENT)
        || parseProfileArgument(argv) != null
        || argv.includes("--multi-instance")
    ) return false;

    if (argv.includes(PROFILE_PICKER_OPEN_ARGUMENT)) return true;

    return settingEnabled;
}

export function buildProfileLaunchArguments(profile: string | null): string[] {
    return profile == null
        ? [PROFILE_PICKER_SKIP_ARGUMENT]
        : [`--vencord-profile=${validateProfileName(profile)}`, PROFILE_PICKER_SKIP_ARGUMENT];
}

export function buildOpenProfilePickerArguments(): string[] {
    return [PROFILE_PICKER_OPEN_ARGUMENT];
}

export function parseProfilePickerSetting(contents: string): boolean {
    const settings = JSON.parse(contents);
    return typeof settings === "object"
        && settings != null
        && settings.showProfilePickerOnStartup === true;
}

export type LaunchGuardResult<T> =
    | { started: false; }
    | { started: true; value: T; };

export function createSingleLaunchGuard() {
    let launching = false;

    return async function run<T>(operation: () => Promise<T>): Promise<LaunchGuardResult<T>> {
        if (launching) return { started: false };

        launching = true;

        try {
            return { started: true, value: await operation() };
        } catch (error) {
            launching = false;
            throw error;
        }
    };
}
