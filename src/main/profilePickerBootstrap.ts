/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { mkdirSync, readFileSync } from "fs";
import { join } from "path";

import { configureEarlyStartup, SHARED_VENCORD_DATA_DIR } from "./earlyStartup";
import { parseProfilePickerSetting, shouldShowProfilePicker } from "./profilePicker";

function readProfilePickerSetting(): boolean {
    try {
        const settingsFile = join(SHARED_VENCORD_DATA_DIR, "settings", "settings.json");
        return parseProfilePickerSetting(readFileSync(settingsFile, "utf-8"));
    } catch (error: any) {
        if (error?.code !== "ENOENT") {
            console.error("[Vencord] Failed to read the startup profile chooser setting; continuing normally.");
        }
        return false;
    }
}

export async function runMainBootstrap(): Promise<void> {
    if (!IS_DISCORD_DESKTOP) {
        await import("./runtime");
        return;
    }

    configureEarlyStartup(process.argv);

    if (!shouldShowProfilePicker(process.argv, readProfilePickerSetting())) {
        await import("./runtime");
        return;
    }

    const pickerDataDirectory = join(SHARED_VENCORD_DATA_DIR, "ProfilePicker");
    mkdirSync(pickerDataDirectory, { recursive: true });
    app.setPath("userData", pickerDataDirectory);
    app.setPath("sessionData", pickerDataDirectory);

    const { runProfilePicker } = await import("./profilePickerMain");
    await runProfilePicker();
}
