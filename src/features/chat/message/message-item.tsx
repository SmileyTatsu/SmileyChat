import {
    Check,
    ChevronLeft,
    ChevronRight,
    Copy,
    FilePenLine,
    GitFork,
    MoreHorizontal,
    Play,
    Trash2,
    User,
    Wrench,
    X,
} from "lucide-preact";
import { memo } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import { cn } from "#frontend/lib/common/style";
import { getPluginTool } from "#frontend/lib/plugins/registry";
import {
    getMessageAttachments,
    getMessageContent,
    getMessageTimeline,
    getVisibleMessageTimeline,
    isActiveSwipeError,
    getActiveSwipe,
} from "#frontend/lib/messages";
import type { MessageFormattingOptions } from "#frontend/lib/message-formatting/quote-highlighting";
import type {
    MessageRenderer,
    PluginAppSnapshot,
    PluginMessageAction,
} from "#frontend/lib/plugins/types";
import {
    applyStreamingMessageDraft,
    getStreamingMessageDraft,
    getStreamingMessageDraftSignal,
} from "#frontend/lib/streaming-message-drafts";
import type { ChatMode, Message, MessageToolActivity } from "#frontend/types";
import type { TimeFormat } from "#frontend/lib/preferences/types";

import { MessageAttachments, StreamingGeneratedImages } from "./message-attachment";
import { MessageContent } from "./message-content";
import { MessageHeader } from "./message-header";
import {
    PluginRenderSurface,
    pluginIdFromScopedId,
} from "../../plugins/plugin-error-boundary";

export type MessageItemProps = {
    characterAvatarPath?: string;
    characterDialogueColor?: string;
    characterName: string;
    chatId: string;
    isEditing: boolean;
    isLastMessage: boolean;
    isMenuOpen: boolean;
    isPendingSwipe: boolean;
    menuPlacement: "above" | "below";
    message: Message;
    mode: ChatMode;
    canForkMessages: boolean;
    openMenuRef: { current: HTMLDivElement | null };
    getPluginSnapshot: () => PluginAppSnapshot;
    messageFormatting: MessageFormattingOptions;
    pluginMessageActions: PluginMessageAction[];
    renderer?: MessageRenderer;
    showRpCharacterImages: boolean;
    showTimestamps: boolean;
    showThoughtProcess: boolean;
    showToolActivity: boolean;
    timeFormat: TimeFormat;
    toolIterationLimit: number;
    onCancelEdit: () => void;
    onCloseMenu: () => void;
    onCopyMessage: (message: Message) => void | Promise<void>;
    onDeleteMessage: (message: Message) => void;
    onForkMessage: (messageId: string) => void;
    onNextSwipe: (messageId: string) => void;
    onContinueGeneration: (messageId: string) => void;
    onPreviousSwipe: (messageId: string) => void;
    onRemoveAttachment: (messageId: string, attachmentId: string) => void;
    onRemoveAllAttachments: (message: Message) => void;
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
    characterDialogueColor,
    characterName,
    chatId,
    isEditing,
    isLastMessage,
    isMenuOpen,
    isPendingSwipe,
    menuPlacement,
    message,
    mode,
    canForkMessages,
    openMenuRef,
    getPluginSnapshot,
    messageFormatting,
    pluginMessageActions,
    renderer,
    showRpCharacterImages,
    showTimestamps,
    showThoughtProcess,
    showToolActivity,
    timeFormat,
    toolIterationLimit,
    onCancelEdit,
    onCloseMenu,
    onCopyMessage,
    onDeleteMessage,
    onForkMessage,
    onNextSwipe,
    onContinueGeneration,
    onPreviousSwipe,
    onRemoveAttachment,
    onRemoveAllAttachments,
    onSaveEdit,
    onStartEditing,
    onToggleMenu,
    onVisibleContentChange,
}: MessageItemProps) {
    const wasEditingRef = useRef(false);
    const [editingDraft, setEditingDraft] = useState("");
    const content = getMessageContent(message);
    const attachments = getMessageAttachments(message);
    const isFailedSwipe = isActiveSwipeError(message);
    const activeSwipe = getActiveSwipe(message);
    const toolActivities = activeSwipe?.toolActivities;

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
                timeFormat={timeFormat}
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
                                <button
                                    type="button"
                                    role="menuitem"
                                    disabled={!canForkMessages}
                                    title={
                                        canForkMessages
                                            ? "Fork chat from this message"
                                            : "Fork is unavailable while generation is active"
                                    }
                                    onClick={() => {
                                        if (!canForkMessages) {
                                            return;
                                        }

                                        onCloseMenu();
                                        onForkMessage(message.id);
                                    }}
                                >
                                    <GitFork size={14} />
                                    Fork
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
                                {attachments.length > 0 && (
                                    <button
                                        className="danger-menu-item"
                                        type="button"
                                        role="menuitem"
                                        onClick={() =>
                                            onRemoveAllAttachments(
                                                getMessageWithLatestStreamingDraft(
                                                    message,
                                                ),
                                            )
                                        }
                                    >
                                        <Trash2 size={14} />
                                        {attachments.length === 1
                                            ? "Remove file"
                                            : "Remove all attachments"}
                                    </button>
                                )}
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
                        characterDialogueColor={
                            message.role === "character"
                                ? characterDialogueColor
                                : undefined
                        }
                        characterName={characterName}
                        chatId={chatId}
                        message={message}
                        mode={mode}
                        messageFormatting={messageFormatting}
                        renderer={renderer}
                        showThoughtProcess={showThoughtProcess}
                        showToolActivity={showToolActivity}
                        onRemoveAttachment={onRemoveAttachment}
                        onVisibleContentChange={onVisibleContentChange}
                    />
                )}
                {!isEditing && isLastMessage && activeSwipe?.pendingToolContinuation && (
                    <div className="tool-continuation">
                        <p>
                            Tool-call limit of {toolIterationLimit} reached. Continue when
                            you want the task to proceed.
                        </p>
                        <button
                            type="button"
                            disabled={isPendingSwipe}
                            onClick={() => onContinueGeneration(message.id)}
                        >
                            <Play size={15} aria-hidden="true" />
                            Continue Generation
                        </button>
                    </div>
                )}
            </div>
        </article>
    );
}, areMessageItemPropsEqual);

function ToolActivityMessage({ activity }: { activity: MessageToolActivity }) {
    if (!activity) {
        return null;
    }

    const isRunning = activity.status === "running";
    const isError = activity.result.isError;
    const toolName =
        activity.call.displayName ||
        getPluginTool(activity.call.name)?.displayName ||
        activity.call.name;
    const title = isRunning
        ? `Running tool: ${toolName}`
        : isError
          ? `Tool failed: ${toolName}`
          : `Tool used: ${toolName}`;

    return (
        <details
            className={cn("message-reasoning tool-activity", {
                error: isError,
                running: isRunning,
            })}
            open={isRunning}
        >
            <summary>
                <Wrench size={13} aria-hidden="true" />
                {title}
            </summary>
            {activity.call.argumentsText && (
                <p>
                    <strong>Arguments:</strong>
                    <br />
                    {activity.call.argumentsText}
                </p>
            )}
            {activity.result.content && (
                <p>
                    <strong>{isRunning ? "Status:" : "Result:"}</strong>
                    <br />
                    {isRunning && (
                        <span className="tool-activity-spinner" aria-hidden="true" />
                    )}
                    {activity.result.content}
                </p>
            )}
        </details>
    );
}

function areMessageItemPropsEqual(
    previous: Readonly<MessageItemProps>,
    next: Readonly<MessageItemProps>,
) {
    return (
        previous.characterAvatarPath === next.characterAvatarPath &&
        previous.characterDialogueColor === next.characterDialogueColor &&
        previous.characterName === next.characterName &&
        previous.chatId === next.chatId &&
        previous.isEditing === next.isEditing &&
        previous.isLastMessage === next.isLastMessage &&
        previous.isMenuOpen === next.isMenuOpen &&
        previous.isPendingSwipe === next.isPendingSwipe &&
        previous.menuPlacement === next.menuPlacement &&
        previous.message === next.message &&
        previous.mode === next.mode &&
        previous.canForkMessages === next.canForkMessages &&
        previous.openMenuRef === next.openMenuRef &&
        previous.getPluginSnapshot === next.getPluginSnapshot &&
        previous.messageFormatting === next.messageFormatting &&
        previous.pluginMessageActions === next.pluginMessageActions &&
        previous.renderer === next.renderer &&
        previous.showRpCharacterImages === next.showRpCharacterImages &&
        previous.showTimestamps === next.showTimestamps &&
        previous.showThoughtProcess === next.showThoughtProcess &&
        previous.showToolActivity === next.showToolActivity &&
        previous.timeFormat === next.timeFormat &&
        previous.toolIterationLimit === next.toolIterationLimit &&
        previous.onCancelEdit === next.onCancelEdit &&
        previous.onCloseMenu === next.onCloseMenu &&
        previous.onCopyMessage === next.onCopyMessage &&
        previous.onDeleteMessage === next.onDeleteMessage &&
        previous.onForkMessage === next.onForkMessage &&
        previous.onNextSwipe === next.onNextSwipe &&
        previous.onContinueGeneration === next.onContinueGeneration &&
        previous.onPreviousSwipe === next.onPreviousSwipe &&
        previous.onRemoveAttachment === next.onRemoveAttachment &&
        previous.onRemoveAllAttachments === next.onRemoveAllAttachments &&
        previous.onSaveEdit === next.onSaveEdit &&
        previous.onStartEditing === next.onStartEditing &&
        previous.onToggleMenu === next.onToggleMenu &&
        previous.onVisibleContentChange === next.onVisibleContentChange
    );
}

type MessageLiveContentProps = {
    characterAvatarPath?: string;
    characterDialogueColor?: string;
    characterName: string;
    chatId: string;
    message: Message;
    mode: ChatMode;
    messageFormatting: MessageFormattingOptions;
    renderer?: MessageRenderer;
    showThoughtProcess: boolean;
    showToolActivity: boolean;
    onRemoveAttachment: (messageId: string, attachmentId: string) => void;
    onVisibleContentChange: () => void;
};

function MessageLiveContent({
    characterAvatarPath,
    characterDialogueColor,
    characterName,
    chatId,
    message,
    mode,
    messageFormatting,
    renderer,
    showThoughtProcess,
    showToolActivity,
    onRemoveAttachment,
    onVisibleContentChange,
}: MessageLiveContentProps) {
    const streamingDraft = getStreamingMessageDraftSignal(message.id).value;
    const renderedMessage = applyStreamingMessageDraft(message, streamingDraft);
    const content = getMessageContent(renderedMessage);
    const attachments = getMessageAttachments(renderedMessage);
    const timeline = getMessageTimeline(renderedMessage);
    const draftScrollVersion = [
        streamingDraft?.content?.length ?? 0,
        streamingDraft?.reasoning?.length ?? 0,
        streamingDraft?.generatedImageCount ?? 0,
        streamingDraft?.toolActivities
            ?.map((activity) => activity.status ?? activity.result.content)
            .join(":") ?? "",
        streamingDraft?.timeline
            ?.map((entry) =>
                entry.type === "thought"
                    ? entry.content.length
                    : `${entry.activity.call.id}:${entry.activity.status ?? entry.activity.result.content}`,
            )
            .join(":") ?? "",
    ].join(":");

    useLayoutEffect(() => {
        if (streamingDraft) {
            onVisibleContentChange();
        }
    }, [draftScrollVersion, streamingDraft, onVisibleContentChange]);

    return (
        <>
            <ThoughtProcess
                show={showThoughtProcess}
                showToolActivity={showToolActivity}
                timeline={timeline}
            />
            <MessageAttachments
                attachments={attachments}
                chatId={chatId}
                onRemoveAttachment={(attachmentId) =>
                    onRemoveAttachment(message.id, attachmentId)
                }
            />
            <StreamingGeneratedImages count={streamingDraft?.generatedImageCount ?? 0} />

            <MessageContent
                renderer={renderer}
                characterAvatarPath={characterAvatarPath}
                characterDialogueColor={characterDialogueColor}
                characterName={characterName}
                content={content}
                message={renderedMessage}
                messageFormatting={messageFormatting}
                mode={mode}
            />
        </>
    );
}

function ThoughtProcess({
    show,
    showToolActivity,
    timeline,
}: {
    show: boolean;
    showToolActivity: boolean;
    timeline: ReturnType<typeof getMessageTimeline>;
}) {
    const entries = getVisibleMessageTimeline(timeline, show, showToolActivity);
    const hasRunningTool = entries.some(
        (entry) => entry.type === "tool" && entry.activity.status === "running",
    );
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (hasRunningTool) setIsOpen(true);
    }, [hasRunningTool]);

    if (!show || !entries.length) return null;

    return (
        <details
            className="message-reasoning thought-process"
            open={hasRunningTool || isOpen}
            onToggle={(event) => {
                if (!hasRunningTool) setIsOpen(event.currentTarget.open);
            }}
        >
            <summary>Thought Process</summary>
            <div className="thought-process-timeline">
                {entries.map((entry) =>
                    entry.type === "thought" ? (
                        <p className="thought-process-thought" key={entry.id}>
                            {entry.content}
                        </p>
                    ) : (
                        <ToolActivityMessage key={entry.id} activity={entry.activity} />
                    ),
                )}
            </div>
        </details>
    );
}

function getMessageWithLatestStreamingDraft(message: Message) {
    return applyStreamingMessageDraft(message, getStreamingMessageDraft(message.id));
}
