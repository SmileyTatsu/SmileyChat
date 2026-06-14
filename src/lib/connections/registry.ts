import { createAdapterFromPluginProvider } from "../plugins/registry";

import {
    getActiveConnectionProfile,
    isAnthropicProfile,
    isGoogleAIProfile,
    isNovelAIProfile,
    isOpenAICompatibleProfile,
    isOpenRouterProfile,
    type ConnectionSettings,
} from "./config";
import { createAnthropicConnection } from "./anthropic/adapter";
import { createGoogleAIConnection } from "./google-ai/adapter";
import { createNovelAIConnection } from "./novelai/adapter";
import { createOpenAICompatibleConnection } from "./openai-compatible/adapter";
import { createOpenRouterConnection } from "./openrouter/adapter";

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

    if (isOpenRouterProfile(profile)) {
        if (!profile.config.model.id.trim()) {
            throw new Error(`${profile.name} needs a model.`);
        }

        return createOpenRouterConnection({
            ...profile.config,
            apiKey: profile.config.apiKey?.trim() || undefined,
        });
    }

    if (isGoogleAIProfile(profile)) {
        if (!profile.config.model.id.trim()) {
            throw new Error(`${profile.name} needs a model.`);
        }

        return createGoogleAIConnection({
            ...profile.config,
            apiKey: profile.config.apiKey?.trim() || undefined,
        });
    }

    if (isAnthropicProfile(profile)) {
        if (!profile.config.model.id.trim()) {
            throw new Error(`${profile.name} needs a model.`);
        }

        return createAnthropicConnection({
            ...profile.config,
            apiKey: profile.config.apiKey?.trim() || undefined,
        });
    }

    if (isNovelAIProfile(profile)) {
        if (!profile.config.model.id.trim()) {
            throw new Error(`${profile.name} needs a model.`);
        }

        return createNovelAIConnection({
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
