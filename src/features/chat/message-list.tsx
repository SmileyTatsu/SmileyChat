import { AlertTriangle, ArrowDown, Trash2 } from "lucide-preact";
import { memo } from "preact/compat";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";

import { useEventCallback } from "#frontend/app/hooks/use-event-callback";
import { getMessageContent } from "#frontend/lib/messages";
import type { MessageFormattingOptions } from "#frontend/lib/message-formatting/quote-highlighting";
import {
    getMessageRenderers,
    getPluginMessageActions,
    subscribeToPluginRegistry,
} from "#frontend/lib/plugins/registry";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type { TimeFormat } from "#frontend/lib/preferences/types";
import type { ChatMode, Message } from "#frontend/types";

import { MessageItem } from "./message/message-item";

type MessageListProps = {
    autoScroll: boolean;
    characterAvatarPath?: string;
    characterDialogueColors: Readonly<Record<string, string | null>>;
    characterName: string;
    chatId: string;
    defaultCharacterDialogueColor?: string;
    errorMessage?: string;
    isTyping?: boolean;
    messages: Message[];
    mode: ChatMode;
    canForkMessages: boolean;

    showTimestamps: boolean;
    timeFormat: TimeFormat;
    messageFormatting: MessageFormattingOptions;
    pendingSwipeMessageId?: string;
    showRpCharacterImages: boolean;
    showThoughtProcess: boolean;
    showToolActivity: boolean;
    toolIterationLimit: number;

    onDeleteMessage: (messageId: string) => void;
    onDeleteMessageSwipe: (messageId: string) => void;
    onEditMessage: (messageId: string, content: string) => void;
    onForkMessage: (messageId: string) => void;
    onNextSwipe: (messageId: string) => void;
    onContinueGeneration: (messageId: string) => void;
    onPreviousSwipe: (messageId: string) => void;
    onRemoveAttachment: (messageId: string, attachmentId: string) => void;
    onRemoveAllAttachments: (messageId: string) => void;
    getPluginSnapshot: () => PluginAppSnapshot;
};

export const MessageList = memo(function MessageList({
    autoScroll,
    characterAvatarPath,
    characterDialogueColors,
    characterName,
    chatId,
    defaultCharacterDialogueColor,
    errorMessage,
    isTyping,
    messages,
    mode,
    canForkMessages,
    pendingSwipeMessageId,
    showRpCharacterImages,
    showThoughtProcess,
    showToolActivity,
    toolIterationLimit,
    showTimestamps,
    timeFormat,
    messageFormatting,
    onDeleteMessage,
    onDeleteMessageSwipe,
    onEditMessage,
    onForkMessage,
    onNextSwipe,
    onContinueGeneration,
    onPreviousSwipe,
    onRemoveAttachment,
    onRemoveAllAttachments,
    getPluginSnapshot,
}: MessageListProps) {
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const openMenuRef = useRef<HTMLDivElement>(null);
    const pendingAutoScrollFrameRef = useRef<number>();
    const shouldAutoScrollRef = useRef(true);
    const [showJumpToBottom, setShowJumpToBottom] = useState(false);
    const [openMenuMessageId, setOpenMenuMessageId] = useState("");
    const [messageMenuPlacement, setMessageMenuPlacement] = useState<"above" | "below">(
        "below",
    );
    const [editingMessageId, setEditingMessageId] = useState("");

    const [registryRevision, setRegistryRevision] = useState(0);
    const [copyError, setCopyError] = useState("");
    const [deleteCandidate, setDeleteCandidate] = useState<Message | undefined>();
    const [attachmentRemovalCandidate, setAttachmentRemovalCandidate] = useState<
        | {
              kind: "one";
              message: Message;
              attachmentId: string;
          }
        | {
              kind: "all";
              message: Message;
          }
        | undefined
    >();

    useEffect(
        () => subscribeToPluginRegistry(() => setRegistryRevision((r) => r + 1)),
        [],
    );

    const messageRenderers = useMemo(() => getMessageRenderers(), [registryRevision]);
    const pluginMessageActions = useMemo(
        () => getPluginMessageActions(),
        [registryRevision],
    );

    const displayMessages = useMemo(
        () =>
            messages.filter((message) => {
                if (message.metadata?.toolProtocol === "assistant_tool_call") {
                    return false;
                }

                return showToolActivity || !message.metadata?.toolActivity;
            }),
        [messages, showToolActivity],
    );
    const isStreamActive = Boolean(isTyping || pendingSwipeMessageId);
    const keyboardSwipeTarget = useMemo(
        () => findKeyboardSwipeTarget(displayMessages),
        [displayMessages],
    );
    useEffect(() => {
        return () => {
            if (pendingAutoScrollFrameRef.current !== undefined) {
                cancelAnimationFrame(pendingAutoScrollFrameRef.current);
            }
        };
    }, []);

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

    const updateAutoScrollPreference = useCallback((isAtBottom: boolean) => {
        shouldAutoScrollRef.current = isAtBottom;
        setShowJumpToBottom(!isAtBottom);
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
                isInteractiveKeyboardTarget(event.target, null)
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

            const list = trigger.closest(".message-list-shell");
            const listRect = list?.getBoundingClientRect();
            const triggerRect = trigger.getBoundingClientRect();
            const estimatedMenuHeight = 178 + pluginMessageActions.length * 32;

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

    const requestRemoveAttachment = useCallback(
        (messageId: string, attachmentId: string) => {
            const message = messages.find((item) => item.id === messageId);

            if (!message) {
                return;
            }

            setAttachmentRemovalCandidate({
                kind: "one",
                message,
                attachmentId,
            });
            setOpenMenuMessageId("");
        },
        [messages],
    );

    const requestRemoveAllAttachments = useCallback((message: Message) => {
        setAttachmentRemovalCandidate({
            kind: "all",
            message,
        });
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

    function confirmRemoveAttachments() {
        if (!attachmentRemovalCandidate) {
            return;
        }

        if (attachmentRemovalCandidate.kind === "one") {
            onRemoveAttachment(
                attachmentRemovalCandidate.message.id,
                attachmentRemovalCandidate.attachmentId,
            );
        } else {
            onRemoveAllAttachments(attachmentRemovalCandidate.message.id);
        }

        setAttachmentRemovalCandidate(undefined);
    }

    const scrollToBottomIfNeeded = useEventCallback(() => {
        if (!autoScroll || !shouldAutoScrollRef.current) {
            return;
        }

        if (pendingAutoScrollFrameRef.current !== undefined) {
            return;
        }

        pendingAutoScrollFrameRef.current = requestAnimationFrame(() => {
            pendingAutoScrollFrameRef.current = undefined;
            virtuosoRef.current?.autoscrollToBottom();
        });
    });

    return (
        <div className="message-list-shell">
            <Virtuoso
                className="message-list"
                ref={virtuosoRef}
                aria-label="Chat messages"
                aria-live="polite"
                tabIndex={0}
                onKeyDown={handleListKeyDown}
                atBottomStateChange={updateAutoScrollPreference}
                atBottomThreshold={AUTO_SCROLL_BOTTOM_THRESHOLD}
                alignToBottom
                computeItemKey={(_, message) => message.id}
                data={displayMessages}
                followOutput={() =>
                    autoScroll && shouldAutoScrollRef.current
                        ? isStreamActive
                            ? "auto"
                            : "smooth"
                        : false
                }
                initialTopMostItemIndex={{
                    index: Math.max(0, displayMessages.length - 1),
                    align: "end",
                }}
                increaseViewportBy={{ top: 500, bottom: 800 }}
                itemContent={(_, message) => {
                    const isEditing = editingMessageId === message.id;
                    const isMenuOpen = openMenuMessageId === message.id;

                    return (
                        <MessageItem
                            key={message.id}
                            characterAvatarPath={characterAvatarPath}
                            characterDialogueColor={
                                message.authorCharacterId &&
                                message.authorCharacterId in characterDialogueColors
                                    ? (characterDialogueColors[
                                          message.authorCharacterId
                                      ] ?? undefined)
                                    : (message.metadata?.authorDialogueColorSnapshot ??
                                      defaultCharacterDialogueColor)
                            }
                            characterName={characterName}
                            chatId={chatId}
                            isEditing={isEditing}
                            isLastMessage={
                                message === displayMessages[displayMessages.length - 1]
                            }
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
                            canForkMessages={canForkMessages}
                            showRpCharacterImages={showRpCharacterImages}
                            showThoughtProcess={showThoughtProcess}
                            showTimestamps={showTimestamps}
                            showToolActivity={showToolActivity}
                            timeFormat={timeFormat}
                            toolIterationLimit={toolIterationLimit}
                            onCancelEdit={cancelEdit}
                            onCloseMenu={closeMessageMenu}
                            onCopyMessage={copyMessage}
                            onDeleteMessage={requestDeleteMessage}
                            onForkMessage={onForkMessage}
                            onNextSwipe={onNextSwipe}
                            onContinueGeneration={onContinueGeneration}
                            onPreviousSwipe={onPreviousSwipe}
                            onRemoveAttachment={requestRemoveAttachment}
                            onRemoveAllAttachments={requestRemoveAllAttachments}
                            onSaveEdit={saveEdit}
                            onStartEditing={startEditing}
                            onVisibleContentChange={scrollToBottomIfNeeded}
                            onToggleMenu={toggleMessageMenu}
                        />
                    );
                }}
                components={{
                    Header: () => (
                        <div className="message-list-spacer" aria-hidden="true" />
                    ),
                    Footer: () => (
                        <>
                            {isTyping && (
                                <TypingIndicator
                                    characterName={characterName}
                                    mode={mode}
                                />
                            )}
                            {copyError && <p className="chat-error">{copyError}</p>}
                            {errorMessage && <p className="chat-error">{errorMessage}</p>}
                            <div className="message-list-spacer" aria-hidden="true" />
                        </>
                    ),
                }}
            />
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
            {attachmentRemovalCandidate && (
                <div
                    className="message-confirm-backdrop"
                    role="presentation"
                    onClick={() => setAttachmentRemovalCandidate(undefined)}
                >
                    <section
                        className="message-confirm-dialog compact"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Remove attachment"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <header>
                            <AlertTriangle size={19} />
                            <h2>
                                {attachmentRemovalCandidate.kind === "one"
                                    ? "Remove attachment?"
                                    : "Remove all attachments?"}
                            </h2>
                        </header>

                        <p>
                            {attachmentRemovalCandidate.kind === "one"
                                ? "This removes the attachment from the current swipe and deletes the local file when possible."
                                : "This removes every attachment from the current swipe and deletes local files when possible."}
                        </p>

                        <div className="message-confirm-actions">
                            <button
                                type="button"
                                onClick={() => setAttachmentRemovalCandidate(undefined)}
                            >
                                Cancel
                            </button>
                            <button
                                className="danger-button"
                                type="button"
                                onClick={confirmRemoveAttachments}
                            >
                                <Trash2 size={15} />
                                Remove
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );

    function scrollToBottom() {
        shouldAutoScrollRef.current = true;
        setShowJumpToBottom(false);
        virtuosoRef.current?.scrollToIndex({
            index: "LAST",
            behavior: "smooth",
        });
    }
});

const AUTO_SCROLL_BOTTOM_THRESHOLD = 80;

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
