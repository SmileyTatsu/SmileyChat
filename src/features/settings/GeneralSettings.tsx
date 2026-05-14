import { MessageSquareText, PanelRight, Send, Type } from "lucide-preact";
import type { ComponentChildren } from "preact";
import type {
    AppPreferences,
    FontScale,
    MessageDensity,
} from "../../lib/preferences/types";
import type { ChatMode } from "../../types";

type GeneralSettingsProps = {
    loadError?: string;
    preferences: AppPreferences;
    saveStatus?: string;
    onPreferencesChange: (preferences: AppPreferences) => void;
};

export function GeneralSettings({
    loadError,
    preferences,
    saveStatus,
    onPreferencesChange,
}: GeneralSettingsProps) {
    function updateAppearance(
        nextAppearance: Partial<AppPreferences["appearance"]>,
    ) {
        onPreferencesChange({
            ...preferences,
            appearance: {
                ...preferences.appearance,
                ...nextAppearance,
            },
        });
    }

    function updateChat(nextChat: Partial<AppPreferences["chat"]>) {
        onPreferencesChange({
            ...preferences,
            chat: {
                ...preferences.chat,
                ...nextChat,
            },
        });
    }

    function updateLayout(nextLayout: Partial<AppPreferences["layout"]>) {
        onPreferencesChange({
            ...preferences,
            layout: {
                ...preferences.layout,
                ...nextLayout,
            },
        });
    }

    return (
        <section className="tool-window general-settings">
            <header className="settings-section-heading">
                <div>
                    <h2>Settings</h2>
                    <p>Local interface preferences for this installation.</p>
                </div>
                {saveStatus && <span className="settings-save-state">{saveStatus}</span>}
            </header>

            {loadError && <p className="connection-status error">{loadError}</p>}

            <section className="settings-card">
                <header>
                    <MessageSquareText size={18} />
                    <div>
                        <h3>Messages</h3>
                        <p>Adjust how chat history reads on screen.</p>
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
                            updateAppearance({ messageDensity })
                        }
                    />
                </SettingField>

                <SettingField label="Font size">
                    <SegmentedControl<FontScale>
                        value={preferences.appearance.fontScale}
                        options={[
                            { value: "small", label: "Small" },
                            { value: "default", label: "Default" },
                            { value: "large", label: "Large" },
                        ]}
                        onChange={(fontScale) => updateAppearance({ fontScale })}
                    />
                </SettingField>

                <ToggleRow
                    checked={preferences.appearance.showTimestamps}
                    label="Show timestamps"
                    onChange={(showTimestamps) =>
                        updateAppearance({ showTimestamps })
                    }
                />
            </section>

            <section className="settings-card">
                <header>
                    <Send size={18} />
                    <div>
                        <h3>Composer</h3>
                        <p>Choose how sending and scrolling behave.</p>
                    </div>
                </header>

                <ToggleRow
                    checked={preferences.chat.enterToSend}
                    description={
                        preferences.chat.enterToSend
                            ? "Shift+Enter inserts a new line."
                            : "Ctrl+Enter sends, Enter inserts a new line."
                    }
                    label="Enter to send"
                    onChange={(enterToSend) => updateChat({ enterToSend })}
                />

                <ToggleRow
                    checked={preferences.chat.autoScroll}
                    label="Auto-scroll on new messages"
                    onChange={(autoScroll) => updateChat({ autoScroll })}
                />
            </section>

            <section className="settings-card">
                <header>
                    <PanelRight size={18} />
                    <div>
                        <h3>Layout</h3>
                        <p>Set defaults for new sessions and startup.</p>
                    </div>
                </header>

                <SettingField label="Default new chat mode">
                    <SegmentedControl<ChatMode>
                        value={preferences.chat.defaultMode}
                        options={[
                            { value: "chat", label: "Chatting" },
                            { value: "rp", label: "Roleplaying" },
                        ]}
                        onChange={(defaultMode) => updateChat({ defaultMode })}
                    />
                </SettingField>

                <ToggleRow
                    checked={preferences.layout.characterPanelOpenByDefault}
                    label="Open character panel by default"
                    onChange={(characterPanelOpenByDefault) =>
                        updateLayout({ characterPanelOpenByDefault })
                    }
                />
            </section>

            <section className="settings-card preview-card">
                <header>
                    <Type size={18} />
                    <div>
                        <h3>Preview</h3>
                        <p>Current message appearance.</p>
                    </div>
                </header>
                <div className="settings-message-preview">
                    <strong>
                        Mira
                        {preferences.appearance.showTimestamps && <time>10:24 PM</time>}
                    </strong>
                    <p>
                        The room settles into quiet light while the next line waits in
                        the composer.
                    </p>
                </div>
            </section>
        </section>
    );
}

function SettingField({
    children,
    label,
}: {
    children: ComponentChildren;
    label: string;
}) {
    return (
        <div className="settings-field">
            <span>{label}</span>
            {children}
        </div>
    );
}

function ToggleRow({
    checked,
    description,
    label,
    onChange,
}: {
    checked: boolean;
    description?: string;
    label: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="setting-row preference-toggle-row">
            <span>
                <strong>{label}</strong>
                {description && <small>{description}</small>}
            </span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                    onChange((event.currentTarget as HTMLInputElement).checked)
                }
            />
        </label>
    );
}

function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
}: {
    options: Array<{ value: T; label: string }>;
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <div
            className="settings-segmented-control"
            style={{
                gridTemplateColumns: `repeat(${options.length}, minmax(0, auto))`,
            }}
        >
            {options.map((option) => (
                <button
                    className={option.value === value ? "active" : ""}
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                >
                    <span>{option.label}</span>
                </button>
            ))}
        </div>
    );
}
