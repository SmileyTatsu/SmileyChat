import { Check, Users, X } from "lucide-preact";

import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
import type { GroupGreetingMode } from "#frontend/types";

import { GroupAvatar } from "../../chat/group-avatar";

type GroupMemberPreview = {
    avatarPath?: string;
    characterId: string;
    name: string;
    order: number;
};

type GroupCharacterOption = {
    avatar?: { path?: string };
    id: string;
    name: string;
};

const GROUP_GREETING_OPTIONS: Array<{ label: string; value: GroupGreetingMode }> = [
    { label: "All", value: "all" },
    { label: "First", value: "first" },
    { label: "None", value: "none" },
];

export type GroupChatCreatorProps = {
    characters: GroupCharacterOption[];
    groupDefaultTitle: string;
    groupGreetingMode: GroupGreetingMode;
    groupTitleDraft: string;
    selectedGroupCharacterIds: string[];
    selectedGroupMembers: GroupMemberPreview[];
    onClose: () => void;
    onGroupGreetingModeChange: (mode: GroupGreetingMode) => void;
    onGroupTitleDraftChange: (title: string) => void;
    onSubmit: (event: SubmitEvent) => void;
    onToggleGroupCharacter: (characterId: string) => void;
};

export function GroupChatCreator({
    characters,
    groupDefaultTitle,
    groupGreetingMode,
    groupTitleDraft,
    selectedGroupCharacterIds,
    selectedGroupMembers,
    onClose,
    onGroupGreetingModeChange,
    onGroupTitleDraftChange,
    onSubmit,
    onToggleGroupCharacter,
}: GroupChatCreatorProps) {
    return (
        <form className="inline-group-create" onSubmit={onSubmit}>
            <div className="inline-group-create-header">
                <div>
                    <strong>Create group</strong>
                    <span>{selectedGroupCharacterIds.length} selected</span>
                </div>
                <button
                    className="rail-icon-button"
                    type="button"
                    title="Close group creator"
                    aria-label="Close group creator"
                    onClick={onClose}
                >
                    <X size={14} />
                </button>
            </div>

            <label className="inline-group-field">
                <span>Title</span>
                <input
                    value={groupTitleDraft}
                    placeholder={groupDefaultTitle}
                    onInput={(event) =>
                        onGroupTitleDraftChange(event.currentTarget.value)
                    }
                />
            </label>

            <div className="inline-group-preview">
                <GroupAvatar members={selectedGroupMembers} />
                <span>{groupTitleDraft.trim() || groupDefaultTitle}</span>
            </div>

            <div className="inline-group-field">
                <span>Default greetings</span>
                <div className="inline-group-segments" role="radiogroup">
                    {GROUP_GREETING_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={groupGreetingMode === option.value ? "active" : ""}
                            role="radio"
                            aria-checked={groupGreetingMode === option.value}
                            onClick={() => onGroupGreetingModeChange(option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="inline-group-field">
                <span>Characters</span>
                <div className="group-avatar-grid" aria-label="Group characters">
                    {characters.map((character) => {
                        const isSelected = selectedGroupCharacterIds.includes(
                            character.id,
                        );

                        return (
                            <button
                                key={character.id}
                                type="button"
                                className={`group-avatar-option ${
                                    isSelected ? "selected" : ""
                                }`}
                                onClick={() => onToggleGroupCharacter(character.id)}
                                aria-pressed={isSelected}
                                title={character.name}
                            >
                                <span className="group-avatar-frame">
                                    <img
                                        src={
                                            character.avatar?.path ||
                                            characterInitialAvatar(character.name)
                                        }
                                        alt=""
                                    />
                                    <span className="group-avatar-check">
                                        <Check size={12} />
                                    </span>
                                </span>
                                <span>{character.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="inline-group-actions">
                <button type="button" onClick={onClose}>
                    Cancel
                </button>
                <button
                    className="primary"
                    type="submit"
                    disabled={selectedGroupCharacterIds.length === 0}
                >
                    <Users size={14} />
                    Create
                </button>
            </div>
        </form>
    );
}
