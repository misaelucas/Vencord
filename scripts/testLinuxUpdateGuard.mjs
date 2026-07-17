/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "assert/strict";
import { spawnSync } from "child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const launcher = join(scriptsDirectory, "launchDiscord.sh");
const installerScript = join(scriptsDirectory, "installLinuxUpdateGuard.mjs");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "vencord-update-guard-"));

function writeExecutable(path, contents) {
    writeFileSync(path, contents);
    chmodSync(path, 0o755);
}

function run(command, args, environment) {
    return spawnSync(command, args, {
        encoding: "utf8",
        env: { ...process.env, ...environment }
    });
}

try {
    const configHome = join(temporaryDirectory, "config");
    const cacheHome = join(temporaryDirectory, "cache");
    const versionDirectory = join(configHome, "discord", "app-1.0.test");
    const resourcesDirectory = join(versionDirectory, "resources");
    const discordHost = join(versionDirectory, "Discord");
    const currentDiscord = join(configHome, "discord", "Discord");
    const fakeInstaller = join(temporaryDirectory, "installer");
    const fakeDiscordLauncher = join(temporaryDirectory, "discord-system");
    const installerLog = join(temporaryDirectory, "installer.log");
    const launcherLog = join(temporaryDirectory, "launcher.log");

    mkdirSync(resourcesDirectory, { recursive: true });
    writeExecutable(discordHost, "#!/bin/sh\nexit 0\n");
    writeFileSync(join(resourcesDirectory, "app.asar"), "stock-discord");
    symlinkSync(discordHost, currentDiscord);
    writeExecutable(fakeInstaller, `#!/bin/sh
printf '%s|%s|%s\\n' "$*" "$VENCORD_USER_DATA_DIR" "$VENCORD_DEV_INSTALL" >> "$VENCORD_TEST_INSTALL_LOG"
cp "$VENCORD_TEST_RESOURCES/app.asar" "$VENCORD_TEST_RESOURCES/_app.asar"
printf 'vencord-loader\\n' > "$VENCORD_TEST_RESOURCES/app.asar"
`);
    writeExecutable(fakeDiscordLauncher, `#!/bin/sh
printf '%s\\n' "$@" > "$VENCORD_TEST_LAUNCH_LOG"
exit 0
`);

    const launcherEnvironment = {
        VENCORD_DISABLE_NOTIFICATIONS: "1",
        VENCORD_DISCORD_CONFIG_HOME: configHome,
        VENCORD_DISCORD_CACHE_HOME: cacheHome,
        VENCORD_DISCORD_SYSTEM_LAUNCHER: fakeDiscordLauncher,
        VENCORD_INSTALLER_PATH: fakeInstaller,
        VENCORD_TEST_INSTALL_LOG: installerLog,
        VENCORD_TEST_LAUNCH_LOG: launcherLog,
        VENCORD_TEST_RESOURCES: resourcesDirectory
    };

    const firstLaunch = run(launcher, ["--vencord-profile=work", "--multi-instance"], launcherEnvironment);
    assert.equal(firstLaunch.status, 0, firstLaunch.stderr);
    assert.equal(readFileSync(installerLog, "utf8").trim().split("\n").length, 1);
    assert.match(readFileSync(installerLog, "utf8"), new RegExp(`^--install --location ${configHome}/discord\\|.+\\|1\\n$`));
    assert.deepEqual(readFileSync(launcherLog, "utf8").trim().split("\n"), ["--vencord-profile=work", "--multi-instance"]);
    assert.equal(existsSync(join(resourcesDirectory, "_app.asar")), true);

    const secondLaunch = run(launcher, ["--vencord-profile=personal"], launcherEnvironment);
    assert.equal(secondLaunch.status, 0, secondLaunch.stderr);
    assert.equal(readFileSync(installerLog, "utf8").trim().split("\n").length, 1, "An injected install must not be repaired again.");
    assert.equal(readFileSync(launcherLog, "utf8").trim(), "--vencord-profile=personal");

    const updatingDiscordLauncher = join(temporaryDirectory, "discord-system-updating");
    writeExecutable(updatingDiscordLauncher, `#!/bin/sh
rm "$VENCORD_TEST_RESOURCES/_app.asar"
printf 'updated-stock-discord\\n' > "$VENCORD_TEST_RESOURCES/app.asar"
exit 0
`);
    const updateDuringLaunch = run(launcher, [], {
        ...launcherEnvironment,
        VENCORD_DISCORD_SYSTEM_LAUNCHER: updatingDiscordLauncher
    });
    assert.equal(updateDuringLaunch.status, 0, updateDuringLaunch.stderr);
    assert.equal(readFileSync(installerLog, "utf8").trim().split("\n").length, 2, "An update installed while Discord runs must be repaired after exit.");
    assert.equal(existsSync(join(resourcesDirectory, "_app.asar")), true);

    unlinkSync(join(resourcesDirectory, "_app.asar"));
    const failingInstaller = join(temporaryDirectory, "failing-installer");
    writeExecutable(failingInstaller, "#!/bin/sh\nexit 1\n");
    const fallbackLaunch = run(launcher, [], { ...launcherEnvironment, VENCORD_INSTALLER_PATH: failingInstaller });
    assert.equal(fallbackLaunch.status, 0, "Discord must still launch when repair fails.");
    assert.match(fallbackLaunch.stderr, /Automatic Vencord repair failed/);

    const installRoot = join(temporaryDirectory, "install");
    const binDirectory = join(installRoot, "bin");
    const applicationsDirectory = join(installRoot, "applications");
    const systemDesktopFile = join(installRoot, "discord.desktop");
    mkdirSync(installRoot, { recursive: true });
    writeFileSync(systemDesktopFile, "[Desktop Entry]\nName=Discord\nExec=/usr/bin/discord --url -- %u\nType=Application\n");

    const installEnvironment = {
        VENCORD_LAUNCHER_BIN_DIR: binDirectory,
        VENCORD_APPLICATIONS_DIR: applicationsDirectory,
        VENCORD_SYSTEM_DESKTOP_FILE: systemDesktopFile,
        VENCORD_UPDATE_DESKTOP_DATABASE: "/bin/true"
    };
    const installResult = run(process.execPath, [installerScript], installEnvironment);
    assert.equal(installResult.status, 0, installResult.stderr);
    const installedLink = join(binDirectory, "discord");
    const installedDesktop = join(applicationsDirectory, "discord.desktop");
    assert.equal(lstatSync(installedLink).isSymbolicLink(), true);
    assert.equal(resolve(dirname(installedLink), readlinkSync(installedLink)), launcher);
    assert.match(readFileSync(installedDesktop, "utf8"), /X-Vencord-Update-Guard=true/);
    assert.match(readFileSync(installedDesktop, "utf8"), new RegExp(`^Exec="${installedLink}" --url -- %u$`, "m"));

    const uninstallResult = run(process.execPath, [installerScript, "--uninstall"], installEnvironment);
    assert.equal(uninstallResult.status, 0, uninstallResult.stderr);
    assert.equal(existsSync(installedLink), false);
    assert.equal(existsSync(installedDesktop), false);

    console.log("Linux update guard checks passed.");
} finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
}
