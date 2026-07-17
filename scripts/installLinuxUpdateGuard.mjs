/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawnSync } from "child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const MARKER = "X-Vencord-Update-Guard=true";
const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const launcherSource = join(scriptsDirectory, "launchDiscord.sh");
const binDirectory = process.env.VENCORD_LAUNCHER_BIN_DIR ?? join(homedir(), ".local", "bin");
const applicationsDirectory = process.env.VENCORD_APPLICATIONS_DIR ?? join(homedir(), ".local", "share", "applications");
const systemDesktopFile = process.env.VENCORD_SYSTEM_DESKTOP_FILE ?? "/usr/share/applications/discord.desktop";
const desktopDatabaseCommand = process.env.VENCORD_UPDATE_DESKTOP_DATABASE ?? "update-desktop-database";
const launcherLink = join(binDirectory, "discord");
const desktopFile = join(applicationsDirectory, "discord.desktop");

function pathExists(path) {
    try {
        lstatSync(path);
        return true;
    } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
    }
}

function linkedSource(path) {
    if (!pathExists(path) || !lstatSync(path).isSymbolicLink()) return null;
    return resolve(dirname(path), readlinkSync(path));
}

function desktopExecPath(path) {
    return `"${path.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("`", "\\`").replaceAll("$", "\\$").replaceAll("%", "%%")}"`;
}

function refreshDesktopDatabase() {
    const result = spawnSync(desktopDatabaseCommand, [applicationsDirectory], { stdio: "ignore" });
    if (result.error?.code !== "ENOENT" && result.status !== 0) {
        console.warn("Could not refresh the desktop application database; the launcher is still installed.");
    }
}

function install() {
    if (process.platform !== "linux") throw new Error("The Discord update guard is currently supported only on Linux.");
    if (!existsSync(launcherSource)) throw new Error(`Launcher source is missing: ${launcherSource}`);
    if (!existsSync(systemDesktopFile)) throw new Error(`System Discord desktop entry is missing: ${systemDesktopFile}`);

    mkdirSync(binDirectory, { recursive: true });
    mkdirSync(applicationsDirectory, { recursive: true });

    if (pathExists(desktopFile) && !readFileSync(desktopFile, "utf8").includes(MARKER)) {
        throw new Error(`Refusing to replace an unrelated desktop entry: ${desktopFile}`);
    }
    if (pathExists(launcherLink) && linkedSource(launcherLink) !== launcherSource) {
        throw new Error(`Refusing to replace an existing launcher: ${launcherLink}`);
    }
    if (!pathExists(launcherLink)) symlinkSync(launcherSource, launcherLink);

    const systemEntry = readFileSync(systemDesktopFile, "utf8");
    if (!/^Exec=.*$/m.test(systemEntry)) throw new Error("The system Discord desktop entry has no Exec line.");

    const guardedEntry = systemEntry
        .replace("[Desktop Entry]", `[Desktop Entry]\n${MARKER}`)
        .replace(/^Exec=.*$/m, `Exec=${desktopExecPath(launcherLink)} --url -- %u`);
    const temporaryDesktopFile = `${desktopFile}.${process.pid}.tmp`;

    writeFileSync(temporaryDesktopFile, guardedEntry, { mode: 0o644 });
    renameSync(temporaryDesktopFile, desktopFile);
    refreshDesktopDatabase();

    console.log(`Installed terminal launcher: ${launcherLink}`);
    console.log(`Installed desktop launcher: ${desktopFile}`);
}

function uninstall() {
    if (linkedSource(launcherLink) === launcherSource) unlinkSync(launcherLink);
    if (pathExists(desktopFile) && readFileSync(desktopFile, "utf8").includes(MARKER)) unlinkSync(desktopFile);
    refreshDesktopDatabase();
    console.log("Removed the Vencord Discord update guard.");
}

if (process.argv.includes("--uninstall")) uninstall();
else install();
