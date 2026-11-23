import { BookOpen, Menu, MessageCircle, MessageSquare, PanelRight } from "lucide-preact";

import { getPluginHeaderActions } from "#frontend/lib/plugins/registry";
import { AVAILABLE_CHAT_THEMES } from "#frontend/lib/themes/registry";
import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";
import type { ChatGroupMember, ChatMode } from "#frontend/types";

import { GroupAvatar } from "./group-avatar";
import {
    PluginRenderSurface,
    pluginIdFromScopedId,
} from "../plugins/plugin-error-boundary";

type ChatHeaderProps = {
    characterAvatarPath?: string;
    characterName: string;
    chatTitle: string;
    groupMembers?: ChatGroupMember[];
    groupAvatarPath?: string;
    mode: ChatMode;
    theme: string;
    pluginSnapshot: PluginAppSnapshot;
    onThemeChange?: (themeId: string) => void;
    onToggleSidebar?: () => void;
    onToggleCharacter?: () => void;
};

const THEME_ICONS = {
    chat: MessageCircle,
    rp: BookOpen,
    bubbles: MessageSquare,
} as const;

function themeIcon(themeId: string) {
    const Icon = THEME_ICONS[themeId as keyof typeof THEME_ICONS] ?? MessageCircle;
    return <Icon size={16} />;
}

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

function HeaderAvatar(props: {
    characterAvatarPath?: string;
    groupAvatarPath?: string;
    groupMembers?: ChatGroupMember[];
}) {
    if (props.groupMembers?.length) {
        return (
            <GroupAvatar
                className="header-avatar"
                customPath={props.groupAvatarPath}
                members={props.groupMembers}
            />
        );
    }

    return <CharacterAvatar characterAvatarPath={props.characterAvatarPath} />;
}

export function ChatHeader({
    characterAvatarPath,
    characterName,
    chatTitle,
    groupMembers,
    groupAvatarPath,
    mode,
    theme,
    pluginSnapshot,
    onThemeChange,
    onToggleSidebar,
    onToggleCharacter,
}: ChatHeaderProps) {
    const pluginHeaderActions = getPluginHeaderActions();
    const isGroupChat = Boolean(groupMembers?.length);

    return (
        <header className="chat-header">
            <div className="chat-title-block">
                {onToggleSidebar && (
                    <button
                        className="sidebar-toggle-btn"
                        type="button"
                        onClick={onToggleSidebar}
                        aria-label="Toggle sidebar"
                        title="Toggle sidebar"
                    >
                        <Menu size={22} />
                    </button>
                )}

                <HeaderAvatar
                    characterAvatarPath={characterAvatarPath}
                    groupAvatarPath={groupAvatarPath}
                    groupMembers={groupMembers}
                />

                <div
                    className="chat-character-header"
                    data-group={isGroupChat ? "true" : "false"}
                    data-mode={mode}
                >
                    {!(isGroupChat && mode === "rp") && (
                        <h1 className="chat-character-title">{characterName}</h1>
                    )}

                    {!isGroupChat && (
                        <div className="session-kicker">
                            <span className="status-dot"></span>
                            <span className="status-title">Online</span>
                        </div>
                    )}

                    {mode === "rp" && <div className="rp-chat-title">{chatTitle}</div>}
                </div>
            </div>

            <div className="header-actions">
                {onThemeChange && (
                    <div className="theme-toggle" role="group" aria-label="Chat theme">
                        {AVAILABLE_CHAT_THEMES.map((themeOption) => (
                            <button
                                key={themeOption.id}
                                className="theme-toggle-btn"
                                type="button"
                                data-active={themeOption.id === theme}
                                aria-pressed={themeOption.id === theme}
                                title={`${themeOption.name} — ${themeOption.badge}`}
                                onClick={() => onThemeChange(themeOption.id)}
                            >
                                {themeIcon(themeOption.id)}
                            </button>
                        ))}
                    </div>
                )}
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
                                <PluginRenderSurface
                                    pluginId={pluginIdFromScopedId(action.id)}
                                    resetKey={action.id}
                                    fallback={action.label}
                                    surface={action.label}
                                    render={() =>
                                        action.renderIcon
                                            ? action.renderIcon()
                                            : action.label
                                    }
                                />
                            </button>
                        ))}
                    </div>
                )}

                {onToggleCharacter && (
                    <button
                        className="character-toggle-btn"
                        type="button"
                        onClick={onToggleCharacter}
                        aria-label="Toggle character info"
                        title="Toggle character info"
                    >
                        <PanelRight size={22} />
                    </button>
                )}
            </div>
        </header>
    );
}
