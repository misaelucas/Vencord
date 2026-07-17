/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { InvalidProfileArgumentError, validateProfileName } from "@shared/DiscordProfiles";
import { spawn } from "child_process";
import { app } from "electron";
import { lstat, readdir } from "fs/promises";
import { dirname } from "path";

import { ORIGINAL_DISCORD_USER_DATA_DIR, ORIGINAL_DISCORD_USER_DATA_ROOT } from "./earlyStartup";
import { createProfileLaunchEnvironment, deriveProfilePaths, parseProfileDirectoryName } from "./multiInstance";
import { buildOpenProfilePickerArguments, buildProfileLaunchArguments } from "./profilePicker";

export function validateProfileInput(profile: unknown): string {
    if (typeof profile !== "string") {
        throw new InvalidProfileArgumentError("The profile name is invalid.");
    }

    return validateProfileName(profile);
}

function compareProfileNames(first: string, second: string): number {
    const normalizedFirst = first.toLowerCase();
    const normalizedSecond = second.toLowerCase();

    if (normalizedFirst < normalizedSecond) return -1;
    if (normalizedFirst > normalizedSecond) return 1;
    return first < second ? -1 : first > second ? 1 : 0;
}

export async function getDiscordProfiles(): Promise<string[]> {
    const profileParent = dirname(ORIGINAL_DISCORD_USER_DATA_DIR);
    let entries;

    try {
        entries = await readdir(profileParent, { withFileTypes: true });
    } catch (error: any) {
        if (error?.code === "ENOENT") return [];
        throw error;
    }

    const profiles: string[] = [];

    for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;

        const profile = parseProfileDirectoryName(ORIGINAL_DISCORD_USER_DATA_DIR, entry.name);
        if (profile == null) continue;

        const paths = deriveProfilePaths(ORIGINAL_DISCORD_USER_DATA_DIR, profile);

        try {
            const [rootInfo, userDataInfo] = await Promise.all([
                lstat(paths.root),
                lstat(paths.userData)
            ]);

            if (
                rootInfo.isSymbolicLink() || !rootInfo.isDirectory()
                || userDataInfo.isSymbolicLink() || !userDataInfo.isDirectory()
            ) continue;
        } catch {
            continue;
        }

        profiles.push(profile);
    }

    return profiles.sort(compareProfileNames);
}

export async function requireExistingProfile(profile: unknown): Promise<string> {
    const validatedProfile = validateProfileInput(profile);
    const profiles = await getDiscordProfiles();

    if (!profiles.includes(validatedProfile)) {
        throw new Error("That Discord profile does not exist.");
    }

    return validatedProfile;
}

export async function spawnDiscordProcess(args: readonly string[]): Promise<void> {
    const executable = app.getPath("exe");
    const environment = createProfileLaunchEnvironment(process.env, ORIGINAL_DISCORD_USER_DATA_ROOT);
    const child = spawn(executable, args, {
        cwd: dirname(executable),
        detached: true,
        env: environment,
        shell: false,
        stdio: "ignore",
        windowsHide: true
    });

    await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("spawn", resolve);
    });

    child.unref();
}

export async function launchDiscordProfile(profile: unknown): Promise<void> {
    const validatedProfile = await requireExistingProfile(profile);
    await spawnDiscordProcess(buildProfileLaunchArguments(validatedProfile));
}

export async function launchProfilePicker(): Promise<void> {
    await spawnDiscordProcess(buildOpenProfilePickerArguments());
}

export async function launchProfilePickerSelection(profile: unknown): Promise<void> {
    if (profile == null) {
        await spawnDiscordProcess(buildProfileLaunchArguments(null));
        return;
    }

    const validatedProfile = await requireExistingProfile(profile);
    await spawnDiscordProcess(buildProfileLaunchArguments(validatedProfile));
}
