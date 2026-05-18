import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Download,
    FileInput,
    ImageOff,
    MessageSquare,
    PencilLine,
    Plus,
    Settings,
    Sparkles,
    Trash2,
    UploadCloud,
    Users,
} from "lucide-preact";
import { useRef, useState } from "preact/hooks";

import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
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
import { GroupAvatar } from "../chat/group-avatar";

type SidebarProps = {
    activeChatId: string;
    activeCharacterId: string;
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

export function Sidebar({
    activeChatId,
    activeCharacterId,
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
    const dragDepthRef = useRef(0);
    const [isCharacterDropActive, setIsCharacterDropActive] = useState(false);
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
    const [groupGreetingMode, setGroupGreetingMode] =
        useState<GroupGreetingMode>("all");
    const [selectedGroupCharacterIds, setSelectedGroupCharacterIds] = useState<
        string[]
    >([]);

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

    function importFiles(files: File[]) {
        const characterFiles = files.filter(isCharacterCardFile);

        if (characterFiles.length) {
            onImportCharacterFiles(characterFiles);
        }
    }

    function handleCharacterDragEnter(event: DragEvent) {
        if (!hasDraggedFiles(event)) {
            return;
        }

        event.preventDefault();
        dragDepthRef.current += 1;
        setIsCharacterDropActive(true);
    }

    function handleCharacterDragOver(event: DragEvent) {
        if (!hasDraggedFiles(event)) {
            return;
        }

        event.preventDefault();
        event.dataTransfer!.dropEffect = "copy";
    }

    function handleCharacterDragLeave(event: DragEvent) {
        if (!hasDraggedFiles(event)) {
            return;
        }

        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

        if (dragDepthRef.current === 0) {
            setIsCharacterDropActive(false);
        }
    }

    function handleCharacterDrop(event: DragEvent) {
        if (!hasDraggedFiles(event)) {
            return;
        }

        event.preventDefault();
        dragDepthRef.current = 0;
        setIsCharacterDropActive(false);
        importFiles(Array.from(event.dataTransfer?.files ?? []));
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
        setGroupCreateOpen(true);
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
        setGroupCreateOpen(false);
        setGroupTitleDraft("");
    }

    const selectedGroupMembers = selectedGroupCharacterIds
        .map((characterId, index) => {
            const character = characters.find((item) => item.id === characterId);

            if (!character) {
                return undefined;
            }

            return {
                characterId: character.id,
                name: character.name,
                ...(character.avatar?.path ? { avatarPath: character.avatar.path } : {}),
                order: index,
            };
        })
        .filter((member): member is NonNullable<typeof member> => Boolean(member));
    const groupDefaultTitle = selectedGroupMembers.length
        ? defaultGroupTitle(selectedGroupMembers)
        : "Group: choose at least one character";
    const groupChats = chats.filter(isGroupChat);
    const activeGroupChat = groupChats.some((chat) => chat.id === activeChatId);
    const directChats = activeGroupChat
        ? groupChats.filter((chat) => chat.id === activeChatId)
        : chats.filter(
              (chat) => !isGroupChat(chat) && chat.characterId === activeCharacterId,
          );

    if (!isOpen) {
        return (
            <aside className="left-rail collapsed" aria-label="Chats and characters">
                <button
                    className="collapsed-panel-button"
                    type="button"
                    title="Show left sidebar"
                    aria-label="Show left sidebar"
                    onClick={() => onOpenChange(true)}
                >
                    <ChevronRight size={18} />
                    <span>Sidebar</span>
                </button>
                <button
                    className="collapsed-rail-settings"
                    type="button"
                    title="Open settings"
                    aria-label="Open settings"
                    onClick={onOpenSettings}
                >
                    <Settings size={18} />
                </button>
            </aside>
        );
    }

    return (
        <aside className="left-rail open" aria-label="Chats and characters">
            <div className="brand">
                <div className="brand-main">
                    <div className="brand-mark">
                        <Sparkles size={18} />
                    </div>
                    <div>
                        <strong>SmileyChat</strong>
                        <span>Local app</span>
                    </div>
                </div>
                <button
                    className="icon-button"
                    type="button"
                    title="Hide left sidebar"
                    aria-label="Hide left sidebar"
                    onClick={() => onOpenChange(false)}
                >
                    <ChevronLeft size={18} />
                </button>
            </div>

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

            <section className="rail-section">
                <div className="rail-title with-action">
                    <span>Characters</span>
                    <span>
                        <button
                            className="rail-icon-button"
                            type="button"
                            title="Import character files"
                            onClick={() => importInputRef.current?.click()}
                        >
                            <FileInput size={14} />
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

                                importFiles(files);

                                input.value = "";
                            }}
                        />
                        <button
                            className="rail-icon-button"
                            type="button"
                            title="New character"
                            onClick={onCreateCharacter}
                        >
                            <Plus size={14} />
                        </button>
                    </span>
                </div>
                <div
                    className={`character-drop-zone ${
                        isCharacterDropActive ? "drag-active" : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    title="Import Tavern JSON or PNG character cards"
                    onClick={() => importInputRef.current?.click()}
                    onDragEnter={handleCharacterDragEnter}
                    onDragOver={handleCharacterDragOver}
                    onDragLeave={handleCharacterDragLeave}
                    onDrop={handleCharacterDrop}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            importInputRef.current?.click();
                        }
                    }}
                >
                    <UploadCloud size={18} />
                    <span>
                        <strong>Drop character cards</strong>
                        <small>JSON or PNG Tavern cards</small>
                    </span>
                </div>
                <div className="character-list">
                    {characters.length > 0 ? (
                        characters.map((character) => (
                            <button
                                className={`character-row ${
                                    character.id === activeCharacterId && !activeGroupChat
                                        ? "active"
                                        : ""
                                }`}
                                key={character.id}
                                type="button"
                                onClick={() => onSelectCharacter(character.id)}
                                onContextMenu={(event) =>
                                    openCharacterMenu(event, character)
                                }
                            >
                                {character.avatar ? (
                                    <img
                                        className="avatar image-avatar"
                                        src={character.avatar.path}
                                        alt=""
                                    />
                                ) : (
                                    <img
                                        className="avatar image-avatar"
                                        src={characterInitialAvatar(character.name)}
                                        alt=""
                                    />
                                )}
                                <span>
                                    <strong>{character.name}</strong>
                                    <small>
                                        {character.tagline || "No short description"}
                                    </small>
                                </span>
                            </button>
                        ))
                    ) : (
                        <div className="rail-empty-state">
                            <strong>No characters yet</strong>
                            <span>Create one or import a character card.</span>
                        </div>
                    )}
                    {groupChats.length > 0 && (
                        <>
                            <div className="rail-subtitle">Group chats</div>
                            {groupChats.map((chat) => (
                                <button
                                    className={`character-row group-chat-row ${
                                        chat.id === activeChatId ? "active" : ""
                                    }`}
                                    key={chat.id}
                                    type="button"
                                    onClick={() => onSelectChat(chat.id)}
                                    onContextMenu={(event) => openChatMenu(event, chat)}
                                >
                                    <GroupAvatar
                                        className="avatar"
                                        customPath={
                                            chat.group?.avatar?.type === "custom"
                                                ? chat.group.avatar.path
                                                : undefined
                                        }
                                        members={chat.members ?? []}
                                    />
                                    <span>
                                        <strong>{chatDisplayTitle(chat)}</strong>
                                        <small>{formatChatMeta(chat)}</small>
                                    </span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
                {characterImportStatus && (
                    <p className="rail-status">{characterImportStatus}</p>
                )}
                {characterLoadError && <p className="rail-error">{characterLoadError}</p>}
            </section>

            <section className="rail-section chat-section">
                <div className="rail-title with-action">
                    <span>Recent chats</span>
                    <span>
                        <button
                            className="rail-icon-button"
                            type="button"
                            title={
                                hasCharacters
                                    ? "Import SillyTavern chat (.jsonl) for the active character"
                                    : "Select a character before importing a chat"
                            }
                            disabled={!hasCharacters}
                            onClick={() => chatImportInputRef.current?.click()}
                        >
                            <FileInput size={14} />
                        </button>
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
                        <button
                            className="rail-icon-button"
                            type="button"
                            title="New chat"
                            disabled={!hasCharacters}
                            onClick={onNewChat}
                        >
                            <Plus size={14} />
                        </button>
                        <button
                            className="rail-icon-button"
                            type="button"
                            title="New group chat"
                            disabled={!hasCharacters}
                            onClick={openGroupCreate}
                        >
                            <Users size={14} />
                        </button>
                    </span>
                </div>
                <div className="chat-list">
                    {directChats.length > 0 ? (
                        directChats.map((chat) => (
                            <button
                                className={`chat-row ${chat.id === activeChatId ? "active" : ""}`}
                                key={chat.id}
                                type="button"
                                onClick={() => onSelectChat(chat.id)}
                                onContextMenu={(event) => openChatMenu(event, chat)}
                            >
                                {isGroupChat(chat) ? (
                                    <GroupAvatar
                                        className="chat-row-avatar"
                                        customPath={
                                            chat.group?.avatar?.type === "custom"
                                                ? chat.group.avatar.path
                                                : undefined
                                        }
                                        members={chat.members ?? []}
                                    />
                                ) : (
                                    <span className="chat-row-avatar direct-chat-avatar">
                                        <MessageSquare size={15} />
                                    </span>
                                )}
                                <span>
                                    <strong>{chatDisplayTitle(chat)}</strong>
                                    <small>{formatChatMeta(chat)}</small>
                                </span>
                            </button>
                        ))
                    ) : (
                        <div className="rail-empty-state">
                            <strong>No chats yet</strong>
                            <span>
                                {hasCharacters
                                      ? "Start a chat when you are ready."
                                      : "Create a character before starting a chat."}
                            </span>
                        </div>
                    )}
                </div>
                {chatImportStatus && (
                    <p className={`rail-status${chatImportStatusFading ? "fading" : ""}`}>
                        {chatImportStatus}
                    </p>
                )}
                {chatLoadError && <p className="rail-error">{chatLoadError}</p>}
            </section>

            <PluginSidebarPanels side="left" snapshot={pluginSnapshot} />

            <PersonaBar
                persona={persona}
                personas={personas}
                status={userStatus}
                onOpenSettings={onOpenSettings}
                onOpenPersonasSettings={onOpenPersonasSettings}
                onPersonaSelect={onSelectPersona}
                onStatusChange={onStatusChange}
            />

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
                        className="message-confirm-dialog compact"
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

            {groupCreateOpen && (
                <div
                    className="message-confirm-backdrop"
                    role="presentation"
                    onClick={() => setGroupCreateOpen(false)}
                >
                    <form
                        className="message-confirm-dialog group-create-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Create group chat"
                        onClick={(event) => event.stopPropagation()}
                        onSubmit={submitGroupCreate}
                    >
                        <header>
                            <Users size={19} />
                            <h2>Create group chat</h2>
                        </header>
                        <label>
                            <span>Title</span>
                            <input
                                autoFocus
                                value={groupTitleDraft}
                                placeholder={groupDefaultTitle}
                                onInput={(event) =>
                                    setGroupTitleDraft(
                                        (event.currentTarget as HTMLInputElement).value,
                                    )
                                }
                            />
                        </label>
                        <div className="group-create-preview">
                            <GroupAvatar members={selectedGroupMembers} />
                            <span>{groupTitleDraft.trim() || groupDefaultTitle}</span>
                        </div>
                        <label>
                            <span>Default greetings</span>
                            <select
                                value={groupGreetingMode}
                                onChange={(event) =>
                                    setGroupGreetingMode(
                                        event.currentTarget.value as GroupGreetingMode,
                                    )
                                }
                            >
                                <option value="all">All member greetings</option>
                                <option value="first">First member only</option>
                                <option value="none">No default greeting</option>
                            </select>
                        </label>
                        <div className="group-member-picker">
                            {characters.map((character) => (
                                <label
                                    className="group-member-option"
                                    key={character.id}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedGroupCharacterIds.includes(
                                            character.id,
                                        )}
                                        onChange={() =>
                                            toggleGroupCharacter(character.id)
                                        }
                                    />
                                    <img
                                        className="avatar image-avatar"
                                        src={
                                            character.avatar?.path ||
                                            characterInitialAvatar(character.name)
                                        }
                                        alt=""
                                    />
                                    <span>{character.name}</span>
                                </label>
                            ))}
                        </div>
                        <p>Choose at least one character. Leave the title empty to use the group member names.</p>
                        <div className="message-confirm-actions">
                            <button
                                type="button"
                                onClick={() => setGroupCreateOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={selectedGroupCharacterIds.length === 0}
                            >
                                <Users size={15} />
                                Create group
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </aside>
    );
}

function formatChatCount(count: number) {
    return `${count} saved chat${count === 1 ? "" : "s"}`;
}

function hasDraggedFiles(event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function isCharacterCardFile(file: File) {
    const name = file.name.toLowerCase();

    return (
        name.endsWith(".json") ||
        name.endsWith(".png") ||
        file.type === "application/json" ||
        file.type === "image/png"
    );
}

function formatChatMeta(chat: ChatSummary) {
    const messageCount = `${chat.messageCount} message${
        chat.messageCount === 1 ? "" : "s"
    }`;
    const lastMessage = formatLastMessageTime(chat.lastMessageAt);

    return lastMessage ? `${messageCount} - ${lastMessage}` : messageCount;
}

function formatLastMessageTime(value: string | undefined) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
        return "";
    }

    const now = new Date();
    const time = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });

    if (date.toDateString() === now.toDateString()) {
        return `Last today ${time}`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (date.toDateString() === yesterday.toDateString()) {
        return `Last yesterday ${time}`;
    }

    return `Last ${date.toLocaleDateString()} ${time}`;
}
