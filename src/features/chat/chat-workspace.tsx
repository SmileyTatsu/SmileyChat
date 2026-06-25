import { memo } from "preact/compat";

import type {
    PluginAppSnapshot,
    PluginComposerStatePatch,
} from "#frontend/lib/plugins/types";
import { messageFormattingForMode } from "#frontend/lib/message-formatting/quote-highlighting";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import type { ChatGroupMember, ChatMode, Message } from "#frontend/types";

import { ChatHeader } from "./chat-header";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";

type LoadingMessageSkeleton = {
    lines: readonly number[];
};

const LOADING_MESSAGE_SKELETONS: readonly LoadingMessageSkeleton[] = [
    { lines: [24, 88, 72] },
    { lines: [31, 100] },
    { lines: [20, 94, 58] },
    { lines: [34, 76] },
    { lines: [27, 92, 81] },
    { lines: [22, 88] },
    { lines: [36, 100, 64] },
    { lines: [26, 84] },
    { lines: [30, 98, 70] },
    { lines: [24, 67] },
    { lines: [29, 91, 54] },
    { lines: [21, 83] },
    { lines: [33, 97, 76] },
    { lines: [25, 74] },
    { lines: [38, 100, 69] },
    { lines: [23, 86] },
    { lines: [28, 95, 61] },
    { lines: [35, 78] },
    { lines: [19, 89, 73] },
    { lines: [32, 82] },
    { lines: [26, 99, 57] },
    { lines: [30, 71] },
];

type ChatWorkspaceProps = {
    activeChatId: string;
    characterAvatarPath?: string;
    characterName: string;
    chatTitle: string;
    groupAvatarPath?: string;
    groupMembers?: ChatGroupMember[];
    errorMessage?: string;
    isLoading?: boolean;
    isSending?: boolean;
    messages: Message[];
    mode: ChatMode;
    preferences: AppPreferences;
    pendingSwipeMessageId?: string;
    canForkMessages: boolean;
    emptyState?: {
        title: string;
        description: string;
        actionLabel: string;
        onAction: () => void;
    };
    onDeleteMessage: (messageId: string) => void;
    onDeleteMessageSwipe: (messageId: string) => void;
    onEditMessage: (messageId: string, content: string) => void;
    onForkMessage: (messageId: string) => void;
    onModeChange: (mode: ChatMode) => void;
    onNextSwipe: (messageId: string) => void;
    onPreviousSwipe: (messageId: string) => void;
    onAbortGeneration: () => void;
    onSendMessage: (draft: string, images?: File[]) => void | Promise<void>;
    onToggleSidebar?: () => void;
    onToggleCharacter?: () => void;
    pluginComposerState?: PluginComposerStatePatch;
    getPluginSnapshot: () => PluginAppSnapshot;
    pluginSnapshot: PluginAppSnapshot;
};

export const ChatWorkspace = memo(function ChatWorkspace({
    activeChatId,
    characterAvatarPath,
    characterName,
    chatTitle,
    groupAvatarPath,
    groupMembers,
    errorMessage,
    isLoading,
    isSending,
    messages,
    mode,
    preferences,
    pendingSwipeMessageId,
    canForkMessages,
    emptyState,
    onDeleteMessage,
    onDeleteMessageSwipe,
    onEditMessage,
    onForkMessage,
    onModeChange,
    onNextSwipe,
    onPreviousSwipe,
    onAbortGeneration,
    onSendMessage,
    onToggleSidebar,
    onToggleCharacter,
    pluginComposerState,
    getPluginSnapshot,
    pluginSnapshot,
}: ChatWorkspaceProps) {
    const messageFormatting = messageFormattingForMode(preferences, mode);
    const workspaceClassName = [
        "chat-workspace",
        mode,
        messageFormatting.italicizeMessages ? "italicized-message-text" : "",
        messageFormatting.highlightQuotes ? "highlight-quoted-text" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <section
            className={workspaceClassName}
            aria-busy={isLoading ? "true" : undefined}
            aria-label="Active chat"
        >
            <ChatHeader
                characterAvatarPath={characterAvatarPath}
                characterName={characterName}
                chatTitle={chatTitle}
                groupAvatarPath={groupAvatarPath}
                groupMembers={groupMembers}
                mode={mode}
                pluginSnapshot={pluginSnapshot}
                onModeChange={onModeChange}
                onToggleSidebar={onToggleSidebar}
                onToggleCharacter={onToggleCharacter}
            />
            {isLoading ? (
                <ChatLoadingState />
            ) : emptyState ? (
                <div className="chat-empty-state">
                    <div>
                        <h2>{emptyState.title}</h2>
                        <p>{emptyState.description}</p>
                        <button type="button" onClick={emptyState.onAction}>
                            {emptyState.actionLabel}
                        </button>
                    </div>
                </div>
            ) : (
                <MessageList
                    key={activeChatId}
                    characterAvatarPath={characterAvatarPath}
                    characterName={characterName}
                    errorMessage={errorMessage}
                    isTyping={isSending}
                    messages={messages}
                    mode={mode}
                    autoScroll={preferences.chat.autoScroll}
                    initialMessageCount={preferences.chat.initialMessageCount}
                    pendingSwipeMessageId={pendingSwipeMessageId}
                    resetKey={activeChatId}
                    showRpCharacterImages={preferences.appearance.showRpCharacterImages}
                    showTimestamps={preferences.appearance.showTimestamps}
                    timeFormat={preferences.appearance.timeFormat}
                    messageFormatting={messageFormatting}
                    canForkMessages={canForkMessages}
                    onDeleteMessage={onDeleteMessage}
                    onDeleteMessageSwipe={onDeleteMessageSwipe}
                    onEditMessage={onEditMessage}
                    onForkMessage={onForkMessage}
                    onNextSwipe={onNextSwipe}
                    onPreviousSwipe={onPreviousSwipe}
                    getPluginSnapshot={getPluginSnapshot}
                />
            )}
            {!emptyState && !isLoading && (
                <MessageComposer
                    characterName={characterName}
                    disabled={
                        pluginComposerState?.disabled ||
                        isSending ||
                        Boolean(pendingSwipeMessageId)
                    }
                    mode={mode}
                    enterToSend={preferences.chat.enterToSend}
                    isGenerating={Boolean(isSending)}
                    placeholder={pluginComposerState?.placeholder}
                    resetKey={activeChatId}
                    onAbortGeneration={onAbortGeneration}
                    onSubmit={onSendMessage}
                    pluginSnapshot={pluginSnapshot}
                />
            )}
        </section>
    );
});

function ChatLoadingState() {
    return (
        <div className="chat-loading-state" role="status" aria-live="polite">
            <div className="chat-loading-copy">
                <span>Loading chat...</span>
            </div>
            {LOADING_MESSAGE_SKELETONS.map((message, messageIndex) => (
                <div
                    className="chat-loading-message"
                    aria-hidden="true"
                    key={messageIndex}
                >
                    <div className="chat-loading-avatar" />
                    <div className="chat-loading-lines">
                        {message.lines.map((lineWidth, lineIndex) => (
                            <div
                                key={lineIndex}
                                style={`--chat-loading-line-width: ${lineWidth}`}
                            />
                        ))}
                    </div>
                </div>
            ))}
            <div className="chat-loading-composer" aria-hidden="true" />
        </div>
    );
}
