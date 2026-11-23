import {
    BookOpen,
    Check,
    ChevronDown,
    Menu,
    MessageCircle,
    MessageSquare,
    PanelRight,
} from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";

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

function ThemeIcon({ themeId, size = 16 }: { themeId: string; size?: number }) {
    const Icon = THEME_ICONS[themeId as keyof typeof THEME_ICONS] ?? MessageCircle;
    return <Icon size={size} />;
}

function ThemePicker({
    theme,
    onThemeChange,
}: {
    theme: string;
    onThemeChange: (themeId: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const activeTheme =
        AVAILABLE_CHAT_THEMES.find((option) => option.id === theme) ??
        AVAILABLE_CHAT_THEMES[0];

    useEffect(() => {
        if (!isOpen) return;

        function handlePointerDown(event: PointerEvent) {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") setIsOpen(false);
        }

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);

    return (
        <div className="theme-picker" ref={containerRef}>
            <button
                className="theme-picker-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                title="Chat theme"
                onClick={() => setIsOpen((open) => !open)}
            >
                <ThemeIcon themeId={activeTheme.id} size={15} />
                <span>{activeTheme.name}</span>
                <ChevronDown size={13} />
            </button>

            {isOpen && (
                <div className="theme-picker-menu" role="menu">
                    {AVAILABLE_CHAT_THEMES.map((option) => {
                        const isActive = option.id === activeTheme.id;

                        return (
                            <button
                                className="theme-picker-option"
                                key={option.id}
                                type="button"
                                role="menuitemradio"
                                aria-checked={isActive}
                                data-active={isActive}
                                onClick={() => {
                                    onThemeChange(option.id);
                                    setIsOpen(false);
                                }}
                            >
                                <span className="theme-picker-option-icon">
                                    <ThemeIcon themeId={option.id} />
                                </span>
                                <span className="theme-picker-option-text">
                                    <strong>{option.name}</strong>
                                    <small>{option.badge}</small>
                                </span>
                                {isActive && <Check size={14} />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
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
                    <ThemePicker theme={theme} onThemeChange={onThemeChange} />
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
