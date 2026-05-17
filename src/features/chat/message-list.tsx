import {
    AlertTriangle,
    Check,
    ChevronLeft,
    ChevronRight,
    Copy,
    FilePenLine,
    MoreHorizontal,
    Trash2,
    User,
    X,
} from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { cn } from "#frontend/lib/common/style";
import {
    getMessageAttachments,
    getMessageContent,
    getMessageReasoning,
    isActiveSwipeError,
} from "#frontend/lib/messages";
import {
    getMessageRenderers,
    getPluginMessageActions,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type { ChatMode, Message } from "#frontend/types";

import { MessageAttachments } from "./message/message-attachment";
import { MessageContent } from "./message/message-content";
import { MessageHeader } from "./message/message-header";
import { MessageReasoning } from "./message/message-reasoning";

type MessageListProps = {
    mode: ChatMode;
    messages: Message[];
    autoScroll: boolean;
    characterName: string;
    characterAvatarPath?: string;

    isTyping?: boolean;
    errorMessage?: string;

    showTimestamps: boolean;
    pendingSwipeMessageId?: string;
    showRpCharacterImages: boolean;

    onDeleteMessage: (messageId: string) => void;
    onEditMessage: (messageId: string, content: string) => void;
    onNextSwipe: (messageId: string) => void;
    onPreviousSwipe: (messageId: string) => void;
    pluginSnapshot: PluginAppSnapshot;
};

export function MessageList({
    autoScroll,
    characterAvatarPath,
    characterName,
    errorMessage,
    isTyping,
    messages,
    mode,
    pendingSwipeMessageId,
    showRpCharacterImages,
    showTimestamps,
    onDeleteMessage,
    onEditMessage,
    onNextSwipe,
    onPreviousSwipe,
    pluginSnapshot,
}: MessageListProps) {
    const shouldAutoScrollRef = useRef(true);
    const listRef = useRef<HTMLDivElement>(null);

    const [editingDraft, setEditingDraft] = useState("");
    const [editingMessageId, setEditingMessageId] = useState("");
    const [openMenuMessageId, setOpenMenuMessageId] = useState("");

    const [, setRegistryRevision] = useState(0);
    const [copyError, setCopyError] = useState("");
    const [deleteCandidate, setDeleteCandidate] = useState<Message | undefined>();

    useEffect(
        () => subscribeToPluginRegistry(() => setRegistryRevision((r) => r + 1)),
        [],
    );

    const scrollVersion = messages
        .map((message) => {
            const activeSwipe =
                message.swipes[message.activeSwipeIndex] ?? message.swipes[0];

            const ids = [
                message.id,
                message.activeSwipeIndex,
                activeSwipe?.id ?? "",
                activeSwipe?.content ?? "",
                activeSwipe?.reasoning ?? "",
            ];

            return ids.join(":");
        })
        .join("|");

    useEffect(() => {
        const list = listRef.current;
        if (!list || !autoScroll || !shouldAutoScrollRef.current) {
            return;
        }

        list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }, [autoScroll, errorMessage, isTyping, pendingSwipeMessageId, scrollVersion]);

    function updateAutoScrollPreference() {
        const list = listRef.current;
        if (!list) {
            return;
        }

        const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
        shouldAutoScrollRef.current = distanceFromBottom < 80;
    }

    function startEditing(message: Message) {
        setEditingMessageId(message.id);
        setEditingDraft(getMessageContent(message));
        setOpenMenuMessageId("");
    }

    function saveEdit(messageId: string) {
        const content = editingDraft.trim();
        if (!content) return;

        onEditMessage(messageId, content);
        setEditingMessageId("");
        setEditingDraft("");
    }

    async function copyMessage(message: Message) {
        try {
            await navigator.clipboard.writeText(getMessageContent(message));
            setCopyError("");
            setOpenMenuMessageId("");
        } catch {
            setCopyError("Could not copy message.");
        }
    }

    function requestDeleteMessage(message: Message) {
        setDeleteCandidate(message);
        setOpenMenuMessageId("");
    }

    function confirmDeleteMessage() {
        if (!deleteCandidate) {
            return;
        }

        onDeleteMessage(deleteCandidate.id);
        setDeleteCandidate(undefined);
    }

    const messageRenderers = getMessageRenderers();
    const pluginMessageActions = getPluginMessageActions();

    return (
        <div
            ref={listRef}
            aria-live="polite"
            className="message-list"
            onScroll={updateAutoScrollPreference}
        >
            {messages.map((message, index) => {
                const content = getMessageContent(message);
                const reasoning = getMessageReasoning(message);
                const attachments = getMessageAttachments(message);

                const isEditing = editingMessageId === message.id;
                const isPendingSwipe = pendingSwipeMessageId === message.id;
                const isFailedSwipe = isActiveSwipeError(message);

                const canPagePrevious = message.activeSwipeIndex > 0;
                const canPageForward = message.role === "character";

                const showSwipeControls =
                    message.role === "character" && index === messages.length - 1;
                const showRpCharacterAvatar =
                    mode === "rp" &&
                    showRpCharacterImages &&
                    message.role === "character";

                const avatar =
                    message.role === "character"
                        ? { path: characterAvatarPath, alt: "Character Avatar" }
                        : { path: message.authorAvatarPath, alt: "User Persona Avatar" };

                return (
                    <article
                        key={message.id}
                        onMouseLeave={() => setOpenMenuMessageId("")}
                        className={cn("message", {
                            "failed-swipe": isFailedSwipe,
                            "generating-swipe": isPendingSwipe,
                            "show-rp-character-avatar": showRpCharacterAvatar,
                        })}
                    >
                        <div className="message-avatar">
                            {avatar.path && <img src={avatar.path} alt={avatar.alt} />}
                            {!avatar.path && <User size={18} />}
                        </div>

                        <MessageHeader
                            message={message}
                            characterAvatarPath={characterAvatarPath}
                            showTimestamps={showTimestamps}
                        >
                            <div className="message-overlay-actions">
                                {showSwipeControls && (
                                    <div
                                        className="swipe-controls"
                                        aria-label="Message swipes"
                                    >
                                        <button
                                            type="button"
                                            title="Previous swipe"
                                            disabled={!canPagePrevious || isPendingSwipe}
                                            onClick={() => onPreviousSwipe(message.id)}
                                        >
                                            <ChevronLeft size={14} />
                                        </button>

                                        <span>
                                            {message.activeSwipeIndex + 1}/
                                            {message.swipes.length}
                                        </span>

                                        <button
                                            type="button"
                                            disabled={!canPageForward || isPendingSwipe}
                                            onClick={() => onNextSwipe(message.id)}
                                            title={
                                                message.activeSwipeIndex <
                                                message.swipes.length - 1
                                                    ? "Next swipe"
                                                    : "Generate next swipe"
                                            }
                                        >
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                )}

                                {isPendingSwipe && <span className="swipe-loading-dot" />}

                                <button
                                    className="message-actions-trigger"
                                    type="button"
                                    title="Message actions"
                                    onClick={() => {
                                        setOpenMenuMessageId((current) => {
                                            return current === message.id
                                                ? ""
                                                : message.id;
                                        });
                                    }}
                                >
                                    <MoreHorizontal size={15} />
                                </button>

                                {openMenuMessageId === message.id && (
                                    <div className="message-menu">
                                        <button
                                            type="button"
                                            onClick={() => startEditing(message)}
                                        >
                                            <FilePenLine size={14} />
                                            Edit
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => void copyMessage(message)}
                                        >
                                            <Copy size={14} />
                                            Copy
                                        </button>

                                        {pluginMessageActions.map((action) => (
                                            <button
                                                key={action.id}
                                                type="button"
                                                onClick={() => {
                                                    setOpenMenuMessageId("");
                                                    void action.run({
                                                        content,
                                                        message,
                                                        snapshot: pluginSnapshot,
                                                    });
                                                }}
                                            >
                                                {action.renderIcon?.()}
                                                {action.label}
                                            </button>
                                        ))}

                                        <button
                                            className="danger-menu-item"
                                            type="button"
                                            onClick={() => requestDeleteMessage(message)}
                                        >
                                            <Trash2 size={14} />
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        </MessageHeader>

                        <div className="message-content">
                            {isEditing && (
                                <div className="message-edit-panel">
                                    <textarea
                                        value={editingDraft}
                                        onInput={(event) => {
                                            setEditingDraft(event.currentTarget.value);
                                        }}
                                    />

                                    <div className="message-edit-actions">
                                        <button
                                            type="button"
                                            onClick={() => saveEdit(message.id)}
                                        >
                                            <Check size={15} />
                                            Save
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingMessageId("");
                                                setEditingDraft("");
                                            }}
                                        >
                                            <X size={15} />
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {!isEditing && (
                                <>
                                    <MessageReasoning reasoning={reasoning} />
                                    <MessageAttachments attachments={attachments} />

                                    <MessageContent
                                        renderer={messageRenderers[0]}
                                        characterAvatarPath={characterAvatarPath}
                                        characterName={characterName}
                                        content={content}
                                        message={message}
                                        mode={mode}
                                    />
                                </>
                            )}
                        </div>
                    </article>
                );
            })}

            {isTyping && <TypingIndicator characterName={characterName} mode={mode} />}
            {copyError && <p className="chat-error">{copyError}</p>}
            {errorMessage && <p className="chat-error">{errorMessage}</p>}

            {deleteCandidate && (
                <div
                    className="message-confirm-backdrop"
                    role="presentation"
                    onClick={() => setDeleteCandidate(undefined)}
                >
                    <section
                        className="message-confirm-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Delete message"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header>
                            <AlertTriangle size={19} />
                            <h2>Delete message?</h2>
                        </header>

                        <p>This removes the message from the current chat.</p>
                        <blockquote>{getMessageContent(deleteCandidate)}</blockquote>

                        <div className="message-confirm-actions">
                            <button
                                type="button"
                                onClick={() => setDeleteCandidate(undefined)}
                            >
                                Cancel
                            </button>

                            <button
                                className="danger-button"
                                type="button"
                                onClick={confirmDeleteMessage}
                            >
                                <Trash2 size={15} />
                                Delete
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

function TypingIndicator({
    characterName,
    mode,
}: {
    characterName: string;
    mode: ChatMode;
}) {
    if (mode === "rp") {
        return (
            <div
                className="rp-typing-indicator"
                aria-label={`${characterName} is responding`}
            >
                <span />
                <i />
                <i />
                <i />
            </div>
        );
    }

    return null;
}
