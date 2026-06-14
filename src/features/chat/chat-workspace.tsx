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
    emptyState?: {
        title: string;
        description: string;
        actionLabel: string;
        onAction: () => void;
    };
    onDeleteMessage: (messageId: string) => void;
    onEditMessage: (messageId: string, content: string) => void;
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
    emptyState,
    onDeleteMessage,
    onEditMessage,
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
                    messageFormatting={messageFormatting}
                    onDeleteMessage={onDeleteMessage}
                    onEditMessage={onEditMessage}
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
            <div className="chat-loading-message wide" aria-hidden="true">
                <div className="chat-loading-avatar" />
                <div className="chat-loading-lines">
                    <div />
                    <div />
                </div>
            </div>
            <div className="chat-loading-message medium" aria-hidden="true">
                <div className="chat-loading-avatar" />
                <div className="chat-loading-lines">
                    <div />
                    <div />
                </div>
            </div>
            <div className="chat-loading-message narrow" aria-hidden="true">
                <div className="chat-loading-avatar" />
                <div className="chat-loading-lines">
                    <div />
                    <div />
                </div>
            </div>
            <div className="chat-loading-composer" aria-hidden="true" />
        </div>
    );
}
