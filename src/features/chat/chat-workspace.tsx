import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import type { ChatMode, Message } from "#frontend/types";

import { ChatHeader } from "./chat-header";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";

type ChatWorkspaceProps = {
    activeChatId: string;
    characterAvatarPath?: string;
    characterName: string;
    chatTitle: string;
    errorMessage?: string;
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
    pluginSnapshot: PluginAppSnapshot;
};

export function ChatWorkspace({
    activeChatId,
    characterAvatarPath,
    characterName,
    chatTitle,
    errorMessage,
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
    pluginSnapshot,
}: ChatWorkspaceProps) {
    return (
        <section className={`chat-workspace ${mode}`} aria-label="Active chat">
            <ChatHeader
                characterAvatarPath={characterAvatarPath}
                characterName={characterName}
                chatTitle={chatTitle}
                mode={mode}
                pluginSnapshot={pluginSnapshot}
                onModeChange={onModeChange}
                onToggleSidebar={onToggleSidebar}
                onToggleCharacter={onToggleCharacter}
            />
            {emptyState ? (
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
                    characterAvatarPath={characterAvatarPath}
                    characterName={characterName}
                    errorMessage={errorMessage}
                    isTyping={mode === "rp" ? isSending : false}
                    messages={messages}
                    mode={mode}
                    autoScroll={preferences.chat.autoScroll}
                    pendingSwipeMessageId={pendingSwipeMessageId}
                    showRpCharacterImages={
                        preferences.appearance.showRpCharacterImages
                    }
                    showTimestamps={preferences.appearance.showTimestamps}
                    onDeleteMessage={onDeleteMessage}
                    onEditMessage={onEditMessage}
                    onNextSwipe={onNextSwipe}
                    onPreviousSwipe={onPreviousSwipe}
                    pluginSnapshot={pluginSnapshot}
                />
            )}
            {!emptyState && isSending && mode === "chat" && (
                <div
                    className="chat-typing-line"
                    aria-label={`${characterName} is writing`}
                >
                    <div className="typing-dots">
                        <i />
                        <i />
                        <i />
                    </div>
                    <span>{characterName} is writing</span>
                </div>
            )}
            {!emptyState && (
                <MessageComposer
                    characterName={characterName}
                    disabled={isSending || Boolean(pendingSwipeMessageId)}
                    mode={mode}
                    enterToSend={preferences.chat.enterToSend}
                    isGenerating={Boolean(isSending)}
                    resetKey={activeChatId}
                    onAbortGeneration={onAbortGeneration}
                    onSubmit={onSendMessage}
                    pluginSnapshot={pluginSnapshot}
                />
            )}
        </section>
    );
}
