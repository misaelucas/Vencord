/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DiscordProfileErrorCode, DiscordProfileResult, DiscordProfilesState, InvalidProfileArgumentError, profileNamesCollide, validateProfileName } from "@shared/DiscordProfiles";
import { IpcEvents } from "@shared/IpcEvents";
import { spawn } from "child_process";
import { app, ipcMain, shell } from "electron";
import { lstat, mkdir, readdir, rmdir } from "fs/promises";
import { dirname } from "path";

import { CURRENT_DISCORD_PROFILE, ORIGINAL_DISCORD_USER_DATA_DIR, ORIGINAL_DISCORD_USER_DATA_ROOT } from "./earlyStartup";
import { createProfileLaunchEnvironment, deriveProfilePaths, parseProfileDirectoryName } from "./multiInstance";

class ProfileManagerError extends Error {
    constructor(public code: DiscordProfileErrorCode, message: string) {
        super(message);
    }
}

function success<T>(value: T): DiscordProfileResult<T> {
    return { ok: true, value };
}

function failure<T>(code: DiscordProfileErrorCode, message: string): DiscordProfileResult<T> {
    return { ok: false, error: { code, message } };
}

async function safely<T>(
    fallbackCode: DiscordProfileErrorCode,
    fallbackMessage: string,
    operation: () => Promise<T>
): Promise<DiscordProfileResult<T>> {
    try {
        return success(await operation());
    } catch (error) {
        if (error instanceof ProfileManagerError) {
            return failure(error.code, error.message);
        }

        const errorCode = typeof error === "object" && error != null && "code" in error
            ? ` (${String(error.code)})`
            : "";
        console.error(`[Vencord] Discord Profiles: ${fallbackMessage}${errorCode}`);
        return failure(fallbackCode, fallbackMessage);
    }
}

function validatedProfileName(profile: unknown): string {
    if (typeof profile !== "string") {
        throw new ProfileManagerError("INVALID_NAME", "The profile name is invalid.");
    }

    try {
        return validateProfileName(profile);
    } catch (error) {
        if (error instanceof InvalidProfileArgumentError) {
            throw new ProfileManagerError("INVALID_NAME", error.message);
        }
        throw error;
    }
}

function compareProfileNames(first: string, second: string): number {
    const normalizedFirst = first.toLowerCase();
    const normalizedSecond = second.toLowerCase();

    if (normalizedFirst < normalizedSecond) return -1;
    if (normalizedFirst > normalizedSecond) return 1;
    return first < second ? -1 : first > second ? 1 : 0;
}

async function getDiscordProfiles(): Promise<string[]> {
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

async function requireExistingProfile(profile: unknown): Promise<string> {
    const validatedProfile = validatedProfileName(profile);
    const profiles = await getDiscordProfiles();

    if (!profiles.includes(validatedProfile)) {
        throw new ProfileManagerError("PROFILE_NOT_FOUND", "That Discord profile does not exist.");
    }

    return validatedProfile;
}

async function createDiscordProfile(profile: unknown): Promise<void> {
    const validatedProfile = validatedProfileName(profile);
    const profiles = await getDiscordProfiles();

    if (profiles.some(existingProfile => profileNamesCollide(existingProfile, validatedProfile))) {
        throw new ProfileManagerError("PROFILE_EXISTS", "A profile with that name already exists.");
    }

    const paths = deriveProfilePaths(ORIGINAL_DISCORD_USER_DATA_DIR, validatedProfile);
    let createdRoot = false;

    try {
        await mkdir(paths.root);
        createdRoot = true;
        await mkdir(paths.userData);
    } catch (error: any) {
        if (error?.code === "EEXIST") {
            throw new ProfileManagerError("PROFILE_EXISTS", "A profile with that name already exists.");
        }

        if (createdRoot) await rmdir(paths.root).catch(() => void 0);
        throw error;
    }
}

async function launchDiscordProfile(profile: unknown): Promise<void> {
    const validatedProfile = await requireExistingProfile(profile);
    const executable = app.getPath("exe");
    const environment = createProfileLaunchEnvironment(process.env, ORIGINAL_DISCORD_USER_DATA_ROOT);
    const child = spawn(executable, [`--vencord-profile=${validatedProfile}`], {
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

async function openDiscordProfileFolder(profile: unknown): Promise<void> {
    const validatedProfile = await requireExistingProfile(profile);
    const { userData } = deriveProfilePaths(ORIGINAL_DISCORD_USER_DATA_DIR, validatedProfile);
    const error = await shell.openPath(userData);

    if (error) throw new Error(error);
}

let profileMutationQueue = Promise.resolve();

function serializeProfileMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = profileMutationQueue.then(operation, operation);
    profileMutationQueue = result.then(() => void 0, () => void 0);
    return result;
}

if (IS_DISCORD_DESKTOP) {
    ipcMain.handle(IpcEvents.GET_DISCORD_PROFILES, () =>
        safely<DiscordProfilesState>("LIST_FAILED", "Failed to list Discord profiles.", async () => ({
            currentProfile: CURRENT_DISCORD_PROFILE,
            profiles: await getDiscordProfiles()
        }))
    );

    ipcMain.handle(IpcEvents.CREATE_DISCORD_PROFILE, (_, profile) =>
        safely("CREATE_FAILED", "Failed to create the Discord profile.", () =>
            serializeProfileMutation(() => createDiscordProfile(profile))
        )
    );

    ipcMain.handle(IpcEvents.LAUNCH_DISCORD_PROFILE, (_, profile) =>
        safely("LAUNCH_FAILED", "Failed to open the Discord profile.", () => launchDiscordProfile(profile))
    );

    ipcMain.handle(IpcEvents.OPEN_DISCORD_PROFILE_FOLDER, (_, profile) =>
        safely("OPEN_FOLDER_FAILED", "Failed to open the Discord profile folder.", () => openDiscordProfileFolder(profile))
    );
}
