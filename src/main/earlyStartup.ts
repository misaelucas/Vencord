/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { mkdirSync } from "fs";
import { basename, join } from "path";

import { deriveProfilePaths, InvalidProfileArgumentError, parseProfileArgument } from "./multiInstance";

export const ORIGINAL_DISCORD_USER_DATA_ROOT = process.env.DISCORD_USER_DATA_DIR;
export const ORIGINAL_ELECTRON_USER_DATA_DIR = app.getPath("userData");
export const ORIGINAL_DISCORD_USER_DATA_DIR = ORIGINAL_DISCORD_USER_DATA_ROOT
    ? join(ORIGINAL_DISCORD_USER_DATA_ROOT, basename(ORIGINAL_ELECTRON_USER_DATA_DIR))
    : ORIGINAL_ELECTRON_USER_DATA_DIR;
export let CURRENT_DISCORD_PROFILE: string | null = null;

if (IS_DISCORD_DESKTOP) {
    let profile: string | null;

    try {
        profile = parseProfileArgument(process.argv);
        CURRENT_DISCORD_PROFILE = profile;
    } catch (error) {
        if (!(error instanceof InvalidProfileArgumentError)) throw error;

        console.error(`[Vencord] Invalid profile: ${error.message}.`);
        app.exit(1);
        process.exit(1);
    }

    if (profile != null) {
        const profilePaths = deriveProfilePaths(ORIGINAL_DISCORD_USER_DATA_DIR, profile);

        // Discord later derives the same channel directory from this root.
        mkdirSync(profilePaths.userData, { recursive: true });
        app.setPath("userData", profilePaths.userData);
        process.env.DISCORD_USER_DATA_DIR = profilePaths.root;

        console.info(`[Vencord] Using isolated Discord profile "${profile}".`);
    }
}
