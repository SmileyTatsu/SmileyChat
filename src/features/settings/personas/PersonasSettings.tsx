import { ImageOff, ImagePlus, Plus, Trash2 } from "lucide-preact";
import { useRef, useState } from "preact/hooks";
import { uploadPersonaAvatar } from "../../../lib/api/client";
import type { PersonaSummaryCollection, SmileyPersona } from "../../../types";

type PersonasSettingsProps = {
    collection: PersonaSummaryCollection;
    loadError?: string;
    persona: SmileyPersona;
    onCreatePersona: () => void;
    onDeletePersona: (personaId: string) => void;
    onPersonaChange: (persona: SmileyPersona) => void;
    onPersonaSaved: (persona: SmileyPersona, personas?: PersonaSummaryCollection) => void;
    onPersonaSelect: (personaId: string) => void;
    onSetActivePersona: (personaId: string) => void;
};

export function PersonasSettings({
    collection,
    loadError,
    persona,
    onCreatePersona,
    onDeletePersona,
    onPersonaChange,
    onPersonaSaved,
    onPersonaSelect,
    onSetActivePersona,
}: PersonasSettingsProps) {
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [deleteCandidateId, setDeleteCandidateId] = useState("");
    const [avatarError, setAvatarError] = useState("");
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const canDelete = collection.personas.length > 1;
    const deleteCandidate = collection.personas.find(
        (item) => item.id === deleteCandidateId,
    );

    function updatePersona(nextPersona: Partial<SmileyPersona>) {
        onPersonaChange({
            ...persona,
            ...nextPersona,
        });
    }

    async function uploadAvatar(file: File) {
        setAvatarError("");
        setIsUploadingAvatar(true);

        try {
            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                throw new Error("Use a PNG, JPEG, or WebP image.");
            }

            const result = await uploadPersonaAvatar(persona.id, file);

            if (!result.avatar) {
                throw new Error("The server did not return an avatar path.");
            }

            if (result.persona) {
                onPersonaSaved(result.persona, result.personas);
            } else {
                onPersonaChange({ ...persona, avatar: result.avatar });
            }
        } catch (error) {
            setAvatarError(
                error instanceof Error ? error.message : "Could not save image.",
            );
        } finally {
            setIsUploadingAvatar(false);

            if (avatarInputRef.current) {
                avatarInputRef.current.value = "";
            }
        }
    }

    return (
        <section className="tool-window personas-settings">
            <div className="preset-section-header">
                <h2>Personas</h2>
                <button type="button" onClick={onCreatePersona}>
                    <Plus size={16} />
                    New persona
                </button>
            </div>

            <div className="personas-editor">
                <div className="personas-list" aria-label="Personas">
                    {collection.personas.map((item) => (
                        <div
                            className={item.id === persona.id ? "active" : ""}
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onPersonaSelect(item.id)}
                            onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") {
                                    return;
                                }

                                event.preventDefault();
                                onPersonaSelect(item.id);
                            }}
                        >
                            <PersonaIcon
                                avatarPath={item.avatar?.path}
                                name={item.name}
                            />
                            <span>
                                <strong>{item.name}</strong>
                                <small>
                                    {item.id === collection.activePersonaId
                                        ? "Active"
                                        : "Persona"}
                                </small>
                            </span>
                            {item.id !== collection.activePersonaId && (
                                <button
                                    className="set-active-persona-button"
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onSetActivePersona(item.id);
                                    }}
                                >
                                    Set active
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <div className="persona-detail-panel">
                    <div className="persona-detail-header">
                        <button
                            className="persona-avatar-upload"
                            type="button"
                            disabled={isUploadingAvatar}
                            title="Choose persona image"
                            onClick={() => avatarInputRef.current?.click()}
                        >
                            <PersonaIcon
                                avatarPath={persona.avatar?.path}
                                name={persona.name}
                                large
                            />
                            <span className="profile-avatar-overlay" aria-hidden="true">
                                <ImagePlus size={18} />
                            </span>
                        </button>
                        <div>
                            <strong>{persona.name}</strong>
                            <span>{persona.description.trim() || "No description"}</span>
                        </div>
                    </div>
                    <input
                        ref={avatarInputRef}
                        hidden
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) => {
                            const file = (event.currentTarget as HTMLInputElement)
                                .files?.[0];

                            if (file) {
                                void uploadAvatar(file);
                            }
                        }}
                    />
                    {avatarError && (
                        <p className="character-inline-error">{avatarError}</p>
                    )}

                    <label>
                        Name
                        <input
                            value={persona.name}
                            onInput={(event) =>
                                updatePersona({
                                    name: (event.currentTarget as HTMLInputElement).value,
                                })
                            }
                        />
                    </label>

                    <label>
                        Description
                        <textarea
                            className="persona-description-input"
                            value={persona.description}
                            onInput={(event) =>
                                updatePersona({
                                    description: (
                                        event.currentTarget as HTMLTextAreaElement
                                    ).value,
                                })
                            }
                        />
                    </label>

                    <div className="field-hint">
                        Available in prompts as {"{{user}}"}, {"{{persona_name}}"},{" "}
                        {"{{persona}}"}, {"{{persona_description}}"}, and{" "}
                        {"{{user_status}}"}.
                    </div>

                    <div className="button-row">
                        <button
                            type="button"
                            disabled={!persona.avatar}
                            title={
                                persona.avatar
                                    ? "Remove persona image"
                                    : "No persona image to remove"
                            }
                            onClick={() => updatePersona({ avatar: undefined })}
                        >
                            <ImageOff size={16} />
                            Remove image
                        </button>
                        <button
                            className="danger-button"
                            type="button"
                            disabled={!canDelete}
                            title={
                                canDelete
                                    ? "Delete persona"
                                    : "Cannot delete the last persona"
                            }
                            onClick={() => setDeleteCandidateId(persona.id)}
                        >
                            <Trash2 size={16} />
                            Delete
                        </button>
                    </div>
                </div>
            </div>

            {loadError && <p className="connection-status error">{loadError}</p>}

            {deleteCandidate && (
                <div
                    className="message-confirm-backdrop"
                    role="presentation"
                    onClick={() => setDeleteCandidateId("")}
                >
                    <section
                        className="message-confirm-dialog compact"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Delete persona"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header>
                            <Trash2 size={19} />
                            <h2>Delete persona?</h2>
                        </header>
                        <p>
                            Delete {deleteCandidate.name} from userData? This cannot be
                            undone.
                        </p>
                        <div className="message-confirm-actions">
                            <button
                                type="button"
                                onClick={() => setDeleteCandidateId("")}
                            >
                                Cancel
                            </button>
                            <button
                                className="danger-button"
                                type="button"
                                onClick={() => {
                                    onDeletePersona(deleteCandidate.id);
                                    setDeleteCandidateId("");
                                }}
                            >
                                <Trash2 size={15} />
                                Delete
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
}

function PersonaIcon({
    avatarPath,
    large,
    name,
}: {
    avatarPath?: string;
    large?: boolean;
    name: string;
}) {
    return (
        <span className={large ? "persona-settings-icon large" : "persona-settings-icon"}>
            {avatarPath ? (
                <img src={avatarPath} alt="" />
            ) : (
                <span className="persona-settings-icon-text">
                    {name.trim()[0]?.toUpperCase() || "?"}
                </span>
            )}
        </span>
    );
}
