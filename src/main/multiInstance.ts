/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { InvalidProfileArgumentError, MAX_PROFILE_NAME_LENGTH, validateProfileName } from "@shared/DiscordProfiles";
import { basename, dirname, join } from "path";

const PROFILE_ARGUMENT = "--vencord-profile";

export { InvalidProfileArgumentError, MAX_PROFILE_NAME_LENGTH, validateProfileName };

export function parseProfileArgument(argv: readonly string[]): string | null {
    let profile: string | null = null;

    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        let value: string | undefined;

        if (argument === PROFILE_ARGUMENT) {
            value = argv[++index];
            if (value == null || value.startsWith("--")) {
                throw new InvalidProfileArgumentError(`${PROFILE_ARGUMENT} requires a profile name`);
            }
        } else if (argument.startsWith(PROFILE_ARGUMENT + "=")) {
            value = argument.slice(PROFILE_ARGUMENT.length + 1);
        } else {
            continue;
        }

        if (profile != null) {
            throw new InvalidProfileArgumentError(`${PROFILE_ARGUMENT} may only be specified once`);
        }

        profile = validateProfileName(value);
    }

    return profile;
}

export interface ProfilePaths {
    root: string;
    userData: string;
}

export function deriveProfilePaths(originalUserData: string, profile: string): ProfilePaths {
    const validatedProfile = validateProfileName(profile);
    const channelDirectory = basename(originalUserData);
    const root = join(dirname(originalUserData), `${channelDirectory}-vencord-profile-${validatedProfile}`);

    return {
        root,
        userData: join(root, channelDirectory)
    };
}

export function parseProfileDirectoryName(originalUserData: string, directoryName: string): string | null {
    const prefix = `${basename(originalUserData)}-vencord-profile-`;
    if (!directoryName.startsWith(prefix)) return null;

    try {
        return validateProfileName(directoryName.slice(prefix.length));
    } catch {
        return null;
    }
}

export function createProfileLaunchEnvironment(
    environment: NodeJS.ProcessEnv,
    originalDiscordUserDataRoot: string | undefined
): NodeJS.ProcessEnv {
    const sanitizedEnvironment = { ...environment };

    if (originalDiscordUserDataRoot == null) {
        delete sanitizedEnvironment.DISCORD_USER_DATA_DIR;
    } else {
        sanitizedEnvironment.DISCORD_USER_DATA_DIR = originalDiscordUserDataRoot;
    }

    return sanitizedEnvironment;
}

export function isMultiInstanceEnabled(argv: readonly string[], setting: boolean | undefined): boolean {
    return setting === true || argv.includes("--multi-instance");
}
