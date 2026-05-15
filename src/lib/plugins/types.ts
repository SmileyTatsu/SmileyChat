import type { ComponentChildren, VNode } from "preact";

import type {
    ChatMode,
    ChatSession,
    Message,
    ScyllaCharacter,
    ScyllaPersona,
    UserStatus,
} from "#frontend/types";

import type { ConnectionProfile, ConnectionSettings } from "../connections/config";
import type {
    ChatGenerationMessage,
    ChatGenerationResult,
    ConnectionAdapter,
} from "../connections/types";
import type { MacroContext } from "../presets/macros";
import type { PresetCollection } from "../presets/types";

export type PluginManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    main: string;
    styles?: string[];
    permissions?: string[];
    enabled?: boolean;
    entryUrl?: string;
    styleUrls?: string[];
    source?: "core" | "user";
};

export type LoadedPlugin = {
    manifest: PluginManifest;
    status: "loaded" | "error";
    error?: string;
};

export type PluginAppSnapshot = {
    mode: ChatMode;
    activeChat?: ChatSession;
    messages: Message[];
    character: ScyllaCharacter;
    persona: ScyllaPersona;
    userStatus: UserStatus;
    connectionSettings: ConnectionSettings;
    presetCollection: PresetCollection;
};

export type PluginSettingsPanelProps = {
    pluginId: string;
    storage: PluginStorageApi;
    snapshot: PluginAppSnapshot;
};

export type PluginSettingsPanel = {
    id: string;
    label: string;
    render: (props: PluginSettingsPanelProps) => ComponentChildren;
};

export type MessageRenderContext = {
    content: string;
    message: Message;
    mode: ChatMode;
    characterName: string;
    characterAvatarPath?: string;
};

export type MessageRenderer = {
    id: string;
    priority?: number;
    render: (context: MessageRenderContext) => ComponentChildren;
};

export type PluginMessageActionContext = {
    message: Message;
    content: string;
    snapshot: PluginAppSnapshot;
};

export type PluginMessageAction = {
    id: string;
    label: string;
    renderIcon?: () => VNode;
    run: (context: PluginMessageActionContext) => void | Promise<void>;
};

export type PluginComposerActionContext = {
    draft: string;
    setDraft: (draft: string) => void;
    insertText: (text: string) => void;
    submit: () => void | Promise<void>;
    snapshot: PluginAppSnapshot;
};

export type PluginComposerAction = {
    id: string;
    label: string;
    renderIcon?: () => VNode;
    run: (context: PluginComposerActionContext) => void | Promise<void>;
};

export type ChatPipelineContext = {
    character: ScyllaCharacter;
    mode: ChatMode;
    persona: ScyllaPersona;
    userStatus: UserStatus;
    messages: Message[];
};

export type ChatInputMiddleware = (
    content: string,
    context: ChatPipelineContext,
) => string | Promise<string>;

export type PromptMiddlewareContext = ChatPipelineContext & {
    promptMessages: ChatGenerationMessage[];
};

export type PromptMiddleware = (
    messages: ChatGenerationMessage[],
    context: PromptMiddlewareContext,
) => ChatGenerationMessage[] | Promise<ChatGenerationMessage[]>;

export type ChatOutputMiddleware = (
    content: string,
    context: ChatPipelineContext & {
        result: ChatGenerationResult;
    },
) => string | Promise<string>;

export type PluginMacroResolver = (
    context: MacroContext,
    key: string,
) => string | undefined;

export type PluginConnectionProvider = {
    id: string;
    label: string;
    defaultConfig?: Record<string, unknown>;
    createAdapter: (profile: ConnectionProfile) => ConnectionAdapter;
    renderSettings?: (props: {
        profile: ConnectionProfile;
        disabled?: boolean;
        onChange: (config: Record<string, unknown>) => void;
        onSave: () => void | Promise<void>;
        onTest: () => void | Promise<void>;
    }) => ComponentChildren;
    testConnection?: (profile: ConnectionProfile) => Promise<string>;
};

export type PluginStorageApi = {
    getJson<T>(key: string, fallback: T): Promise<T>;
    setJson<T>(key: string, value: T): Promise<void>;
    remove(key: string): Promise<void>;
};

export type PluginEventsApi = {
    on(eventName: string, listener: (payload: unknown) => void): () => void;
    emit(eventName: string, payload?: unknown): void;
};

export type ScyllaPluginApi = {
    plugin: PluginManifest;
    state: {
        getSnapshot(): PluginAppSnapshot | undefined;
        subscribe(listener: (snapshot: PluginAppSnapshot) => void): () => void;
    };
    ui: {
        h: typeof import("preact").h;
        registerSettingsPanel(panel: PluginSettingsPanel): void;
        registerMessageRenderer(renderer: MessageRenderer): void;
        registerMessageAction(action: PluginMessageAction): void;
        registerComposerAction(action: PluginComposerAction): void;
        addStyles(cssText: string): void;
    };
    chat: {
        registerInputMiddleware(middleware: ChatInputMiddleware): void;
        registerPromptMiddleware(middleware: PromptMiddleware): void;
        registerOutputMiddleware(middleware: ChatOutputMiddleware): void;
    };
    presets: {
        registerMacro(name: string, resolver: PluginMacroResolver): void;
    };
    connections: {
        registerProvider(provider: PluginConnectionProvider): void;
    };
    storage: PluginStorageApi;
    events: PluginEventsApi;
};

export type ScyllaPluginModule = {
    activate: (
        api: ScyllaPluginApi,
    ) => void | (() => void) | Promise<void | (() => void)>;
};
