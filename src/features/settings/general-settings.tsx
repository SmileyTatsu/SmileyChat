import { Bell, Image, PanelRight, Send, Sparkles } from "lucide-preact";
import { useState } from "preact/hooks";

import {
    playGenerationChime,
    primeGenerationAlertAudio,
    requestDesktopNotificationPermission,
} from "#frontend/lib/notifications/generation-alert";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import type { ChatMode } from "#frontend/types";
import { DeferredNumberInput } from "./deferred-number-input";
import {
    NumberInput,
    SegmentedControl,
    SettingField,
    ToggleRow,
} from "./settings-controls";

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

    function updateNotifications(
        nextNotifications: Partial<AppPreferences["chat"]["notifications"]>,
    ) {
        updateChat({
            notifications: {
                ...preferences.chat.notifications,
                ...nextNotifications,
            },
        });
    }

    function updateMediaWindow(
        nextMediaWindow: Partial<AppPreferences["chat"]["mediaWindow"]>,
    ) {
        updateChat({
            mediaWindow: {
                ...preferences.chat.mediaWindow,
                ...nextMediaWindow,
            },
        });
    }

    const [notificationNotice, setNotificationNotice] = useState("");
    const hasNotificationChannel =
        preferences.chat.notifications.desktop || preferences.chat.notifications.sound;

    async function updateDesktopNotifications(desktop: boolean) {
        if (!desktop) {
            setNotificationNotice("");
            updateNotifications({ desktop: false });
            return;
        }

        const permission = await requestDesktopNotificationPermission();

        if (permission === "granted") {
            setNotificationNotice("");
            updateNotifications({ desktop: true });
            return;
        }

        setNotificationNotice(
            permission === "unsupported"
                ? "This browser does not support desktop notifications."
                : "Desktop notifications are blocked for this site. Allow them in your browser's site settings, then try again.",
        );
        updateNotifications({ desktop: false });
    }

    function updateNotificationSound(sound: boolean) {
        if (sound) {
            primeGenerationAlertAudio();
            playGenerationChime();
        }

        updateNotifications({ sound });
    }

    return (
        <section className="tool-window general-settings">
            <header className="settings-section-heading">
                <div>
                    <h2>Settings</h2>
                    <p>
                        Local interface and interaction preferences for this installation.
                    </p>
                </div>
                {saveStatus && <span className="settings-save-state">{saveStatus}</span>}
            </header>

            {loadError && <p className="connection-status error">{loadError}</p>}

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
                    description="Automatically scroll down when new messages arrive."
                    label="Auto-scroll on new messages"
                    onChange={(autoScroll) => updateChat({ autoScroll })}
                />
            </section>

            <section className="settings-card">
                <header>
                    <Sparkles size={18} />
                    <div>
                        <h3>Generation</h3>
                        <p>Defaults for presets that leave these values unset.</p>
                    </div>
                </header>

                <ToggleRow
                    checked={preferences.chat.streaming}
                    description={
                        preferences.chat.streaming
                            ? "Presets without their own streaming mode show replies token by token as they arrive."
                            : "Presets without their own streaming mode wait and show the finished reply at once."
                    }
                    label="Stream responses"
                    onChange={(streaming) => updateChat({ streaming })}
                />

                <SettingField
                    label="Tool-call iterations per generation"
                    description="Maximum number of consecutive tool-call requests before pausing to ask for confirmation."
                >
                    <NumberInput
                        min={1}
                        max={32}
                        step={1}
                        value={preferences.chat.toolIterationLimit}
                        onChange={(toolIterationLimit) =>
                            updateChat({ toolIterationLimit })
                        }
                    />
                </SettingField>
            </section>

            <section className="settings-card">
                <header>
                    <Bell size={18} />
                    <div>
                        <h3>Notifications</h3>
                        <p>Get told when a reply finishes while you are elsewhere.</p>
                    </div>
                </header>

                <ToggleRow
                    checked={preferences.chat.notifications.desktop}
                    description="Show a system notification with the start of the reply."
                    label="Desktop notification"
                    onChange={(desktop) => void updateDesktopNotifications(desktop)}
                />

                <ToggleRow
                    checked={preferences.chat.notifications.sound}
                    description="Play a short chime when the reply is ready."
                    label="Sound"
                    onChange={updateNotificationSound}
                />

                <ToggleRow
                    checked={preferences.chat.notifications.onlyWhenUnfocused}
                    description={
                        hasNotificationChannel
                            ? "Stay quiet while SmileyChat has focus."
                            : "Turn on a notification above to use this."
                    }
                    disabled={!hasNotificationChannel}
                    label="Only when away from the app"
                    onChange={(onlyWhenUnfocused) =>
                        updateNotifications({ onlyWhenUnfocused })
                    }
                />

                {notificationNotice && (
                    <p className="settings-inline-note">{notificationNotice}</p>
                )}
            </section>

            <section className="settings-card">
                <header>
                    <Image size={18} />
                    <div>
                        <h3>Attachments & media</h3>
                        <p>How much attachment data is resent with each request.</p>
                    </div>
                </header>

                <SettingField
                    label="Images kept in context"
                    description="History images resent to the model as actual pixels. The newest message always keeps its images; older ones become short text markers."
                >
                    <NumberInput
                        min={0}
                        max={10}
                        step={1}
                        value={preferences.chat.mediaWindow.maxActiveImages}
                        onChange={(maxActiveImages) =>
                            updateMediaWindow({ maxActiveImages })
                        }
                    />
                </SettingField>

                <SettingField
                    label="Files kept in context"
                    description="History files re-uploaded or inlined with each request. Older files are described in text instead."
                >
                    <NumberInput
                        min={0}
                        max={10}
                        step={1}
                        value={preferences.chat.mediaWindow.maxActiveFiles}
                        onChange={(maxActiveFiles) =>
                            updateMediaWindow({ maxActiveFiles })
                        }
                    />
                </SettingField>

                <SettingField
                    label="Media look-back (messages)"
                    description="How far back in the chat images and files can still be resent. Anything older becomes a text marker."
                >
                    <NumberInput
                        min={0}
                        max={30}
                        step={1}
                        value={preferences.chat.mediaWindow.maxMessageDistance}
                        onChange={(maxMessageDistance) =>
                            updateMediaWindow({ maxMessageDistance })
                        }
                    />
                </SettingField>
            </section>

            <section className="settings-card">
                <header>
                    <PanelRight size={18} />
                    <div>
                        <h3>Layout & Workspace</h3>
                        <p>Set defaults for new sessions and startup.</p>
                    </div>
                </header>

                <ToggleRow
                    checked={preferences.layout.characterPanelOpenByDefault}
                    description="Keep the character details sidebar expanded when opening chats."
                    label="Open character panel by default"
                    onChange={(characterPanelOpenByDefault) =>
                        updateLayout({ characterPanelOpenByDefault })
                    }
                />

                <SettingField
                    label="Model list display limit"
                    description="Most rows shown at once in the connection model picker. Search always covers every model; this only limits what is drawn."
                >
                    <DeferredNumberInput
                        min={50}
                        max={2000}
                        step={50}
                        value={preferences.layout.modelPickerLimit}
                        integer
                        onCommit={(modelPickerLimit) => {
                            if (modelPickerLimit !== undefined) {
                                updateLayout({ modelPickerLimit });
                            }
                        }}
                    />
                </SettingField>
            </section>
        </section>
    );
}
