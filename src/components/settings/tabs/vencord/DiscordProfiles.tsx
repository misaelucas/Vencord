/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./DiscordProfiles.css";

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { ErrorCard } from "@components/ErrorCard";
import { Paragraph } from "@components/Paragraph";
import { DiscordProfilesState, InvalidProfileArgumentError, MAX_PROFILE_NAME_LENGTH, profileNamesCollide, validateProfileName } from "@shared/DiscordProfiles";
import { Margins } from "@utils/margins";
import type { RenderModalProps } from "@vencord/discord-types";
import { Forms, Modal, openModal, React, showToast, TextInput, useEffect, useState } from "@webpack/common";

function getProfileNameError(profile: string, existingProfiles: readonly string[]): string | null {
    try {
        validateProfileName(profile);
    } catch (error) {
        if (error instanceof InvalidProfileArgumentError) return error.message;
        throw error;
    }

    if (existingProfiles.some(existingProfile => profileNamesCollide(existingProfile, profile))) {
        return "A profile with that name already exists.";
    }

    return null;
}

interface CreateProfileModalProps extends RenderModalProps {
    existingProfiles: readonly string[];
    onCreated(): Promise<void>;
}

function CreateProfileModal(props: CreateProfileModalProps) {
    const { existingProfiles, onClose, onCreated, ...modalProps } = props;
    const [profile, setProfile] = useState("");
    const [requestError, setRequestError] = useState<string>();
    const [isCreating, setIsCreating] = useState(false);
    const validationError = getProfileNameError(profile, existingProfiles);

    async function createProfile() {
        if (validationError != null) return;

        setIsCreating(true);
        setRequestError(void 0);

        const result = await VencordNative.discordProfiles.create(profile);
        if (!result.ok) {
            setRequestError(result.error.message);
            setIsCreating(false);
            return;
        }

        await onCreated();
        onClose();
    }

    return (
        <Modal {...modalProps} onClose={onClose} size="sm" title="Create Discord Profile">
            <Forms.FormTitle tag="h5">Profile name</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8}>
                Use letters, numbers, underscores, or hyphens.
            </Forms.FormText>
            <TextInput
                autoFocus
                error={requestError ?? (profile.length > 0 ? validationError ?? undefined : undefined)}
                maxLength={MAX_PROFILE_NAME_LENGTH}
                onChange={value => {
                    setProfile(value);
                    setRequestError(void 0);
                }}
                placeholder="personal"
                value={profile}
            />
            <div className="vc-discord-profiles-modal-actions">
                <Button disabled={isCreating} onClick={onClose} variant="secondary">Cancel</Button>
                <Button disabled={isCreating || validationError != null} onClick={createProfile}>
                    {isCreating ? "Creating…" : "Create"}
                </Button>
            </div>
        </Modal>
    );
}

export function DiscordProfiles() {
    const [profilesState, setProfilesState] = useState<DiscordProfilesState>();
    const [error, setError] = useState<string>();
    const [busyAction, setBusyAction] = useState<string>();

    async function refreshProfiles() {
        const result = await VencordNative.discordProfiles.get();

        if (result.ok) {
            setProfilesState(result.value);
            setError(void 0);
        } else {
            setError(result.error.message);
        }
    }

    useEffect(() => {
        void refreshProfiles();
    }, []);

    async function launchProfile(profile: string) {
        setError(void 0);
        setBusyAction(`launch:${profile}`);
        const result = await VencordNative.discordProfiles.launch(profile);
        setBusyAction(void 0);

        if (result.ok) {
            showToast(`Opening Discord profile ${profile}…`);
        } else {
            setError(result.error.message);
        }
    }

    async function openProfileFolder(profile: string) {
        setError(void 0);
        setBusyAction(`folder:${profile}`);
        const result = await VencordNative.discordProfiles.openFolder(profile);
        setBusyAction(void 0);

        if (!result.ok) setError(result.error.message);
    }

    async function openProfilePicker() {
        setError(void 0);
        setBusyAction("picker");
        const result = await VencordNative.discordProfiles.openPicker();
        setBusyAction(void 0);

        if (result.ok) {
            showToast("Opening Discord profile chooser…");
        } else {
            setError(result.error.message);
        }
    }

    const profiles = profilesState?.profiles ?? [];
    const currentProfile = profilesState?.currentProfile ?? null;

    return (
        <section className={Margins.top20}>
            <Forms.FormTitle tag="h5">Discord Profiles</Forms.FormTitle>
            <Forms.FormText>
                Run separate Discord accounts using isolated local profiles.
            </Forms.FormText>
            <Forms.FormText className={Margins.top8}>
                Current profile: <strong>{currentProfile ?? "Default"}</strong>
            </Forms.FormText>

            {error && (
                <ErrorCard className={Margins.top8} style={{ padding: "12px" }}>
                    <Paragraph>{error}</Paragraph>
                </ErrorCard>
            )}

            <div className="vc-discord-profiles-controls">
                <Button
                    onClick={() => openModal(props => (
                        <CreateProfileModal
                            {...props}
                            existingProfiles={profiles}
                            onCreated={refreshProfiles}
                        />
                    ))}
                >
                    Create Profile
                </Button>
                <Button
                    disabled={busyAction != null}
                    onClick={openProfilePicker}
                    variant="secondary"
                >
                    {busyAction === "picker" ? "Opening…" : "Open Profile Chooser"}
                </Button>
            </div>

            <div className="vc-discord-profiles-list">
                {profiles.length === 0 && profilesState && (
                    <Paragraph style={{ color: "var(--text-muted)" }}>
                        No isolated Discord profiles have been created yet.
                    </Paragraph>
                )}
                {profiles.map(profile => (
                    <Card className="vc-discord-profiles-row" defaultPadding key={profile}>
                        <Paragraph className="vc-discord-profiles-name" size="md" weight="semibold">
                            {profile}
                        </Paragraph>
                        <div className="vc-discord-profiles-row-actions">
                            <Button
                                disabled={busyAction != null}
                                onClick={() => launchProfile(profile)}
                                size="small"
                            >
                                {busyAction === `launch:${profile}` ? "Opening…" : "Open"}
                            </Button>
                            <Button
                                disabled={busyAction != null}
                                onClick={() => openProfileFolder(profile)}
                                size="small"
                                variant="secondary"
                            >
                                Open Folder
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        </section>
    );
}
