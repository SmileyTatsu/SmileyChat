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
import {
    getTextFormattingHotkeyResult,
    restoreTextareaSelection,
} from "#frontend/lib/message-formatting/input-formatting";
import { formatDuration } from "#frontend/lib/time";
import { getPluginTool } from "#frontend/lib/plugins/registry";
import {
    getMessageAttachments,
    getMessageContent,
    getMessageTimeline,
    getVisibleMessageTimeline,
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
    findStreamingMessageDraftSignal,
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

const LIVE_DURATION_UPDATE_INTERVAL_MS = 100;

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
    onCreateUserSwipe: (messageId: string) => void;
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
    onCreateUserSwipe,
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
    const shouldFocusEditRef = useRef(false);
    const hasPreparedEditDraftRef = useRef(false);
    const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [editingDraft, setEditingDraft] = useState("");
    const content = getMessageContent(message);
    const attachments = getMessageAttachments(message);
    const activeSwipe = getActiveSwipe(message);
    const toolActivities = activeSwipe?.toolActivities;

    const canPagePrevious = message.activeSwipeIndex > 0;
    const canUseUserSwipes =
        message.role === "user" && message.metadata?.canGenerateSwipe !== false;
    const canPageForward =
        canUseUserSwipes ||
        (message.role === "character" && message.metadata?.canGenerateSwipe !== false);

    const showSwipeControls =
        canUseUserSwipes ||
        (message.role === "character" &&
            message.metadata?.canGenerateSwipe !== false &&
            isLastMessage);
    const isLastSwipe = message.activeSwipeIndex === message.swipes.length - 1;
    const nextSwipeLabel =
        canUseUserSwipes && isLastSwipe
            ? "New swipe"
            : message.role === "character" && isLastSwipe
              ? "Generate next swipe"
              : "Next swipe";
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
    useLayoutEffect(() => {
        if (!isEditing) {
            wasEditingRef.current = false;
            shouldFocusEditRef.current = false;
            hasPreparedEditDraftRef.current = false;
            return;
        }

        if (!wasEditingRef.current) {
            wasEditingRef.current = true;
            shouldFocusEditRef.current = true;
            if (!hasPreparedEditDraftRef.current) {
                setEditingDraft(content);
            }
            hasPreparedEditDraftRef.current = false;
        }
    }, [content, isEditing]);

    useLayoutEffect(() => {
        if (!isEditing) return;

        const textarea = editTextareaRef.current;
        if (!textarea) return;

        if (shouldFocusEditRef.current && editingDraft === content) {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            shouldFocusEditRef.current = false;
        }

        const minHeight = 64;
        const maxHeight = 320;

        textarea.style.height = "auto";

        const contentHeight = textarea.scrollHeight;
        const targetHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);

        textarea.style.height = `${targetHeight}px`;
        textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
    }, [content, editingDraft, isEditing]);

    function handleEditKeyDown(event: KeyboardEvent) {
        const textarea = event.currentTarget as HTMLTextAreaElement;
        const formatting = !event.isComposing
            ? getTextFormattingHotkeyResult(event, {
                  value: textarea.value,
                  selectionStart: textarea.selectionStart,
                  selectionEnd: textarea.selectionEnd,
              })
            : undefined;

        if (formatting) {
            event.preventDefault();
            setEditingDraft(formatting.value);
            restoreTextareaSelection(textarea, formatting);
        } else if (
            !event.isComposing &&
            event.key === "Enter" &&
            (event.ctrlKey || event.metaKey)
        ) {
            event.preventDefault();
            onSaveEdit(message.id, editingDraft);
        } else if (!event.isComposing && event.key === "Escape") {
            event.preventDefault();
            onCancelEdit();
        }
    }

    return (
        <article
            className={cn("message", {
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
                                disabled={!canPagePrevious || isPendingSwipe || isEditing}
                                onClick={() => onPreviousSwipe(message.id)}
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <span>
                                {message.activeSwipeIndex + 1}/{message.swipes.length}
                            </span>

                            <button
                                type="button"
                                aria-label={nextSwipeLabel}
                                disabled={!canPageForward || isPendingSwipe || isEditing}
                                onClick={() =>
                                    canUseUserSwipes && isLastSwipe
                                        ? onCreateUserSwipe(message.id)
                                        : onNextSwipe(message.id)
                                }
                                title={nextSwipeLabel}
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

                                        hasPreparedEditDraftRef.current = true;
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
                            ref={editTextareaRef}
                            value={editingDraft}
                            onInput={(event) => {
                                setEditingDraft(event.currentTarget.value);
                            }}
                            onKeyDown={handleEditKeyDown}
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
                        characterDialogueColor={characterDialogueColor}
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

function ToolActivityMessage({
    activity,
    now,
}: {
    activity: MessageToolActivity;
    now?: number;
}) {
    if (!activity) {
        return null;
    }

    const isRunning = activity.status === "running";
    const isError = activity.result.isError;
    const toolName =
        activity.call.displayName ||
        getPluginTool(activity.call.name)?.displayName ||
        activity.call.name;
    const duration = formatActivityDuration(activity, now);
    const durationSuffix = duration ? ` (${duration})` : "";
    const title = isRunning
        ? `Running tool: ${toolName}${durationSuffix}`
        : isError
          ? `Tool failed: ${toolName}${durationSuffix}`
          : `Tool used: ${toolName}${durationSuffix}`;

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

function formatActivityDuration(activity: MessageToolActivity, now = Date.now()) {
    const durationMs =
        activity.status === "running" && activity.startedAt !== undefined
            ? Math.max(0, now - activity.startedAt)
            : activity.durationMs;

    return durationMs === undefined ? undefined : formatDuration(durationMs);
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
        previous.onCreateUserSwipe === next.onCreateUserSwipe &&
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
    const streamingDraft = findStreamingMessageDraftSignal(message.id)?.value;
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
                onVisibleContentChange={onVisibleContentChange}
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
    onVisibleContentChange,
    show,
    showToolActivity,
    timeline,
}: {
    onVisibleContentChange: () => void;
    show: boolean;
    showToolActivity: boolean;
    timeline: ReturnType<typeof getMessageTimeline>;
}) {
    const entries = getVisibleMessageTimeline(timeline, show, showToolActivity);
    const hasRunningTool = entries.some(
        (entry) => entry.type === "tool" && entry.activity.status === "running",
    );
    const hasRunningEntry = entries.some((entry) => {
        const timedEntry = entry.type === "thought" ? entry : entry.activity;
        return timedEntry.startedAt !== undefined && timedEntry.durationMs === undefined;
    });
    const [isOpen, setIsOpen] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!hasRunningEntry) return;

        setNow(Date.now());
        const interval = window.setInterval(
            () => setNow(Date.now()),
            LIVE_DURATION_UPDATE_INTERVAL_MS,
        );
        return () => window.clearInterval(interval);
    }, [hasRunningEntry]);

    useEffect(() => {
        if (hasRunningTool) setIsOpen(true);
    }, [hasRunningTool]);

    if (!show || !entries.length) return null;

    const timedEntries = entries.filter((entry) =>
        entry.type === "thought"
            ? entry.durationMs !== undefined || entry.startedAt !== undefined
            : entry.activity.durationMs !== undefined ||
              entry.activity.startedAt !== undefined,
    );
    const totalDurationMs = timedEntries.reduce((total, entry) => {
        const startedAt =
            entry.type === "thought" ? entry.startedAt : entry.activity.startedAt;
        const durationMs =
            entry.type === "thought" ? entry.durationMs : entry.activity.durationMs;
        return (
            total +
            (durationMs ?? (startedAt === undefined ? 0 : Math.max(0, now - startedAt)))
        );
    }, 0);
    const summary = timedEntries.length
        ? `Thought Process (${formatDuration(totalDurationMs)})`
        : "Thought Process";

    return (
        <details
            className="message-reasoning thought-process"
            open={hasRunningTool || isOpen}
            onToggle={(event) => {
                if (!hasRunningTool) setIsOpen(event.currentTarget.open);
                onVisibleContentChange();
            }}
        >
            <summary>{summary}</summary>
            <div className="thought-process-timeline">
                {entries.map((entry) =>
                    entry.type === "thought" ? (
                        <p className="thought-process-thought" key={entry.id}>
                            {entry.content}
                        </p>
                    ) : (
                        <ToolActivityMessage
                            key={entry.id}
                            activity={entry.activity}
                            now={now}
                        />
                    ),
                )}
            </div>
        </details>
    );
}

function getMessageWithLatestStreamingDraft(message: Message) {
    return applyStreamingMessageDraft(message, getStreamingMessageDraft(message.id));
}
