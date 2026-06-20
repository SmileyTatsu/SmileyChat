import {
    ChevronsLeft,
    ChevronsRight,
    KeyRound,
    LibraryBig,
    Puzzle,
    Settings,
    SlidersHorizontal,
    Users,
    X,
} from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";

import {
    activeSettingsCategory,
    setActiveSettingsCategory,
} from "#frontend/app/ui-state";
import type { ConnectionSettings } from "#frontend/lib/connections/config";
import type { LorebookCollection } from "#frontend/lib/lorebooks/types";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import type { PresetCollection } from "#frontend/lib/presets/types";
import type {
    ChatMode,
    Message,
    PersonaSummaryCollection,
    SettingsCategory,
    SmileyCharacter,
    SmileyPersona,
    UserStatus,
} from "#frontend/types";

import type { PluginAppSnapshot } from "#frontend/lib/plugins/types";

import { ConnectionsSettings } from "./connections/connections-settings";
import { GeneralSettings } from "./general-settings";
import { LorebooksSettings } from "./lorebooks-settings";
import { PersonasSettings } from "./personas/personas-settings";
import { PluginsSettings } from "./plugins-settings";
import { PresetSettings } from "./preset-settings";

type OptionsModalProps = {
    connectionLoadError?: string;
    connectionSettings: ConnectionSettings;
    character: SmileyCharacter;
    messages: Message[];
    mode: ChatMode;
    lorebookCollection: LorebookCollection;
    lorebookLoadError?: string;
    isLorebooksPluginEnabled: boolean;
    onLorebookCollectionChange: (collection: LorebookCollection) => void;
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
    { id: "lorebooks", label: "LoreBooks", icon: LibraryBig },
    { id: "personas", label: "Personas", icon: Users },
    { id: "plugins", label: "Plugins", icon: Puzzle },
    { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{
    id: SettingsCategory;
    label: string;
    icon: typeof KeyRound;
}>;

export function OptionsModal({
    connectionLoadError,
    connectionSettings,
    character,
    lorebookCollection,
    lorebookLoadError,
    isLorebooksPluginEnabled,
    messages,
    mode,
    onClose,
    onConnectionSettingsChange,
    onCreatePersona,
    onDeletePersona,
    onLorebookCollectionChange,
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
    const activeCategory = activeSettingsCategory.value;
    const [settingsNavCollapsed, setSettingsNavCollapsed] = useState(false);
    const [isMobileSettingsLayout, setIsMobileSettingsLayout] = useState(
        () => window.matchMedia("(max-width: 820px)").matches,
    );
    const modalRef = useRef<HTMLElement>(null);
    const isSettingsNavCollapsed = settingsNavCollapsed && !isMobileSettingsLayout;

    useEffect(() => {
        const previouslyFocusedElement = document.activeElement as HTMLElement | null;
        modalRef.current?.focus();

        return () => previouslyFocusedElement?.focus();
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 820px)");

        function updateMobileSettingsLayout() {
            setIsMobileSettingsLayout(mediaQuery.matches);
        }

        updateMobileSettingsLayout();
        mediaQuery.addEventListener("change", updateMobileSettingsLayout);

        return () => {
            mediaQuery.removeEventListener("change", updateMobileSettingsLayout);
        };
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
                aria-labelledby="settings-modal-title"
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleModalKeyDown}
            >
                <header className="modal-header">
                    <div className="modal-title-block">
                        <h2 id="settings-modal-title">Options</h2>
                    </div>
                    <button
                        className="icon-button"
                        type="button"
                        title="Close"
                        aria-label="Close options"
                        onClick={onClose}
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>

                <div
                    className={`settings-layout ${isSettingsNavCollapsed ? "nav-collapsed" : ""}`}
                >
                    <aside className="settings-nav-panel">
                        <button
                            className="settings-nav-toggle"
                            type="button"
                            aria-label={
                                isSettingsNavCollapsed
                                    ? "Show options navigation"
                                    : "Hide options navigation"
                            }
                            aria-expanded={!isSettingsNavCollapsed}
                            title={
                                isSettingsNavCollapsed
                                    ? "Show options navigation"
                                    : "Hide options navigation"
                            }
                            onClick={() =>
                                setSettingsNavCollapsed((collapsed) => !collapsed)
                            }
                        >
                            {isSettingsNavCollapsed ? (
                                <ChevronsRight size={16} aria-hidden="true" />
                            ) : (
                                <ChevronsLeft size={16} aria-hidden="true" />
                            )}
                        </button>
                        {!isSettingsNavCollapsed && (
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
                                            onClick={() =>
                                                setActiveSettingsCategory(category.id)
                                            }
                                        >
                                            <Icon size={18} aria-hidden="true" />
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
                                connectionSettings={connectionSettings}
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
                        {activeCategory === "lorebooks" && (
                            <LorebooksSettings
                                collection={lorebookCollection}
                                isLorebooksPluginEnabled={isLorebooksPluginEnabled}
                                loadError={lorebookLoadError}
                                onClose={onClose}
                                onCollectionChange={onLorebookCollectionChange}
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
