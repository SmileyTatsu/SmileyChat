import { describe, expect, test } from "bun:test";

import type {
    ConnectionSettings,
    OpenAICompatibleConnectionProfile,
    XAIConnectionProfile,
} from "./config";
import { getAdapterForSettings } from "./registry";

describe("connection registry", () => {
    test("applies a temporary native model override without mutating settings", async () => {
        const profile: OpenAICompatibleConnectionProfile = {
            id: "profile-a",
            name: "OpenAI compatible",
            provider: "openai-compatible",
            contextTokenBudget: 8192,
            config: {
                baseUrl: "https://example.test/v1",
                maxCompletionTokens: 1024,
                model: {
                    source: "default",
                    id: "default-model",
                },
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        };
        const settings: ConnectionSettings = {
            version: 1,
            activeProfileId: "profile-a",
            profiles: [profile],
        };

        const adapter = getAdapterForSettings(settings, undefined, {
            modelId: "custom-model",
        });
        const payload = await adapter.buildPayload({
            messages: [],
            promptMessages: [{ role: "user", content: "Hello" }],
        });

        expect(payload as Record<string, unknown>).toMatchObject({
            model: "custom-model",
        });
        expect(profile.config.model.id).toBe("default-model");
    });

    test("returns the xAI adapter and applies temporary model overrides", async () => {
        const profile: XAIConnectionProfile = {
            id: "profile-xai",
            name: "xAI",
            provider: "xai",
            contextTokenBudget: 8192,
            config: {
                baseUrl: "https://api.x.ai/v1",
                maxCompletionTokens: 1024,
                model: {
                    source: "default",
                    id: "grok-4.5",
                },
            },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        };
        const settings: ConnectionSettings = {
            version: 1,
            activeProfileId: "profile-xai",
            profiles: [profile],
        };

        const adapter = getAdapterForSettings(settings, undefined, {
            modelId: "grok-custom",
        });
        const payload = await adapter.buildPayload({
            messages: [],
            promptMessages: [{ role: "user", content: "Hello" }],
        });

        expect(adapter.id).toBe("xai");
        expect(payload as Record<string, unknown>).toMatchObject({
            model: "grok-custom",
        });
        expect(profile.config.model.id).toBe("grok-4.5");
    });
});
