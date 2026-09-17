import {
    Activity,
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    KeyRound,
    FileText,
    LibraryBig,
    Maximize2,
    Minimize2,
    Palette,
    Puzzle,
    Settings,
    RefreshCw,
    SlidersHorizontal,
    Users,
    X,
} from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { useLocalStorageBoolean } from "#frontend/app/hooks/use-local-storage-boolean";
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
import { DiagnosticsSettings } from "./diagnostics-settings";
import { FormattingSettings } from "./formatting-settings";
import { LorebooksSettings } from "./lorebooks-settings";
import { PersonasSettings } from "./personas/personas-settings";
import { PluginsSettings } from "./plugins-settings";
import { PresetSettings } from "./preset-settings";
import { SillyTavernSyncSettings } from "./sillytavern-sync-settings";
import { ThemesSettings } from "./themes-settings";

type OptionsModalProps = {
    connectionLoadError?: string;
    connectionSecurityNotice?: string;
    connectionSecretsAccessible: boolean;
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
    onSillyTavernSyncComplete: () => Promise<void>;
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

type SettingsCategoryItem = {
    id: SettingsCategory;
    label: string;
    icon: typeof KeyRound;
};

type SettingsSection = {
    id: string;
    title: string;
    categories: SettingsCategoryItem[];
};

const settingsSections: SettingsSection[] = [
    {
        id: "ai",
        title: "AI & Generation",
        categories: [
            { id: "connections", label: "Connections", icon: KeyRound },
            { id: "preset", label: "Preset", icon: SlidersHorizontal },
            { id: "formatting", label: "Formatting (Beta)", icon: FileText },
        ],
    },
    {
        id: "chat",
        title: "Chat & Content",
        categories: [
            { id: "themes", label: "Themes", icon: Palette },
            { id: "personas", label: "Personas", icon: Users },
            { id: "lorebooks", label: "LoreBooks", icon: LibraryBig },
        ],
    },
    {
        id: "system",
        title: "System & Integrations",
        categories: [
            { id: "settings", label: "Settings", icon: Settings },
            { id: "plugins", label: "Plugins", icon: Puzzle },
            { id: "sillytavern", label: "SillyTavern Sync", icon: RefreshCw },
            { id: "diagnostics", label: "Diagnostics", icon: Activity },
        ],
    },
];

const settingsCategories = settingsSections.flatMap((section) => section.categories);

const settingsModalExpandedStorageKey = "smileychat.optionsModal.expanded";
const settingsNavCollapsedStorageKey = "smileychat.optionsModal.navCollapsed";

export function OptionsModal({
    connectionLoadError,
    connectionSecurityNotice,
    connectionSecretsAccessible,
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
    onSillyTavernSyncComplete,
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
    const activeCategoryItem =
        settingsCategories.find((c) => c.id === activeCategory) ?? settingsCategories[0];
    const activeSection = settingsSections.find((s) =>
        s.categories.some((c) => c.id === activeCategory),
    );
    const ActiveIcon = activeCategoryItem.icon;
    const [isSettingsModalExpanded, setIsSettingsModalExpanded] = useLocalStorageBoolean(
        settingsModalExpandedStorageKey,
    );
    const [settingsNavCollapsed, setSettingsNavCollapsed] = useLocalStorageBoolean(
        settingsNavCollapsedStorageKey,
    );
    const [isMobileSettingsLayout, setIsMobileSettingsLayout] = useState(
        () => window.matchMedia("(max-width: 820px)").matches,
    );
    const modalRef = useRef<HTMLElement>(null);
    const isBackdropMouseDownRef = useRef(false);
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
            handleClose();
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

    function handleSettingsModalSizeToggle() {
        setIsSettingsModalExpanded((expanded) => !expanded);
    }

    function handleClose() {
        (document.activeElement as HTMLElement | null)?.blur();
        onClose();
    }

    function handleBackdropMouseDown(event: MouseEvent) {
        isBackdropMouseDownRef.current =
            event.target === event.currentTarget && event.button === 0;
    }

    function handleBackdropClick(event: MouseEvent) {
        if (isBackdropMouseDownRef.current && event.target === event.currentTarget) {
            handleClose();
        }
        isBackdropMouseDownRef.current = false;
    }

    return (
        <div
            className="modal-backdrop"
            role="presentation"
            onMouseDown={handleBackdropMouseDown}
            onClick={handleBackdropClick}
        >
            <section
                className={`settings-modal ${isSettingsModalExpanded ? "expanded" : ""}`}
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
                    <div className="modal-header-actions">
                        <button
                            className="icon-button settings-modal-size-toggle"
                            type="button"
                            title={
                                isSettingsModalExpanded
                                    ? "Restore options size"
                                    : "Expand options"
                            }
                            aria-pressed={isSettingsModalExpanded}
                            onClick={handleSettingsModalSizeToggle}
                        >
                            {isSettingsModalExpanded ? (
                                <Minimize2 size={18} aria-hidden="true" />
                            ) : (
                                <Maximize2 size={18} aria-hidden="true" />
                            )}
                        </button>

                        <button
                            className="icon-button"
                            type="button"
                            title="Close"
                            aria-label="Close options"
                            onClick={handleClose}
                        >
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                </header>

                <div
                    className={`settings-layout ${isSettingsNavCollapsed ? "nav-collapsed" : ""}`}
                >
                    <aside className="settings-nav-panel">
                        {/* Mobile Category Selector (Dropdown overlay) */}
                        <div className="settings-mobile-nav">
                            <div className="settings-mobile-selector">
                                <div className="settings-mobile-selector-left">
                                    <span className="settings-mobile-icon-wrap">
                                        <ActiveIcon size={18} aria-hidden="true" />
                                    </span>
                                    <div className="settings-mobile-label-group">
                                        <span className="settings-mobile-section-label">
                                            {activeSection?.title}
                                        </span>
                                        <span className="settings-mobile-category-label">
                                            {activeCategoryItem.label}
                                        </span>
                                    </div>
                                </div>
                                <ChevronDown
                                    size={18}
                                    className="settings-mobile-chevron"
                                    aria-hidden="true"
                                />
                                <select
                                    className="settings-mobile-select-overlay"
                                    aria-label="Settings category"
                                    value={activeCategory}
                                    onChange={(e) =>
                                        setActiveSettingsCategory(
                                            e.currentTarget.value as SettingsCategory,
                                        )
                                    }
                                >
                                    {settingsSections.map((section) => (
                                        <optgroup key={section.id} label={section.title}>
                                            {section.categories.map((cat) => (
                                                <option key={cat.id} value={cat.id}>
                                                    {cat.label}
                                                </option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Desktop Navigation Toggle */}
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

                        {/* Desktop Sectioned Sidebar */}
                        <nav
                            className="settings-nav settings-desktop-nav"
                            aria-label="Settings categories"
                        >
                            {settingsSections.map((section) => (
                                <div key={section.id} className="settings-nav-section">
                                    <span className="settings-nav-section-title">
                                        {section.title}
                                    </span>
                                    <div className="settings-nav-section-items">
                                        {section.categories.map((category) => {
                                            const Icon = category.icon;
                                            const isActive =
                                                activeCategory === category.id;
                                            return (
                                                <button
                                                    className={isActive ? "active" : ""}
                                                    key={category.id}
                                                    type="button"
                                                    title={category.label}
                                                    aria-label={category.label}
                                                    onClick={() =>
                                                        setActiveSettingsCategory(
                                                            category.id,
                                                        )
                                                    }
                                                >
                                                    <Icon size={18} aria-hidden="true" />
                                                    <span>{category.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </nav>
                    </aside>

                    <div className="settings-content">
                        {activeCategory === "connections" && (
                            <ConnectionsSettings
                                loadError={connectionLoadError}
                                securityNotice={connectionSecurityNotice}
                                canManageSecrets={connectionSecretsAccessible}
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
                                preferences={preferences}
                                onPreferencesChange={onPreferencesChange}
                                streamingFallback={preferences.chat.streaming}
                                userStatus={userStatus}
                            />
                        )}
                        {activeCategory === "formatting" && (
                            <FormattingSettings
                                character={character}
                                connectionSettings={connectionSettings}
                                messages={messages}
                                preferences={preferences}
                                onPreferencesChange={onPreferencesChange}
                                presetCollection={presetCollection}
                                onPresetCollectionChange={onPresetCollectionChange}
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
                        {activeCategory === "themes" && (
                            <ThemesSettings
                                character={character}
                                loadError={preferencesLoadError}
                                persona={persona}
                                preferences={preferences}
                                saveStatus={preferencesSaveStatus}
                                onPreferencesChange={onPreferencesChange}
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
                        {activeCategory === "sillytavern" && (
                            <SillyTavernSyncSettings
                                preferences={preferences}
                                onPreferencesChange={onPreferencesChange}
                                onSyncComplete={onSillyTavernSyncComplete}
                            />
                        )}
                        {activeCategory === "diagnostics" && (
                            <DiagnosticsSettings
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
