import {
    ChevronsLeft,
    ChevronsRight,
    KeyRound,
    Puzzle,
    Settings,
    SlidersHorizontal,
    Users,
    X,
} from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ConnectionSettings } from "../../lib/connections/config";
import type { AppPreferences } from "../../lib/preferences/types";
import type { PresetCollection } from "../../lib/presets/types";
import type {
    ChatMode,
    Message,
    PersonaSummaryCollection,
    SettingsCategory,
    SmileyPersona,
    SmileyCharacter,
    UserStatus,
} from "../../types";
import { ConnectionsSettings } from "./connections/ConnectionsSettings";
import { GeneralSettings } from "./GeneralSettings";
import { PersonasSettings } from "./personas/PersonasSettings";
import { PluginsSettings } from "./PluginsSettings";
import { PresetSettings } from "./PresetSettings";
import type { PluginAppSnapshot } from "../../lib/plugins/types";

type OptionsModalProps = {
    activeCategory: SettingsCategory;
    connectionLoadError?: string;
    connectionSettings: ConnectionSettings;
    character: SmileyCharacter;
    messages: Message[];
    mode: ChatMode;
    onCategoryChange: (category: SettingsCategory) => void;
    onClose: () => void;
    onConnectionSettingsChange: (settings: ConnectionSettings) => void;
    onCreatePersona: () => void;
    onDeletePersona: (personaId: string) => void;
    onPersonaChange: (persona: SmileyPersona) => void;
    onPersonaSaved: (persona: SmileyPersona, personas?: PersonaSummaryCollection) => void;
    onPersonaSelect: (personaId: string) => void;
    onSetActivePersona: (personaId: string) => void;
    onPreferencesChange: (preferences: AppPreferences) => void;
    onPresetCollectionChange: (collection: PresetCollection) => void;
    persona: SmileyPersona;
    personaCollection: PersonaSummaryCollection;
    personaLoadError?: string;
    preferences: AppPreferences;
    preferencesLoadError?: string;
    preferencesSaveStatus?: string;
    pluginSnapshot: PluginAppSnapshot;
    presetCollection: PresetCollection;
    presetLoadError?: string;
    userStatus: UserStatus;
};

const settingsCategories = [
    { id: "connections", label: "Connections", icon: KeyRound },
    { id: "preset", label: "Preset", icon: SlidersHorizontal },
    { id: "personas", label: "Personas", icon: Users },
    { id: "plugins", label: "Plugins", icon: Puzzle },
    { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{
    id: SettingsCategory;
    label: string;
    icon: typeof KeyRound;
}>;

export function OptionsModal({
    activeCategory,
    connectionLoadError,
    connectionSettings,
    character,
    messages,
    mode,
    onCategoryChange,
    onClose,
    onConnectionSettingsChange,
    onCreatePersona,
    onDeletePersona,
    onPersonaChange,
    onPersonaSaved,
    onPersonaSelect,
    onSetActivePersona,
    onPreferencesChange,
    onPresetCollectionChange,
    persona,
    personaCollection,
    personaLoadError,
    preferences,
    preferencesLoadError,
    preferencesSaveStatus,
    pluginSnapshot,
    presetCollection,
    presetLoadError,
    userStatus,
}: OptionsModalProps) {
    const [settingsNavCollapsed, setSettingsNavCollapsed] = useState(false);
    const modalRef = useRef<HTMLElement>(null);

    useEffect(() => {
        modalRef.current?.focus();
    }, []);

    function handleModalKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
        }

        if (event.key !== "Tab") {
            return;
        }

        const modal = modalRef.current;

        if (!modal) {
            return;
        }

        const focusableElements = Array.from(
            modal.querySelectorAll<HTMLElement>(
                'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
            ),
        ).filter((element) => !element.hasAttribute("hidden"));

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement as HTMLElement | null;

        if (!firstElement || !lastElement) {
            event.preventDefault();
            modal.focus();
            return;
        }

        if (!activeElement || !focusableElements.includes(activeElement)) {
            event.preventDefault();
            (event.shiftKey ? lastElement : firstElement).focus();
            return;
        }

        if (event.shiftKey && activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
            return;
        }

        if (!event.shiftKey && activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    return (
        <div className="modal-backdrop" role="presentation" onClick={onClose}>
            <section
                className="settings-modal"
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-label="Settings"
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleModalKeyDown}
            >
                <header className="modal-header">
                    <h2>Options</h2>
                    <button
                        className="icon-button"
                        type="button"
                        title="Close"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </header>

                <div
                    className={`settings-layout ${settingsNavCollapsed ? "nav-collapsed" : ""}`}
                >
                    <aside className="settings-nav-panel">
                        <button
                            className="settings-nav-toggle"
                            type="button"
                            title={
                                settingsNavCollapsed
                                    ? "Show options navigation"
                                    : "Hide options navigation"
                            }
                            onClick={() =>
                                setSettingsNavCollapsed((collapsed) => !collapsed)
                            }
                        >
                            {settingsNavCollapsed ? (
                                <ChevronsRight size={16} />
                            ) : (
                                <ChevronsLeft size={16} />
                            )}
                        </button>
                        {!settingsNavCollapsed && (
                            <nav
                                className="settings-nav"
                                aria-label="Settings categories"
                            >
                                {settingsCategories.map((category) => {
                                    const Icon = category.icon;
                                    return (
                                        <button
                                            className={
                                                activeCategory === category.id
                                                    ? "active"
                                                    : ""
                                            }
                                            key={category.id}
                                            type="button"
                                            onClick={() => onCategoryChange(category.id)}
                                        >
                                            <Icon size={18} />
                                            <span>{category.label}</span>
                                        </button>
                                    );
                                })}
                            </nav>
                        )}
                    </aside>

                    <div className="settings-content">
                        {activeCategory === "connections" && (
                            <ConnectionsSettings
                                loadError={connectionLoadError}
                                settings={connectionSettings}
                                onSettingsChange={onConnectionSettingsChange}
                            />
                        )}
                        {activeCategory === "preset" && (
                            <PresetSettings
                                character={character}
                                collection={presetCollection}
                                loadError={presetLoadError}
                                messages={messages}
                                mode={mode}
                                onCollectionChange={onPresetCollectionChange}
                                persona={persona}
                                userStatus={userStatus}
                            />
                        )}
                        {activeCategory === "personas" && (
                            <PersonasSettings
                                collection={personaCollection}
                                loadError={personaLoadError}
                                persona={persona}
                                onCreatePersona={onCreatePersona}
                                onDeletePersona={onDeletePersona}
                                onPersonaChange={onPersonaChange}
                                onPersonaSaved={onPersonaSaved}
                                onPersonaSelect={onPersonaSelect}
                                onSetActivePersona={onSetActivePersona}
                            />
                        )}
                        {activeCategory === "plugins" && (
                            <PluginsSettings pluginSnapshot={pluginSnapshot} />
                        )}
                        {activeCategory === "settings" && (
                            <GeneralSettings
                                loadError={preferencesLoadError}
                                preferences={preferences}
                                saveStatus={preferencesSaveStatus}
                                onPreferencesChange={onPreferencesChange}
                            />
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
