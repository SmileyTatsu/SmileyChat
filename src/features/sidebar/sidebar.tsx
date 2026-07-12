import {
    AlertTriangle,
    Download,
    FileInput,
    ImageOff,
    MessageSquare,
    PencilLine,
    Plus,
    Search,
    Settings,
    Sparkles,
    Trash2,
    UploadCloud,
    Users,
    X,
} from "lucide-preact";
import type { RefObject } from "preact";
import { useMemo, useRef, useState } from "preact/hooks";

import {
    chatDisplayTitle,
    defaultGroupTitle,
    isGroupChat,
} from "#frontend/lib/chats/normalize";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type {
    CharacterSummary,
    ChatSummary,
    GroupGreetingMode,
    PersonaSummary,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

import { PersonaBar } from "../personas/persona-bar";
import { PluginSidebarPanels } from "../plugins/plugin-surfaces";
import { ChatList } from "./components/chat-list";
import { GroupChatCreator } from "./components/group-chat-creator";
import { useCharacterCardDrop } from "./hooks/use-character-card-drop";
import { formatChatCount, formatChatMeta, normalizeFilterText } from "./sidebar-helpers";

type SidebarProps = {
    activeChatId: string;
    activeCharacterId: string;
    pendingCharacterId?: string;
    chats: ChatSummary[];
    chatCountsByCharacterId: Record<string, number>;
    chatImportStatus?: string;
    chatImportStatusFading?: boolean;
    chatLoadError?: string;
    characters: CharacterSummary[];
    characterImportStatus?: string;
    characterLoadError?: string;
    hasCharacters: boolean;
    isOpen: boolean;
    persona: SmileyPersona;
    personas: PersonaSummary[];
    pluginSnapshot: PluginAppSnapshot;
    userStatus: UserStatus;
    onCreateCharacter: () => void;
    onImportCharacterFiles: (files: File[]) => void;
    onImportChatFile: (file: File) => void;
    onNewChat: () => void;
    onNewGroupChat: (
        characterIds: string[],
        title?: string,
        greetingMode?: GroupGreetingMode,
    ) => void;
    onOpenChange: (isOpen: boolean) => void;
    onOpenSettings: () => void;
    onOpenPersonasSettings: () => void;
    onChangeGroupAvatar: (chatId: string, file: File) => void;
    onDeleteChat: (chatId: string) => void;
    onDeleteCharacter: (characterId: string, options?: { deleteChats?: boolean }) => void;
    onExportCharacter: (characterId: string, format: "json" | "png") => void;
    onRemoveCharacterAvatar: (characterId: string) => void;
    onRenameChat: (chatId: string, title: string) => void;
    onSelectChat: (chatId: string) => void;
    onSelectCharacter: (characterId: string) => void;
    onSelectPersona: (personaId: string) => void;
    onStatusChange: (status: UserStatus) => void;
};

type CharacterRailProps = {
    activeCharacterId: string;
    characters: CharacterSummary[];
    importInputRef: RefObject<HTMLInputElement>;
    isCharacterDropActive: boolean;
    pendingCharacterId?: string;
    onCharacterDragEnter: (event: DragEvent) => void;
    onCharacterDragLeave: (event: DragEvent) => void;
    onCharacterDragOver: (event: DragEvent) => void;
    onCharacterDrop: (event: DragEvent) => void;
    onCreateCharacter: () => void;
    onImportFiles: (files: File[]) => void;
    onOpenSettings: () => void;
    onOpenCharacterMenu: (event: MouseEvent, character: CharacterSummary) => void;
    onSelectCharacter: (characterId: string) => void;
};

function CharacterRail({
    activeCharacterId,
    characters,
    importInputRef,
    isCharacterDropActive,
    pendingCharacterId,
    onCharacterDragEnter,
    onCharacterDragLeave,
    onCharacterDragOver,
    onCharacterDrop,
    onCreateCharacter,
    onImportFiles,
    onOpenSettings,
    onOpenCharacterMenu,
    onSelectCharacter,
}: CharacterRailProps) {
    const activeRowCharacterId = pendingCharacterId || activeCharacterId;

    return (
        <div
            className={`character-rail ${isCharacterDropActive ? "drag-active" : ""}`}
            aria-label="Character roster"
            onDragEnter={onCharacterDragEnter}
            onDragOver={onCharacterDragOver}
            onDragLeave={onCharacterDragLeave}
            onDrop={onCharacterDrop}
        >
            <div className="character-rail-brand" title="SmileyChat">
                <Sparkles size={20} />
            </div>
            <div className="character-rail-divider" />
            <div className="character-rail-roster" role="list">
                {characters.length > 0 ? (
                    characters.map((character) => {
                        const isPending = character.id === pendingCharacterId;
                        const isActive = character.id === activeRowCharacterId;

                        return (
                            <button
                                className={`character-rail-avatar ${
                                    isActive ? "active" : ""
                                } ${isPending ? "pending" : ""}`}
                                key={character.id}
                                type="button"
                                title={character.name}
                                aria-label={character.name}
                                aria-current={isActive ? "true" : undefined}
                                aria-busy={isPending ? "true" : undefined}
                                onClick={() => onSelectCharacter(character.id)}
                                onContextMenu={(event) =>
                                    onOpenCharacterMenu(event, character)
                                }
                            >
                                {character.avatar ? (
                                    <img src={character.avatar.path} alt="" />
                                ) : (
                                    <span>{character.name.trim().charAt(0) || "?"}</span>
                                )}
                            </button>
                        );
                    })
                ) : (
                    <div className="character-rail-empty" title="No characters yet">
                        ?
                    </div>
                )}
            </div>
            <div className="character-rail-actions">
                <button
                    className="character-rail-action"
                    type="button"
                    title="New character"
                    aria-label="New character"
                    onClick={onCreateCharacter}
                >
                    <Plus size={20} />
                </button>
                <button
                    className="character-rail-action"
                    type="button"
                    title="Import character files"
                    aria-label="Import character files"
                    onClick={() => importInputRef.current?.click()}
                >
                    <UploadCloud size={19} />
                </button>
                <button
                    className="character-rail-action"
                    type="button"
                    title="Open settings"
                    aria-label="Open settings"
                    onClick={onOpenSettings}
                >
                    <Settings size={19} />
                </button>
                <input
                    ref={importInputRef}
                    hidden
                    type="file"
                    accept=".json,.png,application/json,image/png"
                    multiple
                    onChange={(event) => {
                        const input = event.currentTarget as HTMLInputElement;
                        const files = Array.from(input.files ?? []);

                        onImportFiles(files);

                        input.value = "";
                    }}
                />
            </div>
        </div>
    );
}

export function SidebarContainer(props: SidebarProps) {
    return <Sidebar {...props} />;
}

export function Sidebar({
    activeChatId,
    activeCharacterId,
    pendingCharacterId,
    chats,
    chatImportStatus,
    chatImportStatusFading,
    chatLoadError,
    chatCountsByCharacterId,
    characters,
    characterImportStatus,
    characterLoadError,
    hasCharacters,
    isOpen,
    persona,
    personas,
    pluginSnapshot,
    userStatus,
    onCreateCharacter,
    onImportCharacterFiles,
    onImportChatFile,
    onNewChat,
    onNewGroupChat,
    onOpenChange,
    onOpenSettings,
    onOpenPersonasSettings,
    onChangeGroupAvatar,
    onDeleteChat,
    onDeleteCharacter,
    onExportCharacter,
    onRemoveCharacterAvatar,
    onRenameChat,
    onSelectChat,
    onSelectCharacter,
    onSelectPersona,
    onStatusChange,
}: SidebarProps) {
    const importInputRef = useRef<HTMLInputElement>(null);
    const chatImportInputRef = useRef<HTMLInputElement>(null);
    const groupAvatarInputRef = useRef<HTMLInputElement>(null);
    const {
        handleCharacterDragEnter,
        handleCharacterDragLeave,
        handleCharacterDragOver,
        handleCharacterDrop,
        importFiles,
        isCharacterDropActive,
    } = useCharacterCardDrop({ onImportCharacterFiles });
    const [contextMenu, setContextMenu] = useState<
        | {
              character: CharacterSummary;
              x: number;
              y: number;
          }
        | undefined
    >();
    const [chatContextMenu, setChatContextMenu] = useState<
        | {
              chat: ChatSummary;
              x: number;
              y: number;
          }
        | undefined
    >();
    const [avatarDeleteCandidate, setAvatarDeleteCandidate] = useState<
        CharacterSummary | undefined
    >();
    const [characterDeleteCandidate, setCharacterDeleteCandidate] = useState<
        CharacterSummary | undefined
    >();
    const [renameCandidate, setRenameCandidate] = useState<ChatSummary | undefined>();
    const [renameDraft, setRenameDraft] = useState("");
    const [chatDeleteCandidate, setChatDeleteCandidate] = useState<
        ChatSummary | undefined
    >();
    const [groupAvatarTarget, setGroupAvatarTarget] = useState<ChatSummary | undefined>();
    const [groupCreateOpen, setGroupCreateOpen] = useState(false);
    const [groupTitleDraft, setGroupTitleDraft] = useState("");
    const [groupGreetingMode, setGroupGreetingMode] = useState<GroupGreetingMode>("all");
    const [chatFilter, setChatFilter] = useState("");
    const [selectedGroupCharacterIds, setSelectedGroupCharacterIds] = useState<string[]>(
        [],
    );

    function openCharacterMenu(event: MouseEvent, character: CharacterSummary) {
        event.preventDefault();
        setContextMenu({
            character,
            x: event.clientX,
            y: event.clientY,
        });
    }

    function openChatMenu(event: MouseEvent, chat: ChatSummary) {
        event.preventDefault();
        setChatContextMenu({
            chat,
            x: event.clientX,
            y: event.clientY,
        });
    }

    function requestRenameChat(chat: ChatSummary) {
        setChatContextMenu(undefined);
        setRenameCandidate(chat);
        setRenameDraft(chat.title ?? "");
    }

    function requestDeleteChat(chat: ChatSummary) {
        setChatContextMenu(undefined);
        setChatDeleteCandidate(chat);
    }

    function requestGroupAvatarChange(chat: ChatSummary) {
        setChatContextMenu(undefined);
        setGroupAvatarTarget(chat);
        groupAvatarInputRef.current?.click();
    }

    function submitRename(event: SubmitEvent) {
        event.preventDefault();

        if (!renameCandidate) {
            return;
        }

        onRenameChat(renameCandidate.id, renameDraft);
        setRenameCandidate(undefined);
        setRenameDraft("");
    }

    function confirmAvatarDelete() {
        if (!avatarDeleteCandidate) {
            return;
        }

        onRemoveCharacterAvatar(avatarDeleteCandidate.id);
        setAvatarDeleteCandidate(undefined);
    }

    function requestAvatarDelete(character: CharacterSummary) {
        setContextMenu(undefined);
        setAvatarDeleteCandidate(character);
    }

    function requestCharacterDelete(character: CharacterSummary) {
        setContextMenu(undefined);
        setCharacterDeleteCandidate(character);
    }

    function confirmCharacterDelete() {
        if (!characterDeleteCandidate) {
            return;
        }

        onDeleteCharacter(characterDeleteCandidate.id);
        setCharacterDeleteCandidate(undefined);
    }

    function confirmCharacterDeleteWithChats(deleteChats: boolean) {
        if (!characterDeleteCandidate) {
            return;
        }

        onDeleteCharacter(characterDeleteCandidate.id, { deleteChats });
        setCharacterDeleteCandidate(undefined);
    }

    function confirmChatDelete() {
        if (!chatDeleteCandidate) {
            return;
        }

        onDeleteChat(chatDeleteCandidate.id);
        setChatDeleteCandidate(undefined);
    }

    function openGroupCreate() {
        setSelectedGroupCharacterIds(activeCharacterId ? [activeCharacterId] : []);
        setGroupTitleDraft("");
        setGroupGreetingMode("all");
        setChatFilter("");
        setGroupCreateOpen(true);
    }

    function closeGroupCreate() {
        setGroupCreateOpen(false);
        setGroupTitleDraft("");
        setGroupGreetingMode("all");
        setSelectedGroupCharacterIds([]);
    }

    function toggleGroupCharacter(characterId: string) {
        setSelectedGroupCharacterIds((current) =>
            current.includes(characterId)
                ? current.filter((item) => item !== characterId)
                : [...current, characterId],
        );
    }

    function submitGroupCreate(event: SubmitEvent) {
        event.preventDefault();

        if (selectedGroupCharacterIds.length === 0) {
            return;
        }

        onNewGroupChat(selectedGroupCharacterIds, groupTitleDraft, groupGreetingMode);
        closeGroupCreate();
    }

    const selectedGroupMembers = useMemo(
        () =>
            selectedGroupCharacterIds
                .map((characterId, index) => {
                    const character = characters.find((item) => item.id === characterId);

                    if (!character) {
                        return undefined;
                    }

                    return {
                        characterId: character.id,
                        name: character.name,
                        ...(character.avatar?.path
                            ? { avatarPath: character.avatar.path }
                            : {}),
                        order: index,
                    };
                })
                .filter((member): member is NonNullable<typeof member> =>
                    Boolean(member),
                ),
        [characters, selectedGroupCharacterIds],
    );
    const groupDefaultTitle = useMemo(
        () =>
            selectedGroupMembers.length
                ? defaultGroupTitle(selectedGroupMembers)
                : "Group: choose at least one character",
        [selectedGroupMembers],
    );
    const activeCharacter = useMemo(
        () => characters.find((character) => character.id === activeCharacterId),
        [activeCharacterId, characters],
    );
    const contextualChats = useMemo(
        () =>
            chats.filter((chat) =>
                isGroupChat(chat)
                    ? (chat.members ?? []).some(
                          (member) => member.characterId === activeCharacterId,
                      )
                    : chat.characterId === activeCharacterId,
            ),
        [activeCharacterId, chats],
    );
    const normalizedChatFilter = useMemo(
        () => normalizeFilterText(chatFilter),
        [chatFilter],
    );
    const hasChatFilter = normalizedChatFilter.length > 0;
    const filteredContextualChats = useMemo(
        () =>
            hasChatFilter
                ? contextualChats.filter((chat) =>
                      normalizeFilterText(
                          `${chatDisplayTitle(chat)} ${formatChatMeta(chat)}`,
                      ).includes(normalizedChatFilter),
                  )
                : contextualChats,
        [contextualChats, hasChatFilter, normalizedChatFilter],
    );

    return (
        <>
            <aside
                className={`sidebar-container ${isOpen ? "open" : "collapsed"}`}
                aria-label="Chats and characters"
            >
                <CharacterRail
                    activeCharacterId={activeCharacterId}
                    characters={characters}
                    importInputRef={importInputRef}
                    isCharacterDropActive={isCharacterDropActive}
                    pendingCharacterId={pendingCharacterId}
                    onCharacterDragEnter={handleCharacterDragEnter}
                    onCharacterDragLeave={handleCharacterDragLeave}
                    onCharacterDragOver={handleCharacterDragOver}
                    onCharacterDrop={handleCharacterDrop}
                    onCreateCharacter={onCreateCharacter}
                    onImportFiles={importFiles}
                    onOpenSettings={onOpenSettings}
                    onOpenCharacterMenu={openCharacterMenu}
                    onSelectCharacter={onSelectCharacter}
                />

                {isOpen && (
                    <div className="left-rail open">
                        <div className="chat-rail-header">
                            <div className="chat-rail-title-block">
                                <span>Chats with</span>
                                <strong>
                                    {activeCharacter?.name ?? "No character selected"}
                                </strong>
                            </div>
                            <button
                                className="rail-icon-button sidebar-mobile-close-btn"
                                type="button"
                                title="Close sidebar"
                                aria-label="Close sidebar"
                                onClick={() => onOpenChange(false)}
                            >
                                <X size={15} />
                            </button>
                        </div>

                <div className="chat-rail-actions">
                    <button
                        className="new-chat-button"
                        type="button"
                        title="Start a new chat with the active character"
                        disabled={!hasCharacters}
                        onClick={onNewChat}
                    >
                        <MessageSquare size={16} />
                        New chat
                    </button>
                    <button
                        className="new-chat-button secondary"
                        type="button"
                        title="Start a group chat"
                        disabled={!hasCharacters}
                        onClick={openGroupCreate}
                    >
                        <Users size={16} />
                        New group
                    </button>
                </div>

                <input
                    ref={chatImportInputRef}
                    hidden
                    type="file"
                    accept=".jsonl,.json,application/json"
                    onChange={(event) => {
                        const input = event.currentTarget as HTMLInputElement;
                        const file = input.files?.[0];

                        if (file) {
                            onImportChatFile(file);
                        }

                        input.value = "";
                    }}
                />
                <input
                    ref={groupAvatarInputRef}
                    hidden
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                        const input = event.currentTarget as HTMLInputElement;
                        const file = input.files?.[0];

                        if (file && groupAvatarTarget) {
                            onChangeGroupAvatar(groupAvatarTarget.id, file);
                        }

                        setGroupAvatarTarget(undefined);
                        input.value = "";
                    }}
                />

                {groupCreateOpen && (
                    <GroupChatCreator
                        characters={characters}
                        groupDefaultTitle={groupDefaultTitle}
                        groupGreetingMode={groupGreetingMode}
                        groupTitleDraft={groupTitleDraft}
                        selectedGroupCharacterIds={selectedGroupCharacterIds}
                        selectedGroupMembers={selectedGroupMembers}
                        onClose={closeGroupCreate}
                        onGroupGreetingModeChange={setGroupGreetingMode}
                        onGroupTitleDraftChange={setGroupTitleDraft}
                        onSubmit={submitGroupCreate}
                        onToggleGroupCharacter={toggleGroupCharacter}
                    />
                )}

                {!groupCreateOpen && (
                    <>
                        <div className="sidebar-filter-bar">
                            <Search size={15} aria-hidden="true" />
                            <input
                                type="search"
                                value={chatFilter}
                                placeholder="Search chats"
                                aria-label="Search chats"
                                onInput={(event) =>
                                    setChatFilter(
                                        (event.currentTarget as HTMLInputElement).value,
                                    )
                                }
                            />
                            {chatFilter && (
                                <button
                                    type="button"
                                    title="Clear search"
                                    aria-label="Clear chat search"
                                    onClick={() => setChatFilter("")}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        <section className="rail-section chat-section">
                            <div className="rail-title with-action">
                                <span>
                                    Chat history
                                    {hasChatFilter && (
                                        <small>{filteredContextualChats.length}</small>
                                    )}
                                </span>
                                <span className="rail-actions">
                                    <button
                                        className="rail-icon-button"
                                        type="button"
                                        title={
                                            hasCharacters
                                                ? "Import SillyTavern chat (.jsonl) for the active character"
                                                : "Select a character before importing a chat"
                                        }
                                        disabled={!hasCharacters}
                                        onClick={() =>
                                            chatImportInputRef.current?.click()
                                        }
                                    >
                                        <FileInput size={14} />
                                    </button>
                                </span>
                            </div>
                            <ChatList
                                activeChatId={activeChatId}
                                directChats={contextualChats}
                                filteredDirectChats={filteredContextualChats}
                                hasCharacters={hasCharacters}
                                hasSidebarFilter={hasChatFilter}
                                onOpenChatMenu={openChatMenu}
                                onSelectChat={onSelectChat}
                            />
                            {chatImportStatus && (
                                <p
                                    className={`rail-status${
                                        chatImportStatusFading ? "fading" : ""
                                    }`}
                                >
                                    {chatImportStatus}
                                </p>
                            )}
                            {chatLoadError && (
                                <p className="rail-error">{chatLoadError}</p>
                            )}
                        </section>

                        {characterImportStatus && (
                            <p className="rail-status">{characterImportStatus}</p>
                        )}
                        {characterLoadError && (
                            <p className="rail-error">{characterLoadError}</p>
                        )}

                        <PluginSidebarPanels side="left" snapshot={pluginSnapshot} />
                    </>
                )}

                    <PersonaBar
                        persona={persona}
                        personas={personas}
                        status={userStatus}
                        onOpenPersonasSettings={onOpenPersonasSettings}
                        onPersonaSelect={onSelectPersona}
                        onStatusChange={onStatusChange}
                    />
                </div>
            )}
            </aside>

            {contextMenu && (
                <div
                    className="context-menu-backdrop"
                    role="presentation"
                    onClick={() => setContextMenu(undefined)}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        setContextMenu(undefined);
                    }}
                >
                    <div
                        className="character-context-menu"
                        role="menu"
                        style={{
                            left: contextMenu.x,
                            top: contextMenu.y,
                        }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div
                            className="context-submenu"
                            role="group"
                            aria-label="Export card"
                        >
                            <span>Export card</span>
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    onExportCharacter(contextMenu.character.id, "json");
                                    setContextMenu(undefined);
                                }}
                            >
                                <Download size={14} />
                                JSON
                            </button>
                            <button
                                type="button"
                                role="menuitem"
                                disabled={contextMenu.character.avatar?.type !== "png"}
                                title={
                                    contextMenu.character.avatar?.type === "png"
                                        ? "Export PNG card"
                                        : "PNG export needs a PNG avatar"
                                }
                                onClick={() => {
                                    onExportCharacter(contextMenu.character.id, "png");
                                    setContextMenu(undefined);
                                }}
                            >
                                <Download size={14} />
                                PNG
                            </button>
                        </div>
                        <button
                            className="danger-menu-item"
                            type="button"
                            role="menuitem"
                            disabled={!contextMenu.character.avatar}
                            onClick={() => requestAvatarDelete(contextMenu.character)}
                        >
                            <ImageOff size={14} />
                            Remove image
                        </button>
                        <button
                            className="danger-menu-item"
                            type="button"
                            role="menuitem"
                            onClick={() => requestCharacterDelete(contextMenu.character)}
                        >
                            <Trash2 size={14} />
                            Delete character
                        </button>
                    </div>
                </div>
            )}

            {chatContextMenu && (
                <div
                    className="context-menu-backdrop"
                    role="presentation"
                    onClick={() => setChatContextMenu(undefined)}
                    onContextMenu={(event) => {
                        event.preventDefault();
                        setChatContextMenu(undefined);
                    }}
                >
                    <div
                        className="character-context-menu"
                        role="menu"
                        style={{
                            left: chatContextMenu.x,
                            top: chatContextMenu.y,
                        }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => requestRenameChat(chatContextMenu.chat)}
                        >
                            <PencilLine size={14} />
                            Rename
                        </button>
                        {isGroupChat(chatContextMenu.chat) && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() =>
                                    requestGroupAvatarChange(chatContextMenu.chat)
                                }
                            >
                                <ImageOff size={14} />
                                Change group image
                            </button>
                        )}
                        <button
                            className="danger-menu-item"
                            type="button"
                            role="menuitem"
                            onClick={() => requestDeleteChat(chatContextMenu.chat)}
                        >
                            <Trash2 size={14} />
                            Delete
                        </button>
                    </div>
                </div>
            )}

            {avatarDeleteCandidate && (
                <div
                    className="message-confirm-backdrop"
                    role="presentation"
                    onClick={() => setAvatarDeleteCandidate(undefined)}
                >
                    <section
                        className="message-confirm-dialog compact"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Remove character image"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header>
                            <AlertTriangle size={19} />
                            <h2>Remove image?</h2>
                        </header>
                        <p>
                            This clears the image for {avatarDeleteCandidate.name}. The
                            character data stays intact.
                        </p>
                        <div className="message-confirm-actions">
                            <button
                                type="button"
                                onClick={() => setAvatarDeleteCandidate(undefined)}
                            >
                                Cancel
                            </button>
                            <button
                                className="danger-button"
                                type="button"
                                onClick={confirmAvatarDelete}
                            >
                                <Trash2 size={15} />
                                Remove
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {characterDeleteCandidate && (
                <div
                    className="message-confirm-backdrop"
                    role="presentation"
                    onClick={() => setCharacterDeleteCandidate(undefined)}
                >
                    <section
                        className="message-confirm-dialog compact character-delete-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Delete character"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header>
                            <AlertTriangle size={19} />
                            <h2>Delete character?</h2>
                        </header>
                        <p>
                            {chatCountsByCharacterId[characterDeleteCandidate.id]
                                ? `This deletes ${characterDeleteCandidate.name} from userData. It has ${formatChatCount(
                                      chatCountsByCharacterId[
                                          characterDeleteCandidate.id
                                      ],
                                  )}.`
                                : `This deletes ${characterDeleteCandidate.name} from userData. This cannot be undone.`}
                        </p>
                        {Boolean(
                            chatCountsByCharacterId[characterDeleteCandidate.id],
                        ) && (
                            <p>
                                Keep chats to archive them under this character ID. If you
                                import the character again later, SmileyChat will
                                reconnect matching archived chats when it can restore the
                                same ID.
                            </p>
                        )}
                        <div className="message-confirm-actions">
                            <button
                                type="button"
                                onClick={() => setCharacterDeleteCandidate(undefined)}
                            >
                                Cancel
                            </button>
                            {chatCountsByCharacterId[characterDeleteCandidate.id] ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            confirmCharacterDeleteWithChats(false)
                                        }
                                    >
                                        Keep chats
                                    </button>
                                    <button
                                        className="danger-button"
                                        type="button"
                                        onClick={() =>
                                            confirmCharacterDeleteWithChats(true)
                                        }
                                    >
                                        <Trash2 size={15} />
                                        Delete all
                                    </button>
                                </>
                            ) : (
                                <button
                                    className="danger-button"
                                    type="button"
                                    onClick={confirmCharacterDelete}
                                >
                                    <Trash2 size={15} />
                                    Delete
                                </button>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {renameCandidate && (
                <div
                    className="message-confirm-backdrop"
                    role="presentation"
                    onClick={() => setRenameCandidate(undefined)}
                >
                    <form
                        className="message-confirm-dialog compact rename-chat-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Rename chat"
                        onClick={(event) => event.stopPropagation()}
                        onSubmit={submitRename}
                    >
                        <header>
                            <PencilLine size={19} />
                            <h2>Rename chat</h2>
                        </header>
                        <label>
                            <span>Title</span>
                            <input
                                autoFocus
                                value={renameDraft}
                                placeholder={renameCandidate.defaultTitle}
                                onInput={(event) =>
                                    setRenameDraft(
                                        (event.currentTarget as HTMLInputElement).value,
                                    )
                                }
                            />
                        </label>
                        <p>Leave it empty to use the default title.</p>
                        <div className="message-confirm-actions">
                            <button
                                type="button"
                                onClick={() => setRenameCandidate(undefined)}
                            >
                                Cancel
                            </button>
                            <button type="submit">
                                <PencilLine size={15} />
                                Rename
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {chatDeleteCandidate && (
                <div
                    className="message-confirm-backdrop"
                    role="presentation"
                    onClick={() => setChatDeleteCandidate(undefined)}
                >
                    <section
                        className="message-confirm-dialog compact"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Delete chat"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header>
                            <AlertTriangle size={19} />
                            <h2>Delete chat?</h2>
                        </header>
                        <p>
                            This deletes "{chatDisplayTitle(chatDeleteCandidate)}" and its
                            saved messages from userData. This cannot be undone.
                        </p>
                        <div className="message-confirm-actions">
                            <button
                                type="button"
                                onClick={() => setChatDeleteCandidate(undefined)}
                            >
                                Cancel
                            </button>
                            <button
                                className="danger-button"
                                type="button"
                                onClick={confirmChatDelete}
                            >
                                <Trash2 size={15} />
                                Delete
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </>
    );
}
