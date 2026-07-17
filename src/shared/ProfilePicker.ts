/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const enum ProfilePickerIpcEvents {
    LIST_PROFILES = "VencordProfilePickerListProfiles",
    SELECT_PROFILE = "VencordProfilePickerSelectProfile",
    OPEN_MANAGER = "VencordProfilePickerOpenManager",
    QUIT = "VencordProfilePickerQuit"
}

export type ProfilePickerResult<T = void> =
    | { ok: true; value: T; }
    | { ok: false; error: string; };

export interface ProfilePickerApi {
    listProfiles(): Promise<ProfilePickerResult<string[]>>;
    selectProfile(profile: string | null): Promise<ProfilePickerResult>;
    openManager(): Promise<ProfilePickerResult>;
    quit(): Promise<void>;
}
