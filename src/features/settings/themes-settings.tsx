import { h } from "preact";
import {
    BookOpen,
    CheckCircle2,
    Code2,
    Eye,
    Info,
    MessageCircle,
    MessageSquare,
    SlidersHorizontal,
    Type,
    Wrench,
} from "lucide-preact";

import { characterInitialAvatar } from "#frontend/lib/characters/avatar";
import { formatShortTime } from "#frontend/lib/common/time";
import {
    messageFormattingForMode,
    renderQuotedText,
} from "#frontend/lib/message-formatting/quote-highlighting";
import type {
    AppPreferences,
    FontScale,
    MessageDensity,
    TimeFormat,
} from "#frontend/lib/preferences/types";
import { stripLeadingSpeakerPrefix } from "#frontend/lib/presets/message-format";
import {
    AVAILABLE_CHAT_THEMES,
    getChatTheme,
    type ChatThemeDefinition,
} from "#frontend/lib/themes/registry";
import type { ChatMode, SmileyCharacter, SmileyPersona } from "#frontend/types";
import { SegmentedControl, SettingField, ToggleRow } from "./settings-controls";

type ThemesSettingsProps = {
    character?: SmileyCharacter;
    loadError?: string;
    persona?: SmileyPersona;
    preferences: AppPreferences;
    saveStatus?: string;
    onPreferencesChange: (preferences: AppPreferences) => void;
};

export function ThemesSettings({
    character,
    loadError,
    persona,
    preferences,
    saveStatus,
    onPreferencesChange,
}: ThemesSettingsProps) {
    const activeThemeId = preferences.appearance.chatTheme || "chat";
    const currentTheme = getChatTheme(activeThemeId);
    const visualMode = (activeThemeId === "rp" ? "rp" : "chat") as ChatMode;
    const formatting = messageFormattingForMode(preferences, visualMode);

    const effectiveShowAvatars =
        preferences.appearance.showCharacterImages ??
        preferences.appearance.showRpCharacterImages;

    const effectiveHighlightQuotes =
        preferences.appearance.highlightQuotedText ?? formatting.highlightQuotes;

    const effectiveItalicizeMessages =
        preferences.appearance.italicizeMessages ?? formatting.italicizeMessages;

    function updateAppearancePreferences(patch: Partial<AppPreferences["appearance"]>) {
        const updated = { ...patch };
        if ("showCharacterImages" in patch) {
            updated.showRpCharacterImages = patch.showCharacterImages!;
        }
        if ("highlightQuotedText" in patch) {
            updated.highlightQuotedTextInChat = patch.highlightQuotedText!;
            updated.highlightQuotedTextInRp = patch.highlightQuotedText!;
        }
        if ("italicizeMessages" in patch) {
            updated.italicizeChatMessages = patch.italicizeMessages!;
            updated.italicizeRpMessages = patch.italicizeMessages!;
        }
        onPreferencesChange({
            ...preferences,
            appearance: {
                ...preferences.appearance,
                ...updated,
            },
        });
    }

    function updateChatPreferences(patch: Partial<AppPreferences["chat"]>) {
        onPreferencesChange({
            ...preferences,
            chat: {
                ...preferences.chat,
                ...patch,
            },
        });
    }

    const charName = character?.data?.name || "Luna";
    const userName = persona?.name || "You";

    const charAvatarUrl = character?.avatar?.path || characterInitialAvatar(charName);
    const userAvatarUrl = persona?.avatar?.path || characterInitialAvatar(userName);

    const previewMessages = [
        {
            id: "msg-1",
            role: "character" as const,
            author: charName,
            text: `${charName}: The library is quiet at this hour. Just the faint rustling of parchment and the soft rain tapping outside against the glass.`,
            date: new Date(2026, 0, 1, 22, 22),
        },
        {
            id: "msg-2",
            role: "character" as const,
            author: charName,
            text: `${charName}: "I found the ledger you mentioned earlier," she adds, sliding a worn volume across the wooden table. "Page thirty-two has what we're looking for."`,
            date: new Date(2026, 0, 1, 22, 23),
            thought:
                "Looking through the archives for references to the old library ledger... Found ledger record in Volume 4. Excerpting section for page thirty-two.",
            tool: {
                name: "search_archives",
                duration: "0.4s",
                args: '{ query: "library ledger", page: 32 }',
                result: 'Found entry: "Town Archives Vol. 4 (1892), p. 32"',
            },
        },
        {
            id: "msg-3",
            role: "user" as const,
            author: userName,
            text: `${userName}: "Let me take a look." You pull the chair closer and lean in to examine the faded ink.`,
            date: new Date(2026, 0, 1, 22, 24),
        },
        {
            id: "msg-4",
            role: "character" as const,
            author: charName,
            text: `${charName}: "Take your time," she smiles softly, leaning back into her armchair. "We aren't in any rush tonight."`,
            date: new Date(2026, 0, 1, 22, 24),
        },
    ];

    function selectTheme(theme: ChatThemeDefinition) {
        if (theme.id === activeThemeId) {
            return;
        }

        onPreferencesChange({
            ...preferences,
            appearance: {
                ...preferences.appearance,
                chatTheme: theme.id,
            },
            chat: {
                ...preferences.chat,
                defaultMode: (theme.id === "rp" ? "rp" : "chat") as ChatMode,
            },
        });
    }

    return (
        <section className="tool-window themes-settings">
            <header className="settings-section-heading">
                <div>
                    <h2>Chat Themes</h2>
                    <p>
                        Choose the global visual theme for all your chats. Themes
                        customize typography, avatars, message bubbles, and reading flow
                        without affecting prompts or model behavior.
                    </p>
                </div>
                {saveStatus && <span className="settings-save-state">{saveStatus}</span>}
            </header>

            {loadError && <p className="connection-status error">{loadError}</p>}

            {/* Clickable Theme Cards with active pop */}
            <div className="themes-grid">
                {AVAILABLE_CHAT_THEMES.map((theme) => {
                    const isActive = theme.id === activeThemeId;
                    const Icon =
                        theme.id === "rp"
                            ? BookOpen
                            : theme.id === "bubbles"
                              ? MessageCircle
                              : MessageSquare;

                    return (
                        <article
                            key={theme.id}
                            className={`theme-card ${isActive ? "active-theme-card" : ""}`}
                            role="button"
                            tabIndex={0}
                            aria-pressed={isActive}
                            aria-label={`Select ${theme.name} theme`}
                            onClick={() => selectTheme(theme)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    selectTheme(theme);
                                }
                            }}
                        >
                            <header className="theme-card-header">
                                <div className="theme-card-title-group">
                                    <span className="theme-card-icon">
                                        <Icon size={18} />
                                    </span>
                                    <div>
                                        <div className="theme-title-row">
                                            <h3>{theme.name}</h3>
                                            <span className="theme-badge">
                                                {theme.badge}
                                            </span>
                                        </div>
                                        <p className="theme-card-description">
                                            {theme.description}
                                        </p>
                                    </div>
                                </div>

                                {isActive && (
                                    <span
                                        className="theme-active-tag"
                                        title="Active global theme"
                                    >
                                        <CheckCircle2 size={13} />
                                        Active
                                    </span>
                                )}
                            </header>
                        </article>
                    );
                })}
            </div>

            {/* Full-width Global Live Preview just after the themes */}
            <section className="settings-card global-theme-preview-card">
                <header className="global-theme-preview-header">
                    <Eye size={18} />
                    <div>
                        <h3>Live Chat Preview</h3>
                        <p>
                            4-turn conversation preview in{" "}
                            <strong>{currentTheme.name}</strong> theme (full width).
                        </p>
                    </div>
                </header>

                <div
                    className={`global-theme-preview-workspace chat-workspace ${activeThemeId} theme-${activeThemeId} density-${preferences.appearance.messageDensity} font-${preferences.appearance.fontScale} ${effectiveItalicizeMessages ? "italicized-message-text" : ""} ${effectiveHighlightQuotes ? "highlight-quoted-text" : ""}`}
                    data-theme={activeThemeId}
                    style={{
                        ...(preferences.appearance.uiFontFamily?.trim()
                            ? {
                                  "--custom-ui-font-family": `${preferences.appearance.uiFontFamily.trim()}, var(--default-font-family)`,
                              }
                            : {}),
                        ...(preferences.appearance.chatFontFamily?.trim()
                            ? {
                                  "--custom-chat-font-family": `${preferences.appearance.chatFontFamily.trim()}, var(--default-font-family)`,
                              }
                            : {}),
                        ...(preferences.appearance.codeblockFontFamily?.trim()
                            ? {
                                  "--custom-codeblock-font-family": `${preferences.appearance.codeblockFontFamily.trim()}, monospace`,
                              }
                            : {}),
                    }}
                >
                    <div className="message-list">
                        {previewMessages.map((msg, index) => {
                            const isCharacter = msg.role === "character";
                            const isContinuation =
                                index > 0 &&
                                previewMessages[index - 1].role === msg.role &&
                                previewMessages[index - 1].author === msg.author;
                            const showRpAvatar =
                                activeThemeId === "rp" && effectiveShowAvatars;
                            const hideChatAvatar =
                                activeThemeId !== "rp" && !effectiveShowAvatars;

                            const hidePrefix =
                                preferences.appearance.hideNamePrefixInMessages !== false;
                            const displayText = hidePrefix
                                ? stripLeadingSpeakerPrefix(msg.text, [
                                      msg.author,
                                      charName,
                                      userName,
                                  ])
                                : msg.text;

                            return (
                                <article
                                    key={msg.id}
                                    className={`message ${isCharacter ? "character-message" : "user-message"} ${showRpAvatar ? "show-rp-message-avatar" : ""} ${hideChatAvatar ? "hide-avatar" : ""} ${isContinuation ? "is-continuation" : ""}`}
                                    data-role={msg.role}
                                    data-continuation={
                                        isContinuation ? "true" : undefined
                                    }
                                >
                                    <div className="message-avatar">
                                        <img
                                            src={
                                                isCharacter
                                                    ? charAvatarUrl
                                                    : userAvatarUrl
                                            }
                                            alt={msg.author}
                                        />
                                    </div>

                                    <div className="message-header">
                                        <div className="message-meta">
                                            <span className="character-title">
                                                {msg.author}
                                            </span>
                                            {preferences.appearance.showTimestamps && (
                                                <time>
                                                    {formatShortTime(
                                                        msg.date,
                                                        preferences.appearance.timeFormat,
                                                    )}
                                                </time>
                                            )}
                                        </div>
                                    </div>

                                    <div className="message-content">
                                        {isCharacter &&
                                            msg.thought &&
                                            preferences.chat.showThoughtProcess && (
                                                <details
                                                    className="message-reasoning thought-process"
                                                    open
                                                >
                                                    <summary>
                                                        Thought Process (0.9s)
                                                    </summary>
                                                    <div className="thought-process-timeline">
                                                        <p className="thought-process-thought">
                                                            {msg.thought}
                                                        </p>
                                                        {preferences.chat
                                                            .showToolActivity &&
                                                            msg.tool && (
                                                                <details
                                                                    className="message-reasoning tool-activity"
                                                                    open
                                                                >
                                                                    <summary>
                                                                        <Wrench
                                                                            size={13}
                                                                            aria-hidden="true"
                                                                        />
                                                                        Tool used:{" "}
                                                                        {msg.tool.name} (
                                                                        {
                                                                            msg.tool
                                                                                .duration
                                                                        }
                                                                        )
                                                                    </summary>
                                                                    <p>
                                                                        <strong>
                                                                            Arguments:
                                                                        </strong>
                                                                        <br />
                                                                        {msg.tool.args}
                                                                    </p>
                                                                    <p>
                                                                        <strong>
                                                                            Result:
                                                                        </strong>
                                                                        <br />
                                                                        {msg.tool.result}
                                                                    </p>
                                                                </details>
                                                            )}
                                                    </div>
                                                </details>
                                            )}
                                        <p>
                                            {renderQuotedText(h, displayText, {
                                                enabled: effectiveHighlightQuotes,
                                            })}
                                        </p>
                                        {preferences.appearance.showTimestamps && (
                                            <time
                                                className="bubble-timestamp"
                                                dateTime={msg.date.toISOString()}
                                            >
                                                {formatShortTime(
                                                    msg.date,
                                                    preferences.appearance.timeFormat,
                                                )}
                                            </time>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Display Configurations */}
            <section className="settings-card theme-display-settings-card">
                <header className="theme-display-settings-header">
                    <SlidersHorizontal size={18} />
                    <div>
                        <h3>Display Settings</h3>
                        <p>Visual presentation rules applied across all themes.</p>
                    </div>
                </header>

                <SettingField label="Message density">
                    <SegmentedControl<MessageDensity>
                        value={preferences.appearance.messageDensity}
                        options={[
                            { value: "compact", label: "Compact" },
                            { value: "comfortable", label: "Comfortable" },
                            { value: "spacious", label: "Spacious" },
                        ]}
                        onChange={(messageDensity) =>
                            updateAppearancePreferences({ messageDensity })
                        }
                    />
                </SettingField>

                <ToggleRow
                    checked={effectiveShowAvatars}
                    description="Display avatar images beside messages across all themes."
                    label="Show avatars"
                    onChange={(showCharacterImages) =>
                        updateAppearancePreferences({
                            showCharacterImages,
                            showRpCharacterImages: showCharacterImages,
                        })
                    }
                />

                <ToggleRow
                    checked={preferences.appearance.hideNamePrefixInMessages !== false}
                    description="Automatically hide leading character and user name prefixes (e.g. 'Character:' or 'User:') from the message view."
                    label="Hide name prefixes in messages"
                    onChange={(hideNamePrefixInMessages) =>
                        updateAppearancePreferences({ hideNamePrefixInMessages })
                    }
                />

                <ToggleRow
                    checked={preferences.chat.showThoughtProcess}
                    description="Show reasoning and thinking sections inside model replies."
                    label="Show thought process"
                    onChange={(showThoughtProcess) =>
                        updateChatPreferences({ showThoughtProcess })
                    }
                />

                <ToggleRow
                    checked={preferences.chat.showToolActivity}
                    description="Show tool call entries and results inside the thought process panel."
                    disabled={!preferences.chat.showThoughtProcess}
                    label="Show tool activity"
                    onChange={(showToolActivity) =>
                        updateChatPreferences({ showToolActivity })
                    }
                />

                <ToggleRow
                    checked={preferences.appearance.showTimestamps}
                    description="Display message timestamps beside author names across all themes."
                    label="Show timestamps"
                    onChange={(showTimestamps) =>
                        updateAppearancePreferences({ showTimestamps })
                    }
                />

                <SettingField label="Hour format">
                    <SegmentedControl<TimeFormat>
                        ariaLabel="Hour format"
                        value={preferences.appearance.timeFormat}
                        options={[
                            { value: "12h", label: "a.m. / p.m." },
                            { value: "24h", label: "24-hour" },
                        ]}
                        onChange={(timeFormat) =>
                            updateAppearancePreferences({ timeFormat })
                        }
                    />
                </SettingField>

                <ToggleRow
                    checked={effectiveHighlightQuotes}
                    description="Use a subtle accent color for dialogue and text inside quotation marks across all themes."
                    label="Highlight quoted text"
                    onChange={(highlightQuotedText) =>
                        updateAppearancePreferences({
                            highlightQuotedText,
                            highlightQuotedTextInChat: highlightQuotedText,
                            highlightQuotedTextInRp: highlightQuotedText,
                        })
                    }
                />

                <ToggleRow
                    checked={effectiveItalicizeMessages}
                    description="Render message body text in italics across all themes."
                    label="Italicize message text"
                    onChange={(italicizeMessages) =>
                        updateAppearancePreferences({
                            italicizeMessages,
                            italicizeChatMessages: italicizeMessages,
                            italicizeRpMessages: italicizeMessages,
                        })
                    }
                />
            </section>

            {/* Typography */}
            <section className="settings-card">
                <header className="theme-display-settings-header">
                    <Type size={18} />
                    <div>
                        <h3>Typography</h3>
                        <p>
                            Font sizing and typography families for chat and application
                            interface.
                        </p>
                    </div>
                </header>

                <SettingField label="Font size">
                    <SegmentedControl<FontScale>
                        value={preferences.appearance.fontScale}
                        options={[
                            { value: "small", label: "Small" },
                            { value: "default", label: "Default" },
                            { value: "large", label: "Large" },
                        ]}
                        onChange={(fontScale) =>
                            updateAppearancePreferences({ fontScale })
                        }
                    />
                </SettingField>

                <SettingField label="UI font">
                    <input
                        className="settings-text-input"
                        type="text"
                        value={preferences.appearance.uiFontFamily}
                        placeholder="System default"
                        spellcheck={false}
                        onInput={(event) =>
                            updateAppearancePreferences({
                                uiFontFamily: event.currentTarget.value,
                            })
                        }
                    />
                </SettingField>

                <SettingField label="Chat font">
                    <input
                        className="settings-text-input"
                        type="text"
                        value={preferences.appearance.chatFontFamily}
                        placeholder="Use UI font"
                        spellcheck={false}
                        onInput={(event) =>
                            updateAppearancePreferences({
                                chatFontFamily: event.currentTarget.value,
                            })
                        }
                    />
                </SettingField>

                <SettingField label="Codeblock font">
                    <input
                        className="settings-text-input"
                        type="text"
                        value={preferences.appearance.codeblockFontFamily}
                        placeholder="Default monospace"
                        spellcheck={false}
                        onInput={(event) =>
                            updateAppearancePreferences({
                                codeblockFontFamily: event.currentTarget.value,
                            })
                        }
                    />
                </SettingField>
            </section>

            {/* Custom CSS */}
            <section className="settings-card">
                <header className="theme-display-settings-header">
                    <Code2 aria-hidden="true" size={18} />
                    <div>
                        <h3>Custom CSS</h3>
                        <p>Apply local style overrides across the application.</p>
                    </div>
                </header>

                <SettingField label="CSS overrides">
                    <textarea
                        aria-label="Custom CSS overrides"
                        autoComplete="off"
                        className="settings-custom-css-input"
                        name="custom-css"
                        placeholder="/* Example: increase chat spacing… */"
                        spellcheck={false}
                        value={preferences.appearance.customCss}
                        onInput={(event) =>
                            updateAppearancePreferences({
                                customCss: event.currentTarget.value,
                            })
                        }
                    />
                </SettingField>
            </section>

            <section className="settings-card theme-info-card">
                <header>
                    <Info size={18} />
                    <div>
                        <h3>Visual-Only Customization</h3>
                        <p>
                            Themes only adjust visual layout, typography, and spacing. All
                            chat completions, prompt generation, tokenizer budgeting, and
                            saved histories remain 100% identical.
                        </p>
                    </div>
                </header>
            </section>
        </section>
    );
}
