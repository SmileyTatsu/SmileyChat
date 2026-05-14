import {
    AlertTriangle,
    Download,
    FileInput,
    ImageOff,
    MessageSquare,
    PencilLine,
    Plus,
    Sparkles,
    Trash2,
    UploadCloud,
} from "lucide-preact";
import { useRef, useState } from "preact/hooks";
import { chatDisplayTitle } from "../../lib/chats/normalize";
import { characterInitialAvatar } from "../../lib/characters/avatar";
import type {
    CharacterSummary,
    ChatSummary,
    PersonaSummary,
    SmileyPersona,
    UserStatus,
} from "../../types";
import { PersonaBar } from "../personas/PersonaBar";

type SidebarProps = {
    activeChatId: string;
    activeCharacterId: string;
    chats: ChatSummary[];
    chatCountsByCharacterId: Record<string, number>;
    chatLoadError?: string;
    characters: CharacterSummary[];
    characterImportStatus?: string;
    characterLoadError?: string;
    hasCharacters: boolean;
    persona: SmileyPersona;
    personas: PersonaSummary[];
    userStatus: UserStatus;
    onCreateCharacter: () => void;
    onImportCharacterFiles: (files: File[]) => void;
    onNewChat: () => void;
    onOpenSettings: () => void;
    onOpenPersonasSettings: () => void;
    onDeleteChat: (chatId: string) => void;
    onDeleteCharacter: (
        characterId: string,
        options?: { deleteChats?: boolean },
    ) => void;
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
    chatLoadError,
    chatCountsByCharacterId,
    characters,
    characterImportStatus,
    characterLoadError,
    hasCharacters,
    persona,
    personas,
    userStatus,
    onCreateCharacter,
    onImportCharacterFiles,
    onNewChat,
    onOpenSettings,
    onOpenPersonasSettings,
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

    return (
        <aside className="left-rail" aria-label="Chats and characters">
            <div className="brand">
                <div className="brand-mark">
                    <Sparkles size={18} />
                </div>
                <div>
                    <strong>SmileyChat</strong>
                    <span>Local app</span>
                </div>
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
                                    character.id === activeCharacterId ? "active" : ""
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
                            title="New chat"
                            disabled={!hasCharacters}
                            onClick={onNewChat}
                        >
                            <Plus size={14} />
                        </button>
                    </span>
                </div>
                <div className="chat-list">
                    {chats.length > 0 ? (
                        chats.map((chat) => (
                            <button
                                className={`chat-row ${chat.id === activeChatId ? "active" : ""}`}
                                key={chat.id}
                                type="button"
                                onClick={() => onSelectChat(chat.id)}
                                onContextMenu={(event) => openChatMenu(event, chat)}
                            >
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
                {chatLoadError && <p className="rail-error">{chatLoadError}</p>}
            </section>

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
                        {Boolean(chatCountsByCharacterId[characterDeleteCandidate.id]) && (
                            <p>
                                Keep chats to archive them under this character ID. If
                                you import the character again later, SmileyChat will
                                reconnect matching archived chats when it can restore
                                the same ID.
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
