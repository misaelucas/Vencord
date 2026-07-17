/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ProfilePickerIpcEvents, ProfilePickerResult } from "@shared/ProfilePicker";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import profilePickerHtml from "file://profilePicker.html?trim=false";
import { join } from "path";

import { getDiscordProfiles, launchProfilePickerSelection } from "./discordProfileOperations";
import { createSingleLaunchGuard } from "./profilePicker";

function success<T>(value: T): ProfilePickerResult<T> {
    return { ok: true, value };
}

function failure(message: string): ProfilePickerResult {
    return { ok: false, error: message };
}

function logPickerError(message: string, error: unknown): void {
    const errorCode = typeof error === "object" && error != null && "code" in error
        ? ` (${String(error.code)})`
        : "";
    console.error(`[Vencord] Profile chooser: ${message}${errorCode}`);
}

export async function runProfilePicker(): Promise<void> {
    let pickerWindow: BrowserWindow | null = null;

    const focusPicker = () => {
        if (pickerWindow == null || pickerWindow.isDestroyed()) return;
        if (pickerWindow.isMinimized()) pickerWindow.restore();
        pickerWindow.show();
        pickerWindow.focus();
    };

    if (!app.requestSingleInstanceLock({ vencordProfilePicker: true })) {
        app.quit();
        return;
    }

    app.on("second-instance", focusPicker);
    app.on("activate", focusPicker);
    app.on("window-all-closed", () => app.quit());

    const launchOnce = createSingleLaunchGuard();
    const isPickerSender = (event: IpcMainInvokeEvent) =>
        pickerWindow != null && !pickerWindow.isDestroyed() && event.sender === pickerWindow.webContents;

    ipcMain.handle(ProfilePickerIpcEvents.LIST_PROFILES, async (event): Promise<ProfilePickerResult<string[]>> => {
        if (!isPickerSender(event)) return { ok: false, error: "Profile chooser request rejected." };

        try {
            return success(await getDiscordProfiles());
        } catch (error) {
            logPickerError("failed to list profiles", error);
            return { ok: false, error: "Could not load Discord profiles." };
        }
    });

    const launchSelection = async (profile: unknown): Promise<ProfilePickerResult> => {
        try {
            const result = await launchOnce(() => launchProfilePickerSelection(profile));
            if (!result.started) return failure("A Discord profile is already opening.");

            app.quit();
            return success(void 0);
        } catch (error) {
            logPickerError("failed to launch Discord", error);
            return failure("Could not open that Discord profile. Please try again.");
        }
    };

    ipcMain.handle(ProfilePickerIpcEvents.SELECT_PROFILE, (event, profile) =>
        isPickerSender(event) ? launchSelection(profile) : failure("Profile chooser request rejected."));
    ipcMain.handle(ProfilePickerIpcEvents.OPEN_MANAGER, event =>
        isPickerSender(event) ? launchSelection(null) : failure("Profile chooser request rejected."));
    ipcMain.handle(ProfilePickerIpcEvents.QUIT, event => {
        if (isPickerSender(event)) app.quit();
    });

    await app.whenReady();

    pickerWindow = new BrowserWindow({
        title: "Discord Profiles",
        width: 760,
        height: 520,
        minWidth: 480,
        minHeight: 420,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: "#111214",
        webPreferences: {
            preload: join(__dirname, "profilePickerPreload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: IS_DEV,
            images: false,
            spellcheck: false,
            partition: "vencord-profile-picker"
        }
    });

    pickerWindow.center();
    pickerWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    pickerWindow.webContents.on("will-navigate", event => event.preventDefault());
    pickerWindow.webContents.on("will-attach-webview", event => event.preventDefault());
    pickerWindow.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
    pickerWindow.once("ready-to-show", () => pickerWindow?.show());
    pickerWindow.on("closed", () => pickerWindow = null);

    await pickerWindow.loadURL(`data:text/html;base64,${Buffer.from(profilePickerHtml).toString("base64")}`);
}
