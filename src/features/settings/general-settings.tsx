import { Cpu, PanelRight, Send } from "lucide-preact";

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
                    <Cpu size={18} />
                    <div>
                        <h3>Tool Execution</h3>
                        <p>Configure model tool-call limits.</p>
                    </div>
                </header>

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
