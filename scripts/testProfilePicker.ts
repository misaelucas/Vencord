/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { strict as assert } from "assert";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import { profileNamesCollide, validateProfileName } from "../src/shared/DiscordProfiles";
import { createProfileLaunchEnvironment, deriveProfilePaths, parseProfileArgument } from "../src/main/multiInstance";
import { buildProfileLaunchArguments, createSingleLaunchGuard, parseProfilePickerSetting, PROFILE_PICKER_OPEN_ARGUMENT, PROFILE_PICKER_SKIP_ARGUMENT, shouldShowProfilePicker } from "../src/main/profilePicker";

assert.equal(shouldShowProfilePicker(["discord"], false), false);
assert.equal(shouldShowProfilePicker(["discord"], true), true);
assert.equal(shouldShowProfilePicker(["discord", "--vencord-profile=personal"], true), false);
assert.equal(shouldShowProfilePicker(["discord", "--vencord-profile", "personal"], true), false);
assert.equal(shouldShowProfilePicker(["discord", "--multi-instance"], true), false);
assert.equal(shouldShowProfilePicker(["discord", PROFILE_PICKER_SKIP_ARGUMENT], true), false);
assert.equal(shouldShowProfilePicker(["discord", PROFILE_PICKER_OPEN_ARGUMENT], false), true);
assert.equal(shouldShowProfilePicker(["discord", PROFILE_PICKER_OPEN_ARGUMENT, PROFILE_PICKER_SKIP_ARGUMENT], true), false);

assert.deepEqual(buildProfileLaunchArguments(null), [PROFILE_PICKER_SKIP_ARGUMENT]);
assert.deepEqual(buildProfileLaunchArguments("personal"), [
    "--vencord-profile=personal",
    PROFILE_PICKER_SKIP_ARGUMENT
]);

assert.equal(parseProfilePickerSetting("{}"), false);
assert.equal(parseProfilePickerSetting('{"showProfilePickerOnStartup":false}'), false);
assert.equal(parseProfilePickerSetting('{"showProfilePickerOnStartup":true}'), true);
assert.throws(() => parseProfilePickerSetting("invalid"));

const inheritedEnvironment = {
    DISCORD_USER_DATA_DIR: "/config/discord-vencord-profile-personal",
    KEEP: "yes"
};
const sanitizedEnvironment = createProfileLaunchEnvironment(inheritedEnvironment, undefined);
const restoredEnvironment = createProfileLaunchEnvironment(inheritedEnvironment, "/config");

assert.equal(sanitizedEnvironment.DISCORD_USER_DATA_DIR, undefined);
assert.equal(sanitizedEnvironment.KEEP, "yes");
assert.equal(restoredEnvironment.DISCORD_USER_DATA_DIR, "/config");
assert.equal(inheritedEnvironment.DISCORD_USER_DATA_DIR, "/config/discord-vencord-profile-personal");

const originalUserData = join(process.cwd(), "config", "discord");
assert.deepEqual(deriveProfilePaths(originalUserData, "work"), {
    root: join(process.cwd(), "config", "discord-vencord-profile-work"),
    userData: join(process.cwd(), "config", "discord-vencord-profile-work", "discord")
});
assert.equal(parseProfileArgument(["discord", "--vencord-profile", "work"]), "work");

for (const validName of ["Personal", "work_2", "profile-3"]) {
    assert.equal(validateProfileName(validName), validName);
}

for (const invalidName of ["", ".", "..", "../test", "personal/test", "personal\\test", "a".repeat(65)]) {
    assert.throws(() => validateProfileName(invalidName));
}
assert.equal(profileNamesCollide("Personal", "personal"), true);

const pickerHtml = readFileSync("src/main/profilePicker.html", "utf-8");
for (const tag of ["style", "script"]) {
    const content = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(pickerHtml)?.[1];
    assert.ok(content, `Missing inline ${tag}`);
    const hash = createHash("sha256").update(content).digest("base64");
    assert.ok(pickerHtml.includes(`'sha256-${hash}'`), `Profile picker CSP has a stale ${tag} hash`);
}

async function main() {
    let releaseFirstLaunch!: (value: string) => void;
    const launchGuard = createSingleLaunchGuard();
    const firstLaunch = launchGuard(() => new Promise<string>(resolve => releaseFirstLaunch = resolve));
    await Promise.resolve();
    assert.deepEqual(await launchGuard(async () => "second"), { started: false });
    releaseFirstLaunch("first");
    assert.deepEqual(await firstLaunch, { started: true, value: "first" });

    const retryGuard = createSingleLaunchGuard();
    await assert.rejects(retryGuard(async () => { throw new Error("simulated failure"); }));
    assert.deepEqual(await retryGuard(async () => "retry"), { started: true, value: "retry" });

    console.log("Profile picker checks passed.");
}

void main();
