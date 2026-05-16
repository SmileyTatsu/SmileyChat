import { Menu, User } from "lucide-preact";

import { getPluginHeaderActions } from "#frontend/lib/plugins/registry";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type { ChatMode } from "#frontend/types";

type ChatHeaderProps = {
    characterAvatarPath?: string;
    characterName: string;
    chatTitle: string;
    mode: ChatMode;
    pluginSnapshot: PluginAppSnapshot;
    onModeChange: (mode: ChatMode) => void;
    onToggleSidebar?: () => void;
    onToggleCharacter?: () => void;
};

function CharacterAvatar(props: { characterAvatarPath?: string }) {
    if (!props.characterAvatarPath) {
        return <div className="header-avatar" />;
    }

    return (
        <img
            className="header-avatar image-avatar"
            src={props.characterAvatarPath}
            alt="Character Card Avatar"
        />
    );
}

export function ChatHeader({
    characterAvatarPath,
    characterName,
    chatTitle,
    mode,
    pluginSnapshot,
    onModeChange,
    onToggleSidebar,
    onToggleCharacter,
}: ChatHeaderProps) {
    const pluginHeaderActions = getPluginHeaderActions();

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

                <CharacterAvatar characterAvatarPath={characterAvatarPath} />

                <div className="chat-character-header">
                    <h1 className="chat-character-title">{characterName}</h1>

                    <div className="session-kicker">
                        <span className="status-dot"></span>
                        <span className="status-title">Online</span>
                    </div>

                    <div className="rp-chat-title">{chatTitle}</div>
                </div>
            </div>

            <div className="header-actions">
                {pluginHeaderActions.length > 0 && (
                    <div className="plugin-header-actions">
                        {pluginHeaderActions.map((action) => (
                            <button
                                key={action.id}
                                type="button"
                                title={action.label}
                                onClick={() =>
                                    void action.run({ snapshot: pluginSnapshot })
                                }
                            >
                                {action.renderIcon ? action.renderIcon() : action.label}
                            </button>
                        ))}
                    </div>
                )}

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
