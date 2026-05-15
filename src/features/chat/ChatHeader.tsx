import { Menu, User } from "lucide-preact";
import type { ChatMode } from "../../types";

type ChatHeaderProps = {
    characterAvatarPath?: string;
    characterName: string;
    chatTitle: string;
    mode: ChatMode;
    onModeChange: (mode: ChatMode) => void;
    onToggleSidebar?: () => void;
    onToggleCharacter?: () => void;
};

export function ChatHeader({
    characterAvatarPath,
    characterName,
    chatTitle,
    mode,
    onModeChange,
    onToggleSidebar,
    onToggleCharacter,
}: ChatHeaderProps) {
    return (
        <header className="chat-header">
            <div className="chat-title-block">
                {onToggleSidebar && (
                    <button
                        className="mobile-sidebar-toggle"
                        type="button"
                        onClick={onToggleSidebar}
                        aria-label="Toggle sidebar"
                        title="Toggle sidebar"
                    >
                        <Menu size={22} />
                    </button>
                )}
                {characterAvatarPath ? (
                    <img
                        className="header-avatar image-avatar"
                        src={characterAvatarPath}
                        alt=""
                    />
                ) : (
                    <div className="header-avatar" />
                )}
                <div>
                    <h1>{characterName}</h1>
                    <div className="session-kicker">online</div>
                    {mode === "rp" && <div className="rp-chat-title">{chatTitle}</div>}
                </div>
            </div>

            <div className="header-actions">
                <div className="mode-toggle" aria-label="Visual chat mode">
                    <button
                        className={mode === "chat" ? "active" : ""}
                        type="button"
                        onClick={() => onModeChange("chat")}
                    >
                        Chatting
                    </button>
                    <button
                        className={mode === "rp" ? "active" : ""}
                        type="button"
                        onClick={() => onModeChange("rp")}
                    >
                        RP
                    </button>
                </div>

                {onToggleCharacter && (
                    <button
                        className="mobile-character-toggle"
                        type="button"
                        onClick={onToggleCharacter}
                        aria-label="Toggle character info"
                        title="Toggle character info"
                    >
                        <User size={22} />
                    </button>
                )}
            </div>
        </header>
    );
}
