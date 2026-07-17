/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const PROFILE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export const MAX_PROFILE_NAME_LENGTH = 64;

export class InvalidProfileArgumentError extends Error { }

export function validateProfileName(profile: string): string {
    if (!profile) {
        throw new InvalidProfileArgumentError("profile names must not be empty");
    }

    if (profile.length > MAX_PROFILE_NAME_LENGTH) {
        throw new InvalidProfileArgumentError(
            `profile names must be at most ${MAX_PROFILE_NAME_LENGTH} characters long`
        );
    }

    if (!PROFILE_NAME_PATTERN.test(profile)) {
        throw new InvalidProfileArgumentError(
            "profile names may only contain ASCII letters, numbers, underscores, and hyphens"
        );
    }

    return profile;
}

export function profileNamesCollide(first: string, second: string): boolean {
    return first.toLowerCase() === second.toLowerCase();
}

export interface DiscordProfilesState {
    currentProfile: string | null;
    profiles: string[];
}

export type DiscordProfileErrorCode =
    | "INVALID_NAME"
    | "PROFILE_EXISTS"
    | "PROFILE_NOT_FOUND"
    | "LIST_FAILED"
    | "CREATE_FAILED"
    | "LAUNCH_FAILED"
    | "OPEN_FOLDER_FAILED"
    | "OPEN_PICKER_FAILED"
    | "UNSUPPORTED";

export type DiscordProfileResult<T = void> =
    | { ok: true; value: T; }
    | { ok: false; error: { code: DiscordProfileErrorCode; message: string; }; };
