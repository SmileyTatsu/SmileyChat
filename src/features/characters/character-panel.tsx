import {
    ChevronLeft,
    ChevronRight,
    ImagePlus,
    ListPlus,
    SlidersHorizontal,
    X,
} from "lucide-preact";
import { useRef, useState } from "preact/hooks";

import { uploadCharacterAvatar } from "#frontend/lib/api/client";
import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
import {
    getCharacterTagline,
    getEditableCharacterTagline,
    setCharacterTagline,
} from "#frontend/lib/characters/normalize";
import type {
    CharacterSummaryCollection,
    SmileyCharacter,
    TavernCardDataV2,
} from "#frontend/types";

type CharacterPanelProps = {
    character: SmileyCharacter;
    isOpen: boolean;
    onBeforeAvatarUpload?: () => void | Promise<void>;
    onChange: (character: SmileyCharacter) => void;
    onOpenChange: (isOpen: boolean) => void;
    onSavedCharacter?: (
        character: SmileyCharacter,
        summaries?: CharacterSummaryCollection,
    ) => void;
};

export function CharacterPanel({
    character,
    isOpen,
    onBeforeAvatarUpload,
    onChange,
    onOpenChange,
    onSavedCharacter,
}: CharacterPanelProps) {
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [activeDialog, setActiveDialog] = useState<"greetings" | "details" | "">("");
    const [avatarError, setAvatarError] = useState("");
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

    function updateCharacterData(nextData: TavernCardDataV2) {
        onChange({ ...character, data: nextData });
    }

    function updateField(field: keyof TavernCardDataV2, value: string) {
        updateCharacterData({ ...character.data, [field]: value });
    }

    function updateStringList(field: "alternate_greetings" | "tags", value: string) {
        updateCharacterData({
            ...character.data,
            [field]: value
                .split(/\r?\n/)
                .map((item) => item.trim())
                .filter(Boolean),
        });
    }

    function updateAlternateGreeting(index: number, value: string) {
        updateCharacterData({
            ...character.data,
            alternate_greetings: character.data.alternate_greetings.map(
                (greeting, itemIndex) => (itemIndex === index ? value : greeting),
            ),
        });
    }

    function addAlternateGreeting() {
        updateCharacterData({
            ...character.data,
            alternate_greetings: [...character.data.alternate_greetings, ""],
        });
    }

    function removeAlternateGreeting(index: number) {
        updateCharacterData({
            ...character.data,
            alternate_greetings: character.data.alternate_greetings.filter(
                (_, itemIndex) => itemIndex !== index,
            ),
        });
    }

    function updateTagline(value: string) {
        updateCharacterData(setCharacterTagline(character.data, value));
    }

    async function uploadAvatar(file: File) {
        setAvatarError("");
        setIsUploadingAvatar(true);

        try {
            await onBeforeAvatarUpload?.();

            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                throw new Error("Use a PNG, JPEG, or WebP image.");
            }

            const result = await uploadCharacterAvatar(character.id, file);

            if (!result.avatar) {
                throw new Error("The server did not return an avatar path.");
            }

            if (result.character && onSavedCharacter) {
                onSavedCharacter(result.character, result.characters);
            } else {
                onChange({
                    ...character,
                    avatar: result.avatar,
                });
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
        <>
            <aside
                className={`character-panel ${isOpen ? "open" : "collapsed"}`}
                aria-label="Current character"
            >
                {isOpen && (
                    <div className="panel-content">
                        <header className="side-panel-header">
                            <h2>Character</h2>
                            <button
                                className="icon-button"
                                type="button"
                                title="Collapse character panel"
                                onClick={() => onOpenChange(false)}
                            >
                                <ChevronRight size={18} />
                            </button>
                        </header>

                        <div className="profile-card">
                            <button
                                className="profile-avatar-button"
                                type="button"
                                disabled={isUploadingAvatar}
                                title="Choose character image"
                                onClick={() => avatarInputRef.current?.click()}
                            >
                                {character.avatar ? (
                                    <img
                                        className="profile-avatar image-avatar"
                                        src={character.avatar.path}
                                        alt=""
                                    />
                                ) : (
                                    <img
                                        className="profile-avatar image-avatar empty-avatar"
                                        src={characterInitialAvatar(character.data.name)}
                                        alt=""
                                    />
                                )}
                                <span
                                    className="profile-avatar-overlay"
                                    aria-hidden="true"
                                >
                                    <ImagePlus size={19} />
                                </span>
                            </button>
                            <div>
                                <h3>{character.data.name}</h3>
                                {getCharacterTagline(character) && (
                                    <p>{getCharacterTagline(character)}</p>
                                )}
                                {avatarError && (
                                    <p className="character-inline-error">
                                        {avatarError}
                                    </p>
                                )}
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

                        <div className="character-form">
                            <label>
                                Name
                                <input
                                    value={character.data.name}
                                    onInput={(event) =>
                                        updateField(
                                            "name",
                                            (event.currentTarget as HTMLInputElement)
                                                .value,
                                        )
                                    }
                                />
                            </label>
                            <label>
                                Description
                                <textarea
                                    value={character.data.description}
                                    placeholder="{{char}} is a..."
                                    onInput={(event) =>
                                        updateField(
                                            "description",
                                            (event.currentTarget as HTMLTextAreaElement)
                                                .value,
                                        )
                                    }
                                />
                            </label>
                            <label>
                                Scenario
                                <textarea
                                    value={character.data.scenario}
                                    placeholder="A mountain full of donuts..."
                                    onInput={(event) =>
                                        updateField(
                                            "scenario",
                                            (event.currentTarget as HTMLTextAreaElement)
                                                .value,
                                        )
                                    }
                                />
                            </label>
                            <label>
                                First message
                                <textarea
                                    value={character.data.first_mes}
                                    placeholder="Hello, I'm {{char}}!"
                                    onInput={(event) =>
                                        updateField(
                                            "first_mes",
                                            (event.currentTarget as HTMLTextAreaElement)
                                                .value,
                                        )
                                    }
                                />
                            </label>

                            <div className="character-panel-actions">
                                <button
                                    type="button"
                                    onClick={() => setActiveDialog("greetings")}
                                >
                                    <ListPlus size={15} />
                                    Greetings
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveDialog("details")}
                                >
                                    <SlidersHorizontal size={15} />
                                    Details
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {!isOpen && (
                    <button
                        className="collapsed-panel-button"
                        type="button"
                        title="Open character panel"
                        onClick={() => onOpenChange(true)}
                    >
                        <ChevronLeft size={18} />
                        <span>Character</span>
                    </button>
                )}
            </aside>

            {activeDialog && (
                <div
                    className="character-dialog-backdrop"
                    role="presentation"
                    onClick={() => setActiveDialog("")}
                >
                    <section
                        className="character-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-label={
                            activeDialog === "greetings"
                                ? "Character greetings"
                                : "Character details"
                        }
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header className="character-dialog-header">
                            <h2>
                                {activeDialog === "greetings" ? "Greetings" : "Details"}
                            </h2>
                            <button
                                className="icon-button"
                                type="button"
                                title="Close"
                                onClick={() => setActiveDialog("")}
                            >
                                <X size={18} />
                            </button>
                        </header>

                        <div className="character-dialog-body">
                            {activeDialog === "greetings" && (
                                <>
                                    <label>
                                        Greeting 1
                                        <textarea
                                            value={character.data.first_mes}
                                            onInput={(event) =>
                                                updateField(
                                                    "first_mes",
                                                    (
                                                        event.currentTarget as HTMLTextAreaElement
                                                    ).value,
                                                )
                                            }
                                        />
                                    </label>

                                    {character.data.alternate_greetings.map(
                                        (greeting, index) => (
                                            <div
                                                className="numbered-greeting-field"
                                                key={index}
                                            >
                                                <label>
                                                    Greeting {index + 2}
                                                    <textarea
                                                        value={greeting}
                                                        onInput={(event) =>
                                                            updateAlternateGreeting(
                                                                index,
                                                                (
                                                                    event.currentTarget as HTMLTextAreaElement
                                                                ).value,
                                                            )
                                                        }
                                                    />
                                                </label>
                                                <button
                                                    className="secondary-button"
                                                    type="button"
                                                    onClick={() =>
                                                        removeAlternateGreeting(index)
                                                    }
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ),
                                    )}

                                    <button
                                        className="secondary-button"
                                        type="button"
                                        onClick={addAlternateGreeting}
                                    >
                                        Add greeting
                                    </button>
                                </>
                            )}

                            {activeDialog === "details" && (
                                <>
                                    <label>
                                        Short description
                                        <textarea
                                            value={getEditableCharacterTagline(character)}
                                            onInput={(event) =>
                                                updateTagline(
                                                    (
                                                        event.currentTarget as HTMLTextAreaElement
                                                    ).value,
                                                )
                                            }
                                        />
                                    </label>
                                    <label>
                                        Personality
                                        <textarea
                                            value={character.data.personality}
                                            onInput={(event) =>
                                                updateField(
                                                    "personality",
                                                    (
                                                        event.currentTarget as HTMLTextAreaElement
                                                    ).value,
                                                )
                                            }
                                        />
                                    </label>
                                    <label>
                                        Message examples
                                        <textarea
                                            value={character.data.mes_example}
                                            onInput={(event) =>
                                                updateField(
                                                    "mes_example",
                                                    (
                                                        event.currentTarget as HTMLTextAreaElement
                                                    ).value,
                                                )
                                            }
                                        />
                                    </label>
                                    <label>
                                        System prompt
                                        <textarea
                                            value={character.data.system_prompt}
                                            onInput={(event) =>
                                                updateField(
                                                    "system_prompt",
                                                    (
                                                        event.currentTarget as HTMLTextAreaElement
                                                    ).value,
                                                )
                                            }
                                        />
                                    </label>
                                    <label>
                                        Post-history instructions
                                        <textarea
                                            value={
                                                character.data.post_history_instructions
                                            }
                                            onInput={(event) =>
                                                updateField(
                                                    "post_history_instructions",
                                                    (
                                                        event.currentTarget as HTMLTextAreaElement
                                                    ).value,
                                                )
                                            }
                                        />
                                    </label>
                                    <label>
                                        Tags
                                        <textarea
                                            value={character.data.tags.join("\n")}
                                            onInput={(event) =>
                                                updateStringList(
                                                    "tags",
                                                    (
                                                        event.currentTarget as HTMLTextAreaElement
                                                    ).value,
                                                )
                                            }
                                        />
                                    </label>
                                    <div className="character-meta-grid">
                                        <label>
                                            Creator
                                            <input
                                                value={character.data.creator}
                                                onInput={(event) =>
                                                    updateField(
                                                        "creator",
                                                        (
                                                            event.currentTarget as HTMLInputElement
                                                        ).value,
                                                    )
                                                }
                                            />
                                        </label>
                                        <label>
                                            Version
                                            <input
                                                value={character.data.character_version}
                                                onInput={(event) =>
                                                    updateField(
                                                        "character_version",
                                                        (
                                                            event.currentTarget as HTMLInputElement
                                                        ).value,
                                                    )
                                                }
                                            />
                                        </label>
                                    </div>
                                    <label>
                                        Creator notes
                                        <textarea
                                            value={character.data.creator_notes}
                                            onInput={(event) =>
                                                updateField(
                                                    "creator_notes",
                                                    (
                                                        event.currentTarget as HTMLTextAreaElement
                                                    ).value,
                                                )
                                            }
                                        />
                                    </label>
                                    {character.data.character_book && (
                                        <p className="field-hint">
                                            Character book stored with{" "}
                                            {character.data.character_book.entries.length}{" "}
                                            {character.data.character_book.entries
                                                .length === 1
                                                ? "entry"
                                                : "entries"}
                                            . Editing lore entries will be added later.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </>
    );
}
