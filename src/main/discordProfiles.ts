/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DiscordProfileErrorCode, DiscordProfileResult, DiscordProfilesState, InvalidProfileArgumentError, profileNamesCollide, validateProfileName } from "@shared/DiscordProfiles";
import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain, shell } from "electron";
import { mkdir, rmdir } from "fs/promises";

import { getDiscordProfiles, launchDiscordProfile, launchProfilePicker } from "./discordProfileOperations";
import { CURRENT_DISCORD_PROFILE, ORIGINAL_DISCORD_USER_DATA_DIR } from "./earlyStartup";
import { deriveProfilePaths } from "./multiInstance";

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

async function requireManagedExistingProfile(profile: unknown): Promise<string> {
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

async function openDiscordProfileFolder(profile: unknown): Promise<void> {
    const validatedProfile = await requireManagedExistingProfile(profile);
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
        safely("LAUNCH_FAILED", "Failed to open the Discord profile.", async () => {
            const validatedProfile = await requireManagedExistingProfile(profile);
            await launchDiscordProfile(validatedProfile);
        })
    );

    ipcMain.handle(IpcEvents.OPEN_DISCORD_PROFILE_FOLDER, (_, profile) =>
        safely("OPEN_FOLDER_FAILED", "Failed to open the Discord profile folder.", () => openDiscordProfileFolder(profile))
    );

    ipcMain.handle(IpcEvents.OPEN_DISCORD_PROFILE_PICKER, () =>
        safely("OPEN_PICKER_FAILED", "Failed to open the Discord profile chooser.", launchProfilePicker)
    );
}
