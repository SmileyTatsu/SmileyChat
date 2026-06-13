import { Copy, Pencil, Plus, Sparkles, Trash2 } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";

import type { PluginProfile } from "#frontend/lib/plugins/profiles";

export type ProfileBarProps = {
    profiles: PluginProfile[];
    activeProfile: PluginProfile | undefined;
    isCustom: boolean;
    isBusy: boolean;
    onApply: (profile: PluginProfile) => void | Promise<void>;
    onCreateNew: () => void | Promise<void>;
    onDuplicateActive: () => void | Promise<void>;
    onDeleteActive: () => void | Promise<void>;
    onUpdateActiveDetails: (details: {
        description: string;
        name: string;
    }) => boolean | Promise<boolean>;
};

export function ProfileBar({
    profiles,
    activeProfile,
    isCustom,
    isBusy,
    onApply,
    onCreateNew,
    onDuplicateActive,
    onDeleteActive,
    onUpdateActiveDetails,
}: ProfileBarProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draftName, setDraftName] = useState(activeProfile?.name ?? "");
    const [draftDescription, setDraftDescription] = useState(
        activeProfile?.description ?? "",
    );
    const canEditProfile = Boolean(activeProfile && !activeProfile.builtin);

    useEffect(() => {
        setDraftName(activeProfile?.name ?? "");
        setDraftDescription(activeProfile?.description ?? "");
        setIsEditing(false);
    }, [activeProfile?.id, activeProfile?.name, activeProfile?.description]);

    function resetEditor() {
        setDraftName(activeProfile?.name ?? "");
        setDraftDescription(activeProfile?.description ?? "");
        setIsEditing(false);
    }

    async function saveDetails() {
        if (!canEditProfile) return;
        const saved = await onUpdateActiveDetails({
            description: draftDescription,
            name: draftName,
        });

        if (saved) {
            setIsEditing(false);
        }
    }

    return (
        <section className="profile-bar">
            <div className="profile-bar-row">
                <label className="profile-bar-select">
                    <span>
                        <Sparkles size={14} />
                        Profile
                    </span>
                    <select
                        value={activeProfile?.id ?? ""}
                        disabled={isBusy}
                        onInput={(event) => {
                            const id = (event.currentTarget as HTMLSelectElement).value;
                            const next = profiles.find((profile) => profile.id === id);
                            if (next) void onApply(next);
                        }}
                    >
                        <optgroup label="Built-in">
                            {profiles
                                .filter((profile) => profile.builtin)
                                .map((profile) => (
                                    <option key={profile.id} value={profile.id}>
                                        {profile.name}
                                    </option>
                                ))}
                        </optgroup>
                        {profiles.some((profile) => !profile.builtin) && (
                            <optgroup label="Yours">
                                {profiles
                                    .filter((profile) => !profile.builtin)
                                    .map((profile) => (
                                        <option key={profile.id} value={profile.id}>
                                            {profile.name}
                                        </option>
                                    ))}
                            </optgroup>
                        )}
                    </select>
                </label>

                {isCustom && (
                    <span
                        className="custom-badge"
                        title="State diverges from this profile"
                    >
                        Custom
                    </span>
                )}

                <div className="button-row profile-bar-actions">
                    <button type="button" disabled={isBusy} onClick={onCreateNew}>
                        <Plus size={16} />
                        New
                    </button>
                    <button
                        type="button"
                        disabled={isBusy || !activeProfile}
                        onClick={onDuplicateActive}
                    >
                        <Copy size={16} />
                        Duplicate
                    </button>
                    <button
                        type="button"
                        disabled={isBusy || !canEditProfile}
                        onClick={() => setIsEditing((value) => !value)}
                    >
                        <Pencil size={16} />
                        Edit
                    </button>
                    <button
                        type="button"
                        className="danger-button"
                        disabled={isBusy || !canEditProfile}
                        onClick={onDeleteActive}
                    >
                        <Trash2 size={16} />
                        Delete
                    </button>
                </div>
            </div>

            {activeProfile?.description && (
                <p className="profile-bar-description">{activeProfile.description}</p>
            )}

            {isEditing && canEditProfile && (
                <div className="profile-bar-editor">
                    <label>
                        Name
                        <input
                            type="text"
                            value={draftName}
                            onInput={(event) => setDraftName(event.currentTarget.value)}
                        />
                    </label>
                    <label>
                        Description
                        <textarea
                            rows={2}
                            value={draftDescription}
                            onInput={(event) =>
                                setDraftDescription(event.currentTarget.value)
                            }
                        />
                    </label>
                    <div className="button-row profile-bar-editor-actions">
                        <button
                            type="button"
                            disabled={isBusy || draftName.trim().length === 0}
                            onClick={() => void saveDetails()}
                        >
                            Save
                        </button>
                        <button type="button" disabled={isBusy} onClick={resetEditor}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
