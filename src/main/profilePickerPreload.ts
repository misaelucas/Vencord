/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ProfilePickerApi, ProfilePickerIpcEvents } from "@shared/ProfilePicker";
import { contextBridge, ipcRenderer } from "electron/renderer";

const api: ProfilePickerApi = {
    listProfiles: () => ipcRenderer.invoke(ProfilePickerIpcEvents.LIST_PROFILES),
    selectProfile: profile => ipcRenderer.invoke(ProfilePickerIpcEvents.SELECT_PROFILE, profile),
    openManager: () => ipcRenderer.invoke(ProfilePickerIpcEvents.OPEN_MANAGER),
    quit: () => ipcRenderer.invoke(ProfilePickerIpcEvents.QUIT)
};

contextBridge.exposeInMainWorld("VencordProfilePicker", Object.freeze(api));

declare global {
    interface Window {
        VencordProfilePicker: ProfilePickerApi;
    }
}
