import type { ChatMode, Message } from "../../types";
import type { AppPreferences } from "../../lib/preferences/types";
import type { PluginAppSnapshot } from "../../lib/plugins/types";
import { ChatHeader } from "./ChatHeader";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";

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
    onSendMessage: (draft: string) => void | Promise<void>;
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
    onSendMessage,
    pluginSnapshot,
}: ChatWorkspaceProps) {
    return (
        <section className={`chat-workspace ${mode}`} aria-label="Active chat">
            <ChatHeader
                characterAvatarPath={characterAvatarPath}
                characterName={characterName}
                chatTitle={chatTitle}
                mode={mode}
                onModeChange={onModeChange}
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
                    resetKey={activeChatId}
                    onSubmit={onSendMessage}
                    pluginSnapshot={pluginSnapshot}
                />
            )}
        </section>
    );
}
