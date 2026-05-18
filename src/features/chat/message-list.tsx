import {
    AlertTriangle,
    ArrowDown,
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
import { memo } from "preact/compat";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

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
import type {
    MessageRenderer,
    PluginMessageAction,
    PluginAppSnapshot,
} from "#frontend/lib/plugins/types";
import {
    getStreamingMessageDraftSignal,
    type StreamingMessageDraft,
} from "#frontend/lib/streaming-message-drafts";
import type { ChatMode, Message } from "#frontend/types";

import { MessageAttachments } from "./message/message-attachment";
import { MessageContent } from "./message/message-content";
import { MessageHeader } from "./message/message-header";
import { MessageReasoning } from "./message/message-reasoning";

type MessageListProps = {
    autoScroll: boolean;
    characterAvatarPath?: string;
    characterName: string;
    errorMessage?: string;
    initialMessageCount: number;
    isTyping?: boolean;
    messages: Message[];
    mode: ChatMode;

    showTimestamps: boolean;
    pendingSwipeMessageId?: string;
    resetKey: string;
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
    initialMessageCount,
    isTyping,
    messages,
    mode,
    pendingSwipeMessageId,
    resetKey,
    showRpCharacterImages,
    showTimestamps,
    onDeleteMessage,
    onEditMessage,
    onNextSwipe,
    onPreviousSwipe,
    pluginSnapshot,
}: MessageListProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const openMenuRef = useRef<HTMLDivElement>(null);
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const previousScrollHeightRef = useRef<number | undefined>(undefined);
    const isLoadingEarlierRef = useRef(false);
    const needsInitialBottomScrollRef = useRef(true);
    const shouldAutoScrollRef = useRef(true);
    const [visibleCount, setVisibleCount] = useState(() =>
        normalizeMessageWindowSize(initialMessageCount),
    );
    const [showJumpToBottom, setShowJumpToBottom] = useState(false);
    const [openMenuMessageId, setOpenMenuMessageId] = useState("");
    const [messageMenuPlacement, setMessageMenuPlacement] = useState<"above" | "below">(
        "below",
    );
    const [editingMessageId, setEditingMessageId] = useState("");
    const [editingDraft, setEditingDraft] = useState("");

    const [registryRevision, setRegistryRevision] = useState(0);
    const [copyError, setCopyError] = useState("");
    const [deleteCandidate, setDeleteCandidate] = useState<Message | undefined>();

    useEffect(
        () => subscribeToPluginRegistry(() => setRegistryRevision((r) => r + 1)),
        [],
    );

    const lastMessage = messages[messages.length - 1];
    const lastActiveSwipe = lastMessage
        ? (lastMessage.swipes[lastMessage.activeSwipeIndex] ?? lastMessage.swipes[0])
        : undefined;
    const scrollVersion = [
        messages.length,
        lastMessage?.id ?? "",
        lastMessage?.activeSwipeIndex ?? "",
        lastActiveSwipe?.id ?? "",
        lastActiveSwipe?.content.length ?? 0,
        lastActiveSwipe?.reasoning?.length ?? 0,
    ].join(":");

    useEffect(() => {
        const list = listRef.current;
        if (!list || !autoScroll || !shouldAutoScrollRef.current) {
            return;
        }

        list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }, [autoScroll, errorMessage, isTyping, pendingSwipeMessageId, scrollVersion]);

    useEffect(() => {
        if (!openMenuMessageId) {
            return;
        }

        function handlePointerDown(event: PointerEvent) {
            const openMenu = openMenuRef.current;

            if (!openMenu || openMenu.contains(event.target as Node)) {
                return;
            }

            setOpenMenuMessageId("");
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setOpenMenuMessageId("");
            }
        }

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [openMenuMessageId]);

    function updateAutoScrollPreference() {
        const list = listRef.current;
        if (!list) {
            return;
        }

        const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
        shouldAutoScrollRef.current = distanceFromBottom < 80;
        setShowJumpToBottom(distanceFromBottom > 320);
    }

    function startEditing(message: Message) {
        setEditingMessageId(message.id);
        setEditingDraft(getMessageContent(message));
        setOpenMenuMessageId("");
    }

    function toggleMessageMenu(messageId: string, trigger: HTMLButtonElement) {
        if (openMenuMessageId === messageId) {
            setOpenMenuMessageId("");
            return;
        }

        const list = listRef.current;
        const listRect = list?.getBoundingClientRect();
        const triggerRect = trigger.getBoundingClientRect();
        const estimatedMenuHeight = 146 + pluginMessageActions.length * 32;

        if (listRect) {
            const spaceBelow = listRect.bottom - triggerRect.bottom;
            const spaceAbove = triggerRect.top - listRect.top;
            setMessageMenuPlacement(
                spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow
                    ? "above"
                    : "below",
            );
        } else {
            setMessageMenuPlacement("below");
        }

        setOpenMenuMessageId(messageId);
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

    const messageRenderers = useMemo(() => getMessageRenderers(), [registryRevision]);
    const pluginMessageActions = useMemo(
        () => getPluginMessageActions(),
        [registryRevision],
    );
    const visibleMessages = messages.slice(-visibleCount);
    const hasEarlierMessages = visibleCount < messages.length;

    useEffect(() => {
        needsInitialBottomScrollRef.current = true;
        shouldAutoScrollRef.current = true;
        setShowJumpToBottom(false);
        setVisibleCount(normalizeMessageWindowSize(initialMessageCount));
    }, [initialMessageCount, resetKey]);

    useEffect(() => {
        const list = listRef.current;
        const topSentinel = topSentinelRef.current;

        if (!list || !topSentinel || !hasEarlierMessages) {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting && !needsInitialBottomScrollRef.current) {
                    loadEarlierMessages();
                }
            },
            {
                root: list,
                rootMargin: "140px 0px 0px 0px",
                threshold: 0,
            },
        );

        observer.observe(topSentinel);

        return () => observer.disconnect();
    }, [hasEarlierMessages, messages.length, visibleCount]);

    useLayoutEffect(() => {
        const list = listRef.current;
        const previousScrollHeight = previousScrollHeightRef.current;

        if (!list) {
            return;
        }

        if (previousScrollHeight !== undefined && isLoadingEarlierRef.current) {
            list.scrollTop += list.scrollHeight - previousScrollHeight;
            previousScrollHeightRef.current = undefined;
            isLoadingEarlierRef.current = false;
            return;
        }

        if (needsInitialBottomScrollRef.current) {
            snapToBottom(list);
            needsInitialBottomScrollRef.current = false;
            shouldAutoScrollRef.current = true;
            setShowJumpToBottom(false);
        }
    }, [visibleCount, messages.length]);

    useLayoutEffect(() => {
        const list = listRef.current;

        if (!list || !autoScroll || !shouldAutoScrollRef.current) {
            return;
        }

        snapToBottom(list);
    }, [autoScroll, mode, showRpCharacterImages]);

    return (
        <div className="message-list-shell">
            <div
                className="message-list"
                ref={listRef}
                aria-live="polite"
                onScroll={updateAutoScrollPreference}
            >
                <div
                    className="message-list-sentinel"
                    ref={topSentinelRef}
                    aria-hidden="true"
                />
                {hasEarlierMessages && (
                    <button
                        className="load-earlier-messages"
                        type="button"
                        onClick={loadEarlierMessages}
                    >
                        Load earlier messages
                    </button>
                )}
                {visibleMessages.map((message) => (
                    <MessageRow
                        key={message.id}
                        characterAvatarPath={characterAvatarPath}
                        characterName={characterName}
                        editingDraft={editingMessageId === message.id ? editingDraft : ""}
                        isEditing={editingMessageId === message.id}
                        isLastMessage={message === messages[messages.length - 1]}
                        isPendingSwipe={pendingSwipeMessageId === message.id}
                        menuPlacement={messageMenuPlacement}
                        message={message}
                        mode={mode}
                        openMenuRef={openMenuRef}
                        openMenuMessageId={openMenuMessageId}
                        pluginMessageActions={pluginMessageActions}
                        pluginSnapshot={pluginSnapshot}
                        renderer={messageRenderers[0]}
                        showRpCharacterImages={showRpCharacterImages}
                        showTimestamps={showTimestamps}
                        onCancelEdit={() => {
                            setEditingMessageId("");
                            setEditingDraft("");
                        }}
                        onCopyMessage={copyMessage}
                        onDeleteMessage={requestDeleteMessage}
                        onEditDraftChange={setEditingDraft}
                        onNextSwipe={onNextSwipe}
                        onOpenMenuChange={setOpenMenuMessageId}
                        onPreviousSwipe={onPreviousSwipe}
                        onSaveEdit={saveEdit}
                        onStartEditing={startEditing}
                        onVisibleContentChange={scrollToBottomIfNeeded}
                        onToggleMenu={toggleMessageMenu}
                    />
                ))}

                {isTyping && (
                    <TypingIndicator characterName={characterName} mode={mode} />
                )}
                {copyError && <p className="chat-error">{copyError}</p>}
                {errorMessage && <p className="chat-error">{errorMessage}</p>}
            </div>
            {showJumpToBottom && (
                <button
                    className="jump-to-bottom-button"
                    type="button"
                    title="Go to latest message"
                    aria-label="Go to latest message"
                    onClick={scrollToBottom}
                >
                    <ArrowDown size={18} />
                </button>
            )}
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

    function loadEarlierMessages() {
        if (!hasEarlierMessages) {
            return;
        }

        const list = listRef.current;

        if (list) {
            previousScrollHeightRef.current = list.scrollHeight;
            isLoadingEarlierRef.current = true;
        }

        setVisibleCount((current) =>
            Math.min(messages.length, current + LOAD_EARLIER_BATCH_SIZE),
        );
    }

    function scrollToBottom() {
        const list = listRef.current;

        if (!list) {
            return;
        }

        shouldAutoScrollRef.current = true;
        setShowJumpToBottom(false);
        list.scrollTo({
            top: list.scrollHeight,
            behavior: "smooth",
        });
    }

    function scrollToBottomIfNeeded() {
        const list = listRef.current;

        if (!list || !autoScroll || !shouldAutoScrollRef.current) {
            return;
        }

        list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }
}

const LOAD_EARLIER_BATCH_SIZE = 50;

function snapToBottom(list: HTMLDivElement) {
    list.scrollTop = list.scrollHeight;

    requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
    });
}

function normalizeMessageWindowSize(value: number) {
    if (!Number.isFinite(value)) {
        return LOAD_EARLIER_BATCH_SIZE;
    }

    return Math.max(1, Math.round(value));
}

type MessageRowProps = {
    characterAvatarPath?: string;
    characterName: string;
    editingDraft: string;
    isEditing: boolean;
    isLastMessage: boolean;
    isPendingSwipe: boolean;
    menuPlacement: "above" | "below";
    message: Message;
    mode: ChatMode;
    openMenuMessageId: string;
    openMenuRef: { current: HTMLDivElement | null };
    pluginMessageActions: PluginMessageAction[];
    pluginSnapshot: PluginAppSnapshot;
    renderer?: MessageRenderer;
    showRpCharacterImages: boolean;
    showTimestamps: boolean;
    onCancelEdit: () => void;
    onCopyMessage: (message: Message) => void | Promise<void>;
    onDeleteMessage: (message: Message) => void;
    onEditDraftChange: (draft: string) => void;
    onNextSwipe: (messageId: string) => void;
    onOpenMenuChange: (messageId: string) => void;
    onPreviousSwipe: (messageId: string) => void;
    onSaveEdit: (messageId: string) => void;
    onStartEditing: (message: Message) => void;
    onToggleMenu: (messageId: string, trigger: HTMLButtonElement) => void;
    onVisibleContentChange: () => void;
};

const MessageRow = memo(function MessageRow({
    characterAvatarPath,
    characterName,
    editingDraft,
    isEditing,
    isLastMessage,
    isPendingSwipe,
    menuPlacement,
    message,
    mode,
    openMenuMessageId,
    openMenuRef,
    pluginMessageActions,
    pluginSnapshot,
    renderer,
    showRpCharacterImages,
    showTimestamps,
    onCancelEdit,
    onCopyMessage,
    onDeleteMessage,
    onEditDraftChange,
    onNextSwipe,
    onOpenMenuChange,
    onPreviousSwipe,
    onSaveEdit,
    onStartEditing,
    onToggleMenu,
    onVisibleContentChange,
}: MessageRowProps) {
    const streamingDraft = getStreamingMessageDraftSignal(message.id).value;
    const renderedMessage = applyStreamingDraftForRender(message, streamingDraft);
    const content = getMessageContent(renderedMessage);
    const reasoning = getMessageReasoning(renderedMessage);
    const attachments = getMessageAttachments(renderedMessage);
    const isMenuOpen = openMenuMessageId === message.id;
    const isFailedSwipe =
        streamingDraft?.status === "error" || isActiveSwipeError(renderedMessage);

    const canPagePrevious = message.activeSwipeIndex > 0;
    const canPageForward =
        message.role === "character" && message.metadata?.canGenerateSwipe !== false;

    const showSwipeControls =
        message.role === "character" &&
        message.metadata?.canGenerateSwipe !== false &&
        isLastMessage;
    const showRpMessageAvatar = mode === "rp" && showRpCharacterImages;

    const avatar =
        message.role === "character"
            ? {
                  path: message.authorAvatarPath ?? characterAvatarPath,
                  alt:
                      message.metadata?.displayRole === "system"
                          ? "System Avatar"
                          : "Character Avatar",
              }
            : {
                  path: message.authorAvatarPath,
                  alt: "User Persona Avatar",
              };
    const draftScrollVersion = [
        streamingDraft?.content?.length ?? 0,
        streamingDraft?.reasoning?.length ?? 0,
        streamingDraft?.attachments?.length ?? 0,
    ].join(":");

    useLayoutEffect(() => {
        if (streamingDraft) {
            onVisibleContentChange();
        }
    }, [draftScrollVersion, streamingDraft]);

    return (
        <article
            className={cn("message", {
                "failed-swipe": isFailedSwipe,
                "generating-swipe": isPendingSwipe,
                "show-rp-message-avatar": showRpMessageAvatar,
                "system-message": message.metadata?.displayRole === "system",
            })}
        >
            <div className="message-avatar">
                {avatar.path && <img src={avatar.path} alt={avatar.alt} />}
                {!avatar.path && <User size={18} />}
            </div>

            <MessageHeader
                message={renderedMessage}
                characterAvatarPath={characterAvatarPath}
                showTimestamps={showTimestamps}
            >
                <div className="message-overlay-actions">
                    {showSwipeControls && (
                        <div className="swipe-controls" aria-label="Message swipes">
                            <button
                                type="button"
                                title="Previous swipe"
                                disabled={!canPagePrevious || isPendingSwipe}
                                onClick={() => onPreviousSwipe(message.id)}
                            >
                                <ChevronLeft size={14} />
                            </button>

                            <span>
                                {message.activeSwipeIndex + 1}/{message.swipes.length}
                            </span>

                            <button
                                type="button"
                                disabled={!canPageForward || isPendingSwipe}
                                onClick={() => onNextSwipe(message.id)}
                                title={
                                    message.activeSwipeIndex < message.swipes.length - 1
                                        ? "Next swipe"
                                        : "Generate next swipe"
                                }
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    )}

                    {isPendingSwipe && <span className="swipe-loading-dot" />}
                    <div
                        className="message-menu-wrap"
                        data-menu-placement={isMenuOpen ? menuPlacement : undefined}
                        ref={isMenuOpen ? openMenuRef : undefined}
                    >
                        <button
                            className="message-actions-trigger"
                            type="button"
                            title="Message actions"
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            onClick={(event) =>
                                onToggleMenu(message.id, event.currentTarget)
                            }
                        >
                            <MoreHorizontal size={15} />
                        </button>
                        {isMenuOpen && (
                            <div className="message-menu" role="menu">
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => onStartEditing(renderedMessage)}
                                >
                                    <FilePenLine size={14} />
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => void onCopyMessage(renderedMessage)}
                                >
                                    <Copy size={14} />
                                    Copy
                                </button>
                                {pluginMessageActions.map((action) => (
                                    <button
                                        key={action.id}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            onOpenMenuChange("");
                                            void action.run({
                                                content,
                                                message: renderedMessage,
                                                snapshot: pluginSnapshot,
                                            });
                                        }}
                                    >
                                        {action.renderIcon ? action.renderIcon() : null}
                                        {action.label}
                                    </button>
                                ))}
                                <button
                                    className="danger-menu-item"
                                    type="button"
                                    role="menuitem"
                                    onClick={() => onDeleteMessage(renderedMessage)}
                                >
                                    <Trash2 size={14} />
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </MessageHeader>

            <div className="message-content">
                {isEditing && (
                    <div className="message-edit-panel">
                        <textarea
                            value={editingDraft}
                            onInput={(event) => {
                                onEditDraftChange(event.currentTarget.value);
                            }}
                        />

                        <div className="message-edit-actions">
                            <button type="button" onClick={() => onSaveEdit(message.id)}>
                                <Check size={15} />
                                Save
                            </button>

                            <button type="button" onClick={onCancelEdit}>
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
                            renderer={renderer}
                            characterAvatarPath={characterAvatarPath}
                            characterName={characterName}
                            content={content}
                            message={renderedMessage}
                            mode={mode}
                        />
                    </>
                )}
            </div>
        </article>
    );
}, areMessageRowPropsEqual);

function areMessageRowPropsEqual(
    previous: Readonly<MessageRowProps>,
    next: Readonly<MessageRowProps>,
) {
    return (
        previous.characterAvatarPath === next.characterAvatarPath &&
        previous.characterName === next.characterName &&
        previous.editingDraft === next.editingDraft &&
        previous.isEditing === next.isEditing &&
        previous.isLastMessage === next.isLastMessage &&
        previous.isPendingSwipe === next.isPendingSwipe &&
        previous.menuPlacement === next.menuPlacement &&
        previous.message === next.message &&
        previous.mode === next.mode &&
        previous.openMenuMessageId === next.openMenuMessageId &&
        previous.pluginMessageActions === next.pluginMessageActions &&
        previous.pluginSnapshot === next.pluginSnapshot &&
        previous.renderer === next.renderer &&
        previous.showRpCharacterImages === next.showRpCharacterImages &&
        previous.showTimestamps === next.showTimestamps
    );
}

function applyStreamingDraftForRender(
    message: Message,
    draft: StreamingMessageDraft | undefined,
) {
    if (!draft) {
        return message;
    }

    const activeSwipe = message.swipes[message.activeSwipeIndex] ?? message.swipes[0];

    if (!activeSwipe) {
        return message;
    }

    return {
        ...message,
        swipes: message.swipes.map((swipe, index) =>
            index === message.activeSwipeIndex
                ? {
                      ...swipe,
                      ...(draft.attachments !== undefined
                          ? { attachments: draft.attachments }
                          : {}),
                      ...(draft.content !== undefined ? { content: draft.content } : {}),
                      ...(draft.reasoning !== undefined
                          ? { reasoning: draft.reasoning }
                          : {}),
                      ...(draft.reasoningDetails !== undefined
                          ? { reasoningDetails: draft.reasoningDetails }
                          : {}),
                      ...(draft.status ? { status: draft.status } : {}),
                  }
                : swipe,
        ),
    };
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
