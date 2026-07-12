import {
    ChevronUp,
    ChevronDown,
    ImagePlus,
    Megaphone,
    Plus,
    Trash2,
    Volume2,
    VolumeX,
    X,
} from "lucide-preact";
import { useMemo, useRef, useState } from "preact/hooks";

import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
import { defaultGroupTitle } from "#frontend/lib/chats/normalize";
import type { LorebookCollection } from "#frontend/lib/lorebooks/types";
import type {
    CharacterSummary,
    ChatGroup,
    ChatGroupMember,
    ChatMetadata,
    ChatSession,
    GroupGreetingMode,
} from "#frontend/types";

import {
    ChatDetailsPanel,
    hasChatLorebooks,
    isAuthorNoteActive,
} from "./chat-details-panel";
import { ContextTabs, panelId, tabId, type ContextTab } from "./context-tabs";
import { GroupAvatar } from "../chat/group-avatar";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";

type GroupPanelProps = {
    characters: CharacterSummary[];
    chatMetadata?: ChatMetadata;
    chat: ChatSession;
    isOpen: boolean;
    lorebookCollection: LorebookCollection;
    pluginSnapshot: PluginAppSnapshot | undefined;
    onChange: (chat: ChatSession) => void;
    onChangeAvatar: (chatId: string, file: File) => void;
    onClose: () => void;
    onForceReply: (characterId: string) => void;
    onShowDebugPayload: () => void;
    onUpdateChatMetadata: (metadata: ChatMetadata) => void;
};

export function GroupPanel({
    characters,
    chatMetadata,
    chat,
    isOpen,
    lorebookCollection,
    pluginSnapshot,
    onChange,
    onChangeAvatar,
    onClose,
    onForceReply,
    onShowDebugPayload,
    onUpdateChatMetadata,
}: GroupPanelProps) {
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [activeTab, setActiveTab] = useState<ContextTab>("entity");
    const members = useMemo(
        () =>
            (chat.members ?? []).slice().sort((left, right) => left.order - right.order),
        [chat.members],
    );
    const memberCharacterIds = useMemo(
        () => new Set(members.map((member) => member.characterId)),
        [members],
    );
    const availableCharacters = useMemo(
        () => characters.filter((character) => !memberCharacterIds.has(character.id)),
        [characters, memberCharacterIds],
    );
    const group = useMemo(() => normalizedGroup(chat.group), [chat.group]);
    const defaultTitle = useMemo(() => defaultGroupTitle(members), [members]);
    const contextIdBase = `group-context-${chat.id}`;

    function updateGroup(nextGroup: ChatGroup) {
        onChange({
            ...chat,
            group: nextGroup,
            defaultTitle,
            updatedAt: new Date().toISOString(),
        });
    }

    function updateMembers(nextMembers: ChatGroupMember[]) {
        const orderedMembers = nextMembers.map((member, index) => ({
            ...member,
            order: index,
        }));

        onChange({
            ...chat,
            characterId: orderedMembers[0]?.characterId ?? chat.characterId,
            members: orderedMembers,
            defaultTitle: defaultGroupTitle(orderedMembers),
            updatedAt: new Date().toISOString(),
        });
    }

    function setTitle(title: string) {
        const trimmedTitle = title.trim();

        onChange({
            ...chat,
            group: {
                ...group,
                title: trimmedTitle || undefined,
            },
            title: trimmedTitle || undefined,
            defaultTitle,
            updatedAt: new Date().toISOString(),
        });
    }

    function addMember(characterId: string) {
        const character = characters.find((item) => item.id === characterId);

        if (!character) {
            return;
        }

        updateMembers([
            ...members,
            {
                characterId: character.id,
                name: character.name,
                ...(character.avatar?.path ? { avatarPath: character.avatar.path } : {}),
                order: members.length,
                talkativeness: 0.5,
            },
        ]);
    }

    function updateMember(characterId: string, patch: Partial<ChatGroupMember>) {
        updateMembers(
            members.map((member) =>
                member.characterId === characterId ? { ...member, ...patch } : member,
            ),
        );
    }

    function removeMember(characterId: string) {
        if (members.length <= 1) {
            return;
        }

        updateMembers(members.filter((member) => member.characterId !== characterId));
    }

    function moveMember(characterId: string, direction: -1 | 1) {
        const index = members.findIndex((member) => member.characterId === characterId);
        const nextIndex = index + direction;

        if (index < 0 || nextIndex < 0 || nextIndex >= members.length) {
            return;
        }

        const nextMembers = [...members];
        const [member] = nextMembers.splice(index, 1);
        nextMembers.splice(nextIndex, 0, member);
        updateMembers(nextMembers);
    }

    function resetGroupAvatar() {
        updateGroup({
            ...group,
            avatar: { type: "collage" },
        });
    }

    return (
        <aside
            className={`character-panel group-panel ${isOpen ? "open" : "collapsed"}`}
            aria-label="Group chat"
        >
            {isOpen && (
                <div className="panel-content">
                    <header className="side-panel-header">
                        <h2>Context</h2>
                        <button
                            className="icon-button character-mobile-close-btn"
                            type="button"
                            title="Close group panel"
                            aria-label="Close group panel"
                            onClick={onClose}
                        >
                            <X size={15} />
                        </button>
                    </header>

                    <ContextTabs
                        activeTab={activeTab}
                        entityLabel="Group"
                        hasActiveChatDetails={
                            isAuthorNoteActive(chatMetadata?.authorNote) ||
                            hasChatLorebooks(chatMetadata)
                        }
                        idBase={contextIdBase}
                        onTabChange={setActiveTab}
                    />

                    <div className="context-tab-panels" data-active-tab={activeTab}>
                        <section
                            id={panelId(contextIdBase, "entity")}
                            className="context-tab-panel"
                            role="tabpanel"
                            aria-labelledby={tabId(contextIdBase, "entity")}
                            hidden={activeTab !== "entity"}
                        >
                            <div className="profile-card">
                                <button
                                    className="profile-avatar-button"
                                    type="button"
                                    title="Choose group image"
                                    onClick={() => avatarInputRef.current?.click()}
                                >
                                    <GroupAvatar
                                        className="profile-avatar"
                                        customPath={
                                            group.avatar?.type === "custom"
                                                ? group.avatar.path
                                                : undefined
                                        }
                                        members={members}
                                    />
                                    <span
                                        className="profile-avatar-overlay"
                                        aria-hidden="true"
                                    >
                                        <ImagePlus size={19} />
                                    </span>
                                </button>
                                <div>
                                    <h3>{chat.title || defaultTitle}</h3>
                                    <p>
                                        {members.length} member
                                        {members.length === 1 ? "" : "s"}
                                    </p>
                                    {group.avatar?.type === "custom" && (
                                        <button
                                            className="text-action danger-text-action"
                                            type="button"
                                            onClick={resetGroupAvatar}
                                        >
                                            <Trash2 size={13} />
                                            Reset image
                                        </button>
                                    )}
                                </div>
                            </div>
                            <input
                                ref={avatarInputRef}
                                hidden
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(event) => {
                                    const input = event.currentTarget as HTMLInputElement;
                                    const file = input.files?.[0];

                                    if (file) {
                                        onChangeAvatar(chat.id, file);
                                    }

                                    input.value = "";
                                }}
                            />

                            <div className="character-form">
                                <label>
                                    Title
                                    <input
                                        value={chat.title ?? ""}
                                        placeholder={defaultTitle}
                                        onInput={(event) =>
                                            setTitle(
                                                (event.currentTarget as HTMLInputElement)
                                                    .value,
                                            )
                                        }
                                    />
                                </label>

                                <label>
                                    Reply strategy
                                    <select
                                        value={group.replyOrder}
                                        onChange={(event) =>
                                            updateGroup({
                                                ...group,
                                                replyOrder: event.currentTarget
                                                    .value as ChatGroup["replyOrder"],
                                            })
                                        }
                                    >
                                        <option value="list">List order</option>
                                        <option value="pooled">Pooled order</option>
                                        <option value="natural">Natural order</option>
                                    </select>
                                </label>

                                <label>
                                    Group generation handling
                                    <select
                                        value={group.generationMode}
                                        onChange={(event) =>
                                            updateGroup({
                                                ...group,
                                                generationMode: event.currentTarget
                                                    .value as ChatGroup["generationMode"],
                                            })
                                        }
                                    >
                                        <option value="swap-character-cards">
                                            Swap character cards
                                        </option>
                                        <option value="join-character-cards">
                                            Join character cards
                                        </option>
                                    </select>
                                </label>

                                <label>
                                    Join prefix
                                    <input
                                        value={group.joinPrefix ?? ""}
                                        placeholder="{{char}}:"
                                        onInput={(event) =>
                                            updateGroup({
                                                ...group,
                                                joinPrefix: event.currentTarget.value,
                                            })
                                        }
                                    />
                                </label>

                                <label>
                                    Default greetings
                                    <select
                                        value={group.greetingMode ?? "all"}
                                        onChange={(event) =>
                                            updateGroup({
                                                ...group,
                                                greetingMode: event.currentTarget
                                                    .value as GroupGreetingMode,
                                            })
                                        }
                                    >
                                        <option value="all">All member greetings</option>
                                        <option value="first">First member only</option>
                                        <option value="none">No default greeting</option>
                                    </select>
                                </label>

                                <label className="inline-setting">
                                    <input
                                        type="checkbox"
                                        checked={group.allowSelfResponses === true}
                                        onChange={(event) =>
                                            updateGroup({
                                                ...group,
                                                allowSelfResponses:
                                                    event.currentTarget.checked,
                                            })
                                        }
                                    />
                                    Allow self responses
                                </label>

                                <section className="group-panel-section">
                                    <h3>Automatic responses</h3>
                                    <label className="inline-setting">
                                        <input
                                            type="checkbox"
                                            checked={
                                                group.autoResponses?.enabled === true
                                            }
                                            onChange={(event) =>
                                                updateGroup({
                                                    ...group,
                                                    autoResponses: {
                                                        ...defaultAutoResponses(),
                                                        ...group.autoResponses,
                                                        enabled:
                                                            event.currentTarget.checked,
                                                    },
                                                })
                                            }
                                        />
                                        Let characters reply to each other
                                    </label>
                                    {members.length < 2 &&
                                        group.autoResponses?.enabled &&
                                        group.allowSelfResponses !== true && (
                                            <p className="field-hint">
                                                Automatic responses need at least two
                                                unmuted members unless self responses are
                                                enabled.
                                            </p>
                                        )}
                                    <label className="group-talkativeness group-setting-range">
                                        <span>
                                            Chance{" "}
                                            {Math.round(
                                                (group.autoResponses?.chance ?? 0.35) *
                                                    100,
                                            )}
                                            %
                                        </span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={group.autoResponses?.chance ?? 0.35}
                                            onInput={(event) =>
                                                updateGroup({
                                                    ...group,
                                                    autoResponses: {
                                                        ...defaultAutoResponses(),
                                                        ...group.autoResponses,
                                                        chance: Number(
                                                            event.currentTarget.value,
                                                        ),
                                                    },
                                                })
                                            }
                                        />
                                    </label>
                                    <div className="character-meta-grid">
                                        <label>
                                            Max turns
                                            <input
                                                type="number"
                                                min="1"
                                                max="8"
                                                value={group.autoResponses?.maxTurns ?? 2}
                                                onInput={(event) =>
                                                    updateGroup({
                                                        ...group,
                                                        autoResponses: {
                                                            ...defaultAutoResponses(),
                                                            ...group.autoResponses,
                                                            maxTurns: Number(
                                                                event.currentTarget.value,
                                                            ),
                                                        },
                                                    })
                                                }
                                            />
                                        </label>
                                        <label>
                                            Delay ms
                                            <input
                                                type="number"
                                                min="0"
                                                max="10000"
                                                step="100"
                                                value={
                                                    group.autoResponses?.delayMs ?? 900
                                                }
                                                onInput={(event) =>
                                                    updateGroup({
                                                        ...group,
                                                        autoResponses: {
                                                            ...defaultAutoResponses(),
                                                            ...group.autoResponses,
                                                            delayMs: Number(
                                                                event.currentTarget.value,
                                                            ),
                                                        },
                                                    })
                                                }
                                            />
                                        </label>
                                    </div>
                                </section>

                                <label>
                                    Scenario override
                                    <textarea
                                        value={group.scenarioOverride ?? ""}
                                        placeholder="Optional shared scenario for this group."
                                        onInput={(event) =>
                                            updateGroup({
                                                ...group,
                                                scenarioOverride:
                                                    event.currentTarget.value.trim() ||
                                                    undefined,
                                            })
                                        }
                                    />
                                </label>

                                <section className="group-panel-section">
                                    <h3>Current members</h3>
                                    <div className="group-member-list">
                                        {members.map((member, index) => (
                                            <div
                                                className="group-member-row"
                                                key={member.characterId}
                                            >
                                                <img
                                                    className="avatar image-avatar"
                                                    src={
                                                        member.avatarPath ||
                                                        characterInitialAvatar(
                                                            member.name,
                                                        )
                                                    }
                                                    alt=""
                                                />
                                                <span>
                                                    <strong>{member.name}</strong>
                                                    <small>
                                                        {member.muted
                                                            ? "Muted"
                                                            : "Can reply"}
                                                    </small>
                                                </span>
                                                <button
                                                    type="button"
                                                    title="Move up"
                                                    disabled={index === 0}
                                                    onClick={() =>
                                                        moveMember(member.characterId, -1)
                                                    }
                                                >
                                                    <ChevronUp size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Move down"
                                                    disabled={
                                                        index === members.length - 1
                                                    }
                                                    onClick={() =>
                                                        moveMember(member.characterId, 1)
                                                    }
                                                >
                                                    <ChevronDown size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    title={
                                                        member.muted
                                                            ? "Unmute member"
                                                            : "Mute member"
                                                    }
                                                    onClick={() =>
                                                        updateMember(member.characterId, {
                                                            muted: !member.muted,
                                                        })
                                                    }
                                                >
                                                    {member.muted ? (
                                                        <VolumeX size={15} />
                                                    ) : (
                                                        <Volume2 size={15} />
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Force reply"
                                                    onClick={() =>
                                                        onForceReply(member.characterId)
                                                    }
                                                >
                                                    <Megaphone size={15} />
                                                </button>
                                                <button
                                                    className="danger-button"
                                                    type="button"
                                                    title="Remove member"
                                                    disabled={members.length <= 1}
                                                    onClick={() =>
                                                        removeMember(member.characterId)
                                                    }
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                                <label className="group-talkativeness">
                                                    <span>
                                                        Talkativeness{" "}
                                                        {Math.round(
                                                            (member.talkativeness ??
                                                                0.5) * 100,
                                                        )}
                                                        %
                                                    </span>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="1"
                                                        step="0.05"
                                                        value={
                                                            member.talkativeness ?? 0.5
                                                        }
                                                        onInput={(event) =>
                                                            updateMember(
                                                                member.characterId,
                                                                {
                                                                    talkativeness: Number(
                                                                        event
                                                                            .currentTarget
                                                                            .value,
                                                                    ),
                                                                },
                                                            )
                                                        }
                                                    />
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <label>
                                    Add member
                                    <select
                                        value=""
                                        disabled={availableCharacters.length === 0}
                                        onChange={(event) =>
                                            addMember(event.currentTarget.value)
                                        }
                                    >
                                        <option value="">
                                            {availableCharacters.length
                                                ? "Choose character"
                                                : "All characters are already members"}
                                        </option>
                                        {availableCharacters.map((character) => (
                                            <option
                                                key={character.id}
                                                value={character.id}
                                            >
                                                {character.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={availableCharacters.length === 0}
                                    onClick={() => {
                                        if (availableCharacters[0]) {
                                            addMember(availableCharacters[0].id);
                                        }
                                    }}
                                >
                                    <Plus size={15} />
                                    Add next available
                                </button>
                            </div>
                        </section>

                        <section
                            id={panelId(contextIdBase, "chat")}
                            className="context-tab-panel"
                            role="tabpanel"
                            aria-labelledby={tabId(contextIdBase, "chat")}
                            hidden={activeTab !== "chat"}
                        >
                            <ChatDetailsPanel
                                chatMetadata={chatMetadata}
                                lorebookCollection={lorebookCollection}
                                pluginSnapshot={pluginSnapshot}
                                onShowDebugPayload={onShowDebugPayload}
                                onUpdateChatMetadata={onUpdateChatMetadata}
                            />
                        </section>
                    </div>
                </div>
            )}
        </aside>
    );
}

function normalizedGroup(group: ChatSession["group"]): ChatGroup {
    return {
        autoResponses: group?.autoResponses ?? defaultAutoResponses(),
        avatar: group?.avatar ?? { type: "collage" },
        replyOrder: group?.replyOrder ?? "natural",
        generationMode: group?.generationMode ?? "swap-character-cards",
        greetingMode: group?.greetingMode ?? "all",
        joinPrefix: group?.joinPrefix ?? "",
        ...(group?.allowSelfResponses !== undefined
            ? { allowSelfResponses: group.allowSelfResponses }
            : {}),
        ...(group?.scenarioOverride ? { scenarioOverride: group.scenarioOverride } : {}),
        ...(group?.title ? { title: group.title } : {}),
    };
}

function defaultAutoResponses(): NonNullable<ChatGroup["autoResponses"]> {
    return {
        enabled: false,
        chance: 0.35,
        delayMs: 900,
        maxTurns: 2,
    };
}
