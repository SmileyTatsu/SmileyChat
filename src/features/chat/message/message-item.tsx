import {
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
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import { cn } from "#frontend/lib/common/style";
import {
    getMessageAttachments,
    getMessageContent,
    getMessageReasoning,
    isActiveSwipeError,
} from "#frontend/lib/messages";
import type {
    MessageRenderer,
    PluginAppSnapshot,
    PluginMessageAction,
} from "#frontend/lib/plugins/types";
import {
    getStreamingMessageDraft,
    getStreamingMessageDraftSignal,
    type StreamingMessageDraft,
} from "#frontend/lib/streaming-message-drafts";
import type { ChatMode, Message } from "#frontend/types";

import { MessageAttachments } from "./message-attachment";
import { MessageContent } from "./message-content";
import { MessageHeader } from "./message-header";
import { MessageReasoning } from "./message-reasoning";
import {
    PluginRenderSurface,
    pluginIdFromScopedId,
} from "../../plugins/plugin-error-boundary";

export type MessageItemProps = {
    characterAvatarPath?: string;
    characterName: string;
    isEditing: boolean;
    isLastMessage: boolean;
    isMenuOpen: boolean;
    isPendingSwipe: boolean;
    menuPlacement: "above" | "below";
    message: Message;
    mode: ChatMode;
    openMenuRef: { current: HTMLDivElement | null };
    getPluginSnapshot: () => PluginAppSnapshot;
    pluginMessageActions: PluginMessageAction[];
    renderer?: MessageRenderer;
    showRpCharacterImages: boolean;
    showTimestamps: boolean;
    onCancelEdit: () => void;
    onCloseMenu: () => void;
    onCopyMessage: (message: Message) => void | Promise<void>;
    onDeleteMessage: (message: Message) => void;
    onNextSwipe: (messageId: string) => void;
    onPreviousSwipe: (messageId: string) => void;
    onSaveEdit: (messageId: string, content: string) => void;
    onStartEditing: (messageId: string) => void;
    onToggleMenu: (
        messageId: string,
        trigger: HTMLButtonElement,
        isCurrentlyOpen: boolean,
    ) => void;
    onVisibleContentChange: () => void;
};

export const MessageItem = memo(function MessageItem({
    characterAvatarPath,
    characterName,
    isEditing,
    isLastMessage,
    isMenuOpen,
    isPendingSwipe,
    menuPlacement,
    message,
    mode,
    openMenuRef,
    getPluginSnapshot,
    pluginMessageActions,
    renderer,
    showRpCharacterImages,
    showTimestamps,
    onCancelEdit,
    onCloseMenu,
    onCopyMessage,
    onDeleteMessage,
    onNextSwipe,
    onPreviousSwipe,
    onSaveEdit,
    onStartEditing,
    onToggleMenu,
    onVisibleContentChange,
}: MessageItemProps) {
    const wasEditingRef = useRef(false);
    const [editingDraft, setEditingDraft] = useState("");
    const content = getMessageContent(message);
    const isFailedSwipe = isActiveSwipeError(message);

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
    useEffect(() => {
        if (isEditing && !wasEditingRef.current) {
            setEditingDraft(content);
        }

        wasEditingRef.current = isEditing;
    }, [content, isEditing]);

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
                message={message}
                characterAvatarPath={characterAvatarPath}
                showTimestamps={showTimestamps}
            >
                <div className="message-overlay-actions">
                    {showSwipeControls && (
                        <div className="swipe-controls" aria-label="Message swipes">
                            <button
                                type="button"
                                title="Previous swipe (Left Arrow)"
                                aria-label="Previous swipe"
                                disabled={!canPagePrevious || isPendingSwipe}
                                onClick={() => onPreviousSwipe(message.id)}
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <span>
                                {message.activeSwipeIndex + 1}/{message.swipes.length}
                            </span>

                            <button
                                type="button"
                                aria-label={
                                    message.activeSwipeIndex < message.swipes.length - 1
                                        ? "Next swipe"
                                        : "Generate next swipe"
                                }
                                disabled={!canPageForward || isPendingSwipe}
                                onClick={() => onNextSwipe(message.id)}
                                title={
                                    message.activeSwipeIndex < message.swipes.length - 1
                                        ? "Next swipe (Right Arrow)"
                                        : "Generate next swipe (Right Arrow)"
                                }
                            >
                                <ChevronRight size={16} />
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
                                onToggleMenu(message.id, event.currentTarget, isMenuOpen)
                            }
                        >
                            <MoreHorizontal size={15} />
                        </button>
                        {isMenuOpen && (
                            <div className="message-menu" role="menu">
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        const latestMessage =
                                            getMessageWithLatestStreamingDraft(message);

                                        setEditingDraft(getMessageContent(latestMessage));
                                        onStartEditing(message.id);
                                    }}
                                >
                                    <FilePenLine size={14} />
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() =>
                                        void onCopyMessage(
                                            getMessageWithLatestStreamingDraft(message),
                                        )
                                    }
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
                                            const latestMessage =
                                                getMessageWithLatestStreamingDraft(
                                                    message,
                                                );

                                            onCloseMenu();
                                            void action.run({
                                                content: getMessageContent(latestMessage),
                                                message: latestMessage,
                                                snapshot: getPluginSnapshot(),
                                            });
                                        }}
                                    >
                                        <PluginRenderSurface
                                            pluginId={pluginIdFromScopedId(action.id)}
                                            resetKey={action.id}
                                            fallback={null}
                                            surface={action.label}
                                            render={() =>
                                                action.renderIcon
                                                    ? action.renderIcon()
                                                    : null
                                            }
                                        />
                                        {action.label}
                                    </button>
                                ))}
                                <button
                                    className="danger-menu-item"
                                    type="button"
                                    role="menuitem"
                                    onClick={() =>
                                        onDeleteMessage(
                                            getMessageWithLatestStreamingDraft(message),
                                        )
                                    }
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
                                setEditingDraft(event.currentTarget.value);
                            }}
                        />

                        <div className="message-edit-actions">
                            <button
                                type="button"
                                onClick={() => onSaveEdit(message.id, editingDraft)}
                            >
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
                    <MessageLiveContent
                        characterAvatarPath={characterAvatarPath}
                        characterName={characterName}
                        message={message}
                        mode={mode}
                        renderer={renderer}
                        onVisibleContentChange={onVisibleContentChange}
                    />
                )}
            </div>
        </article>
    );
}, areMessageItemPropsEqual);

function areMessageItemPropsEqual(
    previous: Readonly<MessageItemProps>,
    next: Readonly<MessageItemProps>,
) {
    return (
        previous.characterAvatarPath === next.characterAvatarPath &&
        previous.characterName === next.characterName &&
        previous.isEditing === next.isEditing &&
        previous.isLastMessage === next.isLastMessage &&
        previous.isMenuOpen === next.isMenuOpen &&
        previous.isPendingSwipe === next.isPendingSwipe &&
        previous.menuPlacement === next.menuPlacement &&
        previous.message === next.message &&
        previous.mode === next.mode &&
        previous.getPluginSnapshot === next.getPluginSnapshot &&
        previous.pluginMessageActions === next.pluginMessageActions &&
        previous.renderer === next.renderer &&
        previous.showRpCharacterImages === next.showRpCharacterImages &&
        previous.showTimestamps === next.showTimestamps
    );
}

type MessageLiveContentProps = {
    characterAvatarPath?: string;
    characterName: string;
    message: Message;
    mode: ChatMode;
    renderer?: MessageRenderer;
    onVisibleContentChange: () => void;
};

function MessageLiveContent({
    characterAvatarPath,
    characterName,
    message,
    mode,
    renderer,
    onVisibleContentChange,
}: MessageLiveContentProps) {
    const streamingDraft = getStreamingMessageDraftSignal(message.id).value;
    const renderedMessage = applyStreamingDraftForRender(message, streamingDraft);
    const content = getMessageContent(renderedMessage);
    const reasoning = getMessageReasoning(renderedMessage);
    const attachments = getMessageAttachments(renderedMessage);
    const draftScrollVersion = [
        streamingDraft?.content?.length ?? 0,
        streamingDraft?.reasoning?.length ?? 0,
        streamingDraft?.attachments?.length ?? 0,
    ].join(":");

    useLayoutEffect(() => {
        if (streamingDraft) {
            onVisibleContentChange();
        }
    }, [draftScrollVersion, streamingDraft, onVisibleContentChange]);

    return (
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
    );
}

function getMessageWithLatestStreamingDraft(message: Message) {
    return applyStreamingDraftForRender(message, getStreamingMessageDraft(message.id));
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
