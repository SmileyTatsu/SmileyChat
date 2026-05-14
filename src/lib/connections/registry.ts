import {
    getActiveConnectionProfile,
    isOpenAICompatibleProfile,
    type ConnectionSettings,
} from "./config";
import { createOpenAICompatibleConnection } from "./openai-compatible/adapter";
import { createAdapterFromPluginProvider } from "../plugins/registry";

export function getAdapterForSettings(settings: ConnectionSettings) {
    const profile = getActiveConnectionProfile(settings);

    if (!profile) {
        throw new Error("No connection profile is configured.");
    }

    if (isOpenAICompatibleProfile(profile)) {
        if (!profile.config.model.id.trim()) {
            throw new Error(`${profile.name} needs a model.`);
        }

        return createOpenAICompatibleConnection({
            ...profile.config,
            apiKey: profile.config.apiKey?.trim() || undefined,
        });
    }

    const pluginAdapter = createAdapterFromPluginProvider(profile.provider, profile);

    if (!pluginAdapter) {
        throw new Error(`Unsupported connection provider: ${profile.provider}`);
    }

    return pluginAdapter;
}
