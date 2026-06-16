import { AlertTriangle, ArrowDown, Trash2 } from "lucide-preact";
import { memo } from "preact/compat";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "preact/hooks";

import { useEventCallback } from "#frontend/app/hooks/use-event-callback";
import { getMessageContent } from "#frontend/lib/messages";
import type { MessageFormattingOptions } from "#frontend/lib/message-formatting/quote-highlighting";
import {
    getMessageRenderers,
    getPluginMessageActions,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type { ChatMode, Message } from "#frontend/types";

import { MessageItem } from "./message/message-item";

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
    messageFormatting: MessageFormattingOptions;
    pendingSwipeMessageId?: string;
    resetKey: string;
    showRpCharacterImages: boolean;

    onDeleteMessage: (messageId: string) => void;
    onDeleteMessageSwipe: (messageId: string) => void;
    onEditMessage: (messageId: string, content: string) => void;
    onNextSwipe: (messageId: string) => void;
    onPreviousSwipe: (messageId: string) => void;
    getPluginSnapshot: () => PluginAppSnapshot;
};

export const MessageList = memo(function MessageList({
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
    messageFormatting,
    onDeleteMessage,
    onDeleteMessageSwipe,
    onEditMessage,
    onNextSwipe,
    onPreviousSwipe,
    getPluginSnapshot,
}: MessageListProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const openMenuRef = useRef<HTMLDivElement>(null);
    const topSentinelRef = useRef<HTMLDivElement>(null);
    const previousScrollHeightRef = useRef<number | undefined>(undefined);
    const isLoadingEarlierRef = useRef(false);
    const needsInitialBottomScrollRef = useRef(true);
    const shouldAutoScrollRef = useRef(true);
    const wasStreamingRef = useRef(false);
    const [visibleCount, setVisibleCount] = useState(() =>
        normalizeMessageWindowSize(initialMessageCount),
    );
    const [showJumpToBottom, setShowJumpToBottom] = useState(false);
    const [openMenuMessageId, setOpenMenuMessageId] = useState("");
    const [messageMenuPlacement, setMessageMenuPlacement] = useState<"above" | "below">(
        "below",
    );
    const [editingMessageId, setEditingMessageId] = useState("");

    const [registryRevision, setRegistryRevision] = useState(0);
    const [copyError, setCopyError] = useState("");
    const [deleteCandidate, setDeleteCandidate] = useState<Message | undefined>();

    useEffect(
        () => subscribeToPluginRegistry(() => setRegistryRevision((r) => r + 1)),
        [],
    );

    const messageRenderers = useMemo(() => getMessageRenderers(), [registryRevision]);
    const pluginMessageActions = useMemo(
        () => getPluginMessageActions(),
        [registryRevision],
    );

    const lastMessage = messages[messages.length - 1];
    const isStreamActive = Boolean(isTyping || pendingSwipeMessageId);
    const keyboardSwipeTarget = useMemo(
        () => findKeyboardSwipeTarget(messages),
        [messages],
    );
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
        const streamJustStarted = isStreamActive && !wasStreamingRef.current;
        wasStreamingRef.current = isStreamActive;

        const list = listRef.current;
        if (!list || !autoScroll || !shouldAutoScrollRef.current) {
            return;
        }

        list.scrollTo({
            top: list.scrollHeight,
            behavior: isStreamActive && !streamJustStarted ? "auto" : "smooth",
        });
    }, [autoScroll, errorMessage, isStreamActive, scrollVersion]);

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

    const updateAutoScrollPreference = useCallback(() => {
        const list = listRef.current;
        if (!list) {
            return;
        }

        const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
        shouldAutoScrollRef.current = distanceFromBottom < AUTO_SCROLL_BOTTOM_THRESHOLD;
        setShowJumpToBottom(distanceFromBottom >= AUTO_SCROLL_BOTTOM_THRESHOLD);
    }, []);

    const handleListKeyDown = useCallback(
        (event: KeyboardEvent) => {
            const swipeTarget = keyboardSwipeTarget;

            if (
                !swipeTarget ||
                editingMessageId ||
                openMenuMessageId ||
                event.defaultPrevented ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                isInteractiveKeyboardTarget(event.target, listRef.current)
            ) {
                return;
            }

            if (event.key === "ArrowLeft") {
                if (
                    swipeTarget.activeSwipeIndex <= 0 ||
                    pendingSwipeMessageId === swipeTarget.id
                ) {
                    return;
                }

                event.preventDefault();
                onPreviousSwipe(swipeTarget.id);
                return;
            }

            if (event.key === "ArrowRight") {
                if (pendingSwipeMessageId === swipeTarget.id) {
                    return;
                }

                event.preventDefault();
                onNextSwipe(swipeTarget.id);
            }
        },
        [
            editingMessageId,
            keyboardSwipeTarget,
            onNextSwipe,
            onPreviousSwipe,
            openMenuMessageId,
            pendingSwipeMessageId,
        ],
    );

    const startEditing = useCallback((messageId: string) => {
        setEditingMessageId(messageId);
        setOpenMenuMessageId("");
    }, []);

    const closeMessageMenu = useCallback(() => {
        setOpenMenuMessageId("");
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingMessageId("");
    }, []);

    const toggleMessageMenu = useCallback(
        (messageId: string, trigger: HTMLButtonElement, isCurrentlyOpen: boolean) => {
            if (isCurrentlyOpen) {
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
        },
        [pluginMessageActions.length],
    );

    const saveEdit = useCallback(
        (messageId: string, draft: string) => {
            const content = draft.trim();
            if (!content) return;

            onEditMessage(messageId, content);
            setEditingMessageId("");
        },
        [onEditMessage],
    );

    const copyMessage = useCallback(async (message: Message) => {
        try {
            await navigator.clipboard.writeText(getMessageContent(message));
            setCopyError("");
            setOpenMenuMessageId("");
        } catch {
            setCopyError("Could not copy message.");
        }
    }, []);

    const requestDeleteMessage = useCallback((message: Message) => {
        setDeleteCandidate(message);
        setOpenMenuMessageId("");
    }, []);

    function confirmDeleteMessage() {
        if (!deleteCandidate) {
            return;
        }

        onDeleteMessage(deleteCandidate.id);
        setDeleteCandidate(undefined);
    }

    function confirmDeleteSwipe() {
        if (!deleteCandidate || deleteCandidate.swipes.length <= 1) {
            return;
        }

        onDeleteMessageSwipe(deleteCandidate.id);
        setDeleteCandidate(undefined);
    }

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

    const scrollToBottomIfNeeded = useEventCallback(() => {
        const list = listRef.current;

        if (!list || !autoScroll || !shouldAutoScrollRef.current) {
            return;
        }

        list.scrollTo({ top: list.scrollHeight, behavior: "auto" });
    });

    return (
        <div className="message-list-shell">
            <div
                className="message-list"
                ref={listRef}
                aria-label="Chat messages"
                aria-live="polite"
                tabIndex={0}
                onKeyDown={handleListKeyDown}
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
                {visibleMessages.map((message) => {
                    const isEditing = editingMessageId === message.id;
                    const isMenuOpen = openMenuMessageId === message.id;

                    return (
                        <MessageItem
                            key={message.id}
                            characterAvatarPath={characterAvatarPath}
                            characterName={characterName}
                            isEditing={isEditing}
                            isLastMessage={message === messages[messages.length - 1]}
                            isMenuOpen={isMenuOpen}
                            isPendingSwipe={pendingSwipeMessageId === message.id}
                            menuPlacement={isMenuOpen ? messageMenuPlacement : "below"}
                            message={message}
                            mode={mode}
                            openMenuRef={openMenuRef}
                            getPluginSnapshot={getPluginSnapshot}
                            pluginMessageActions={pluginMessageActions}
                            renderer={messageRenderers[0]}
                            messageFormatting={messageFormatting}
                            showRpCharacterImages={showRpCharacterImages}
                            showTimestamps={showTimestamps}
                            onCancelEdit={cancelEdit}
                            onCloseMenu={closeMessageMenu}
                            onCopyMessage={copyMessage}
                            onDeleteMessage={requestDeleteMessage}
                            onNextSwipe={onNextSwipe}
                            onPreviousSwipe={onPreviousSwipe}
                            onSaveEdit={saveEdit}
                            onStartEditing={startEditing}
                            onVisibleContentChange={scrollToBottomIfNeeded}
                            onToggleMenu={toggleMessageMenu}
                        />
                    );
                })}

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

                        <p>
                            This removes the message from the current chat
                            {deleteCandidate.swipes.length > 1
                                ? ", or only the currently selected swipe."
                                : "."}
                        </p>
                        <blockquote>{getMessageContent(deleteCandidate)}</blockquote>

                        <div className="message-confirm-actions">
                            <button
                                type="button"
                                onClick={() => setDeleteCandidate(undefined)}
                            >
                                Cancel
                            </button>

                            {deleteCandidate.swipes.length > 1 && (
                                <button
                                    className="danger-button subtle-danger-button"
                                    type="button"
                                    onClick={confirmDeleteSwipe}
                                >
                                    <Trash2 size={15} />
                                    Delete swipe
                                </button>
                            )}

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
});

const LOAD_EARLIER_BATCH_SIZE = 50;
const AUTO_SCROLL_BOTTOM_THRESHOLD = 80;

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

function isInteractiveKeyboardTarget(
    target: EventTarget | null,
    keyboardScope: HTMLElement | null,
) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    if (target.isContentEditable) {
        return true;
    }

    const tagName = target.tagName.toLowerCase();

    if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        tagName === "button" ||
        tagName === "a"
    ) {
        return true;
    }

    const roleWidget = target.closest(
        [
            "[contenteditable='true']",
            "[role='button']",
            "[role='checkbox']",
            "[role='combobox']",
            "[role='link']",
            "[role='listbox']",
            "[role='menu']",
            "[role='menuitem']",
            "[role='option']",
            "[role='radio']",
            "[role='slider']",
            "[role='spinbutton']",
            "[role='switch']",
            "[role='tab']",
            "[role='tablist']",
        ].join(","),
    );

    if (roleWidget) {
        return true;
    }

    const tabIndexedWidget = target.closest("[tabindex]");

    return Boolean(tabIndexedWidget && tabIndexedWidget !== keyboardScope);
}

function findKeyboardSwipeTarget(messages: Message[]) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];

        if (
            message?.role === "character" &&
            message.metadata?.canGenerateSwipe !== false
        ) {
            return message;
        }
    }

    return undefined;
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

    return (
        <div className="chat-typing-line" aria-label={`${characterName} is writing`}>
            <div className="typing-dots">
                <i />
                <i />
                <i />
            </div>
            <span>{characterName} is writing</span>
        </div>
    );
}
