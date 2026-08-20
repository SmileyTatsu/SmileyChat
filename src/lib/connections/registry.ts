import { createAdapterFromPluginProvider } from "../plugins/registry";
import { clientLogger } from "../logging/client-logger";

import {
    type ConnectionProfile,
    getActiveConnectionProfile,
    isAnthropicProfile,
    isGoogleAIProfile,
    isNovelAIProfile,
    isOpenAICompatibleProfile,
    isOpenRouterProfile,
    isXAIProfile,
    isKoboldCPPProfile,
    type ConnectionSettings,
} from "./config";
import { createAnthropicConnection } from "./anthropic/adapter";
import { createGoogleAIConnection } from "./google-ai/adapter";
import { createNovelAIConnection } from "./novelai/adapter";
import { createOpenAICompatibleConnection } from "./openai-compatible/adapter";
import { createOpenRouterConnection } from "./openrouter/adapter";
import { createXAIConnection } from "./xai/adapter";
import { createKoboldCPPConnection } from "./koboldcpp/adapter";
import { prepareGenerationRequest } from "./request-validation";
import type { ConnectionAdapter } from "./types";

export function getAdapterForSettings(
    settings: ConnectionSettings,
    profileId?: string,
    options: { modelId?: string } = {},
) {
    const sourceProfile = profileId
        ? settings.profiles.find((candidate) => candidate.id === profileId)
        : getActiveConnectionProfile(settings);
    const source = applyTemporaryModelOverride(sourceProfile, options.modelId);

    if (!source) {
        throw new Error(
            profileId
                ? `Connection profile ${profileId} is not configured.`
                : "No connection profile is configured.",
        );
    }
    const adapterProfile = prepareGenerationRequest(source, { messages: [] }).profile;

    if (isOpenAICompatibleProfile(adapterProfile)) {
        if (!adapterProfile.config.model.id.trim()) {
            throw new Error(`${adapterProfile.name} needs a model.`);
        }

        return withRequestValidation(
            source,
            createOpenAICompatibleConnection({
                ...adapterProfile.config,
                apiKey: adapterProfile.config.apiKey?.trim() || undefined,
            }),
        );
    }

    if (isOpenRouterProfile(adapterProfile)) {
        if (!adapterProfile.config.model.id.trim()) {
            throw new Error(`${adapterProfile.name} needs a model.`);
        }

        return withRequestValidation(
            source,
            createOpenRouterConnection({
                ...adapterProfile.config,
                apiKey: adapterProfile.config.apiKey?.trim() || undefined,
            }),
        );
    }

    if (isGoogleAIProfile(adapterProfile)) {
        if (!adapterProfile.config.model.id.trim()) {
            throw new Error(`${adapterProfile.name} needs a model.`);
        }

        return withRequestValidation(
            source,
            createGoogleAIConnection({
                ...adapterProfile.config,
                apiKey: adapterProfile.config.apiKey?.trim() || undefined,
            }),
        );
    }

    if (isAnthropicProfile(adapterProfile)) {
        if (!adapterProfile.config.model.id.trim()) {
            throw new Error(`${adapterProfile.name} needs a model.`);
        }

        return withRequestValidation(
            source,
            createAnthropicConnection({
                ...adapterProfile.config,
                apiKey: adapterProfile.config.apiKey?.trim() || undefined,
            }),
        );
    }

    if (isNovelAIProfile(adapterProfile)) {
        if (!adapterProfile.config.model.id.trim()) {
            throw new Error(`${adapterProfile.name} needs a model.`);
        }

        return withRequestValidation(
            source,
            createNovelAIConnection({
                ...adapterProfile.config,
                apiKey: adapterProfile.config.apiKey?.trim() || undefined,
            }),
        );
    }

    if (isXAIProfile(adapterProfile)) {
        if (!adapterProfile.config.model.id.trim()) {
            throw new Error(`${adapterProfile.name} needs a model.`);
        }

        return withRequestValidation(
            source,
            createXAIConnection({
                ...adapterProfile.config,
                apiKey: adapterProfile.config.apiKey?.trim() || undefined,
            }),
        );
    }
    if (isKoboldCPPProfile(adapterProfile)) {
        return withRequestValidation(
            source,
            createKoboldCPPConnection({
                ...adapterProfile.config,
                contextTokenBudget: adapterProfile.contextTokenBudget,
            }),
        );
    }

    const pluginAdapter = createAdapterFromPluginProvider(
        adapterProfile.provider,
        adapterProfile,
    );

    if (!pluginAdapter) {
        throw new Error(`Unsupported connection provider: ${source.provider}`);
    }

    return withRequestValidation(source, pluginAdapter);
}

function withRequestValidation(
    profile: ConnectionProfile,
    adapter: ConnectionAdapter,
): ConnectionAdapter {
    const prepare = (request: Parameters<ConnectionAdapter["generate"]>[0]) => {
        const prepared = prepareGenerationRequest(profile, request);
        if (prepared.changes.length) {
            clientLogger.info("VALIDATION", {
                provider: profile.provider,
                model: (profile.config as { model?: { id?: string } }).model?.id,
                metadataSource: prepared.metadataSource,
                ...(prepared.inputTokenLimit
                    ? { inputTokenLimit: prepared.inputTokenLimit }
                    : {}),
                changes: prepared.changes,
            });
        }
        return prepared.request;
    };

    return {
        ...adapter,
        buildPayload: (request) => adapter.buildPayload(prepare(request)),
        generate: (request) => adapter.generate(prepare(request)),
    };
}

function applyTemporaryModelOverride(
    profile: ConnectionProfile | undefined,
    modelId: string | undefined,
): ConnectionProfile | undefined {
    const trimmedModelId = modelId?.trim();

    if (!profile || !trimmedModelId) {
        return profile;
    }

    if (
        isOpenAICompatibleProfile(profile) ||
        isOpenRouterProfile(profile) ||
        isGoogleAIProfile(profile) ||
        isAnthropicProfile(profile) ||
        isNovelAIProfile(profile) ||
        isXAIProfile(profile) ||
        isKoboldCPPProfile(profile)
    ) {
        return {
            ...profile,
            config: {
                ...profile.config,
                model: {
                    ...profile.config.model,
                    source: "custom",
                    id: trimmedModelId,
                },
            },
        } as ConnectionProfile;
    }

    return profile;
}
