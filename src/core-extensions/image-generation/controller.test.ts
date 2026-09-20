import { describe, expect, test } from "bun:test";

import type { SmileyPluginApi, PluginAppSnapshot } from "#frontend/lib/plugins/types";

import {
    buildPromptWriterMessages,
    DEFAULT_ASPECT_RATIO_DIMENSIONS,
    imageToolRequestContext,
    IMAGE_TOOL_ASPECT_RATIOS,
    isNovelAIImageGenerationAvailable,
    parseImageToolRequest,
    parsePromptWriterResult,
    resolveAspectRatioDimensions,
    STANDARD_ASPECT_RATIO_DIMENSIONS,
    stripThinkingTags,
} from "./controller";
import { buildImageToolParameters, getImageToolDescription } from "./index";
import { defaultImageGenerationSettings } from "./settings";

describe("image prompt writer response", () => {
    test("accepts fenced JSON and keeps only the insertion", () => {
        expect(
            parsePromptWriterResult(
                '```json\n{"roleMap":[{"role":"Subject","purpose":"focus"}],"prompt":"1girl, red dress","label":"A red-haired woman wearing a red dress.","notes":[]}\n```',
            ),
        ).toEqual({
            roleMap: [{ role: "Subject", purpose: "focus" }],
            prompt: "1girl, red dress",
            label: "A red-haired woman wearing a red dress.",
            notes: [],
        });
    });

    test("rejects prose and empty prompt fields", () => {
        expect(() => parsePromptWriterResult("Here is your prompt")).toThrow(
            "invalid structured response",
        );
        expect(() => parsePromptWriterResult('{"prompt":""}')).toThrow("empty prompt");
        expect(() =>
            parsePromptWriterResult('{"prompt":"1girl","label":""}', true),
        ).toThrow("empty label");
    });

    test("extracts the internal JSON object when a model adds prose", () => {
        expect(
            parsePromptWriterResult(
                'Here is the result: {"roleMap":[],"prompt":"1girl, solo","label":"A solo portrait.","notes":[]}',
            ).prompt,
        ).toBe("1girl, solo");
    });

    test("strips thinking tags before parsing structured JSON", () => {
        expect(stripThinkingTags("<think>Let's think { foo: bar }</think>Hello")).toBe(
            "Hello",
        );
        expect(
            parsePromptWriterResult(
                '<think>\nWe need to output JSON: {"test": 123}\n</think>\n```json\n{"roleMap":[],"prompt":"1girl, smile","notes":[]}\n```',
            ).prompt,
        ).toBe("1girl, smile");
    });

    test("handles trailing commas and unescaped NovelAI syntax in JSON", () => {
        expect(
            parsePromptWriterResult(
                '{"roleMap":[],"prompt":"1girl, \\{blue eyes\\}, [bad hands]","notes":[],}',
            ).prompt,
        ).toBe("1girl, {blue eyes}, [bad hands]");
    });

    test("accepts raw prompt writer output when raw mode is enabled", () => {
        expect(
            parsePromptWriterResult(
                "1girl, nejire hadou, boku no hero academia, looking at viewer",
                false,
                true,
            ),
        ).toEqual({
            roleMap: [],
            prompt: "1girl, nejire hadou, boku no hero academia, looking at viewer",
            label: "1girl, nejire hadou, boku no hero academia, looking at viewer",
            notes: [],
        });

        expect(
            parsePromptWriterResult("```\n1girl, solo, smile\n```", false, true).prompt,
        ).toBe("1girl, solo, smile");

        expect(
            parsePromptWriterResult(
                '<think>thinking about tags</think>{"prompt":"1girl, extracted"}',
                false,
                true,
            ).prompt,
        ).toBe("1girl, extracted");

        expect(() => parsePromptWriterResult("   ", false, true)).toThrow("empty prompt");
    });
});

describe("image prompt writer context", () => {
    test("includes only the configured number of recent messages", () => {
        const snapshot = {
            mode: "chatting",
            messages: [
                message("oldest-message", "user"),
                message("kept-message-one", "assistant"),
                message("kept-message-two", "user"),
            ],
            character: {
                id: "character",
                data: {
                    name: "Character",
                    description: "Description",
                    personality: "Personality",
                    scenario: "Scenario",
                    first_mes: "",
                    mes_example: "",
                    extensions: {},
                },
            },
            persona: { name: "User", description: "Persona" },
            userStatus: "online",
            presetCollection: { activePresetId: "missing", presets: [] },
        } as unknown as PluginAppSnapshot;
        const settings = {
            ...defaultImageGenerationSettings,
            promptWriterHistoryLimit: 2,
        };

        const serialized = JSON.stringify(
            buildPromptWriterMessages(snapshot, settings, "custom", "draw this"),
        );

        expect(serialized).not.toContain("oldest-message");
        expect(serialized).toContain("kept-message-one");
        expect(serialized).toContain("kept-message-two");
        expect(serialized).toContain("draw this");
    });

    test("zero recent messages does not accidentally include the full history", () => {
        const snapshot = {
            mode: "chatting",
            messages: [message("must-not-leak", "user")],
            character: {
                id: "character",
                data: {
                    name: "Character",
                    description: "Description",
                    personality: "Personality",
                    scenario: "Scenario",
                    first_mes: "",
                    mes_example: "",
                    extensions: {},
                },
            },
            persona: { name: "User", description: "Persona" },
            userStatus: "online",
            presetCollection: { activePresetId: "missing", presets: [] },
        } as unknown as PluginAppSnapshot;
        const settings = {
            ...defaultImageGenerationSettings,
            promptWriterHistoryLimit: 0,
        };

        expect(
            JSON.stringify(
                buildPromptWriterMessages(snapshot, settings, "custom", "draw this"),
            ),
        ).not.toContain("must-not-leak");
    });

    test("builds raw prompt writer messages when rawPromptWriter is enabled", () => {
        const snapshot = {
            mode: "chatting",
            messages: [],
            character: {
                id: "character",
                data: {
                    name: "Character",
                    description: "Description",
                    personality: "Personality",
                    scenario: "Scenario",
                    first_mes: "",
                    mes_example: "",
                    extensions: {},
                },
            },
            persona: { name: "User", description: "Persona" },
            userStatus: "online",
            presetCollection: { activePresetId: "missing", presets: [] },
        } as unknown as PluginAppSnapshot;
        const settings = {
            ...defaultImageGenerationSettings,
            rawPromptWriter: true,
        };

        const messages = buildPromptWriterMessages(
            snapshot,
            settings,
            "custom",
            "draw this",
        );
        const systemMessage = messages.find(
            (m) =>
                typeof m.content === "string" &&
                m.content.includes("Output only the exact prompt insertion"),
        );
        expect(systemMessage).toBeDefined();
        const userMessage = messages[messages.length - 1];
        expect(userMessage?.content).toContain(
            "Generate only the raw prompt tags and bindings",
        );
    });
});

describe("automatic image director brief", () => {
    test("uses an exhaustive subject list and excludes an unlisted persona", () => {
        const request = parseImageToolRequest({
            scene: "  Nejire relaxes alone in her apartment after patrol.  ",
            shot: "selfie",
            visibleSubjects: ["Nejire Hado", "Nejire Hado", "  "],
        });
        const context = imageToolRequestContext(request, "Nejire", "Jos");

        expect(request).toEqual({
            scene: "Nejire relaxes alone in her apartment after patrol.",
            shot: "selfie",
            visibleSubjects: ["Nejire Hado"],
        });
        expect(context).toContain("Complete visible-subject list: Nejire Hado");
        expect(context).toContain("active user persona (Jos) is not visible");
        expect(context).toContain("camera or phone stays behind the lens");
    });

    test("rejects ambiguous or incomplete automatic image requests", () => {
        expect(() =>
            parseImageToolRequest({
                scene: "A room",
                shot: "someone_maybe_took_it",
                visibleSubjects: ["Character"],
            }),
        ).toThrow("supported shot type");
        expect(() =>
            parseImageToolRequest({
                scene: "A room",
                shot: "portrait",
                visibleSubjects: [],
            }),
        ).toThrow("at least one visible subject");
    });

    test("parses optional aspect ratio and normalizes standard values and aliases", () => {
        const square = parseImageToolRequest({
            scene: "An avatar shot",
            shot: "portrait",
            visibleSubjects: ["Character"],
            aspectRatio: "square",
        });
        expect(square.aspectRatio).toBe("square");

        const widescreen = parseImageToolRequest({
            scene: "A scenic view",
            shot: "scene_illustration",
            visibleSubjects: ["Character"],
            aspect_ratio: "landscape",
        });
        expect(widescreen.aspectRatio).toBe("widescreen");

        const widescreen169 = parseImageToolRequest({
            scene: "A panoramic shot",
            shot: "scene_illustration",
            visibleSubjects: ["Character"],
            orientation: "16:9",
        });
        expect(widescreen169.aspectRatio).toBe("widescreen");

        const portrait = parseImageToolRequest({
            scene: "Full body",
            shot: "portrait",
            visibleSubjects: ["Character"],
            aspectRatio: "portrait",
        });
        expect(portrait.aspectRatio).toBe("portrait");

        const vertical = parseImageToolRequest({
            scene: "Full body",
            shot: "portrait",
            visibleSubjects: ["Character"],
            aspectRatio: "vertical",
        });
        expect(vertical.aspectRatio).toBe("portrait");

        const omitted = parseImageToolRequest({
            scene: "Normal shot",
            shot: "selfie",
            visibleSubjects: ["Character"],
        });
        expect(omitted.aspectRatio).toBeUndefined();

        expect(() =>
            parseImageToolRequest({
                scene: "An invalid framing",
                shot: "portrait",
                visibleSubjects: ["Character"],
                aspectRatio: "circular",
            }),
        ).toThrow("supported aspect ratio");
    });

    test("resolves standard dimensions respecting free limits", () => {
        expect(resolveAspectRatioDimensions("square")).toEqual({
            width: 1024,
            height: 1024,
        });
        expect(resolveAspectRatioDimensions("widescreen")).toEqual({
            width: 1216,
            height: 832,
        });
        expect(resolveAspectRatioDimensions("portrait")).toEqual({
            width: 832,
            height: 1216,
        });
        expect(resolveAspectRatioDimensions(undefined)).toEqual({
            width: 832,
            height: 1216,
        });

        // Verify non-square standard is 832x1216
        expect(STANDARD_ASPECT_RATIO_DIMENSIONS.portrait.width).toBe(832);
        expect(STANDARD_ASPECT_RATIO_DIMENSIONS.portrait.height).toBe(1216);
        expect(STANDARD_ASPECT_RATIO_DIMENSIONS.widescreen.width).toBe(1216);
        expect(STANDARD_ASPECT_RATIO_DIMENSIONS.widescreen.height).toBe(832);

        // Verify free limit compliance (<= 1024*1024 = 1048576)
        for (const ratio of IMAGE_TOOL_ASPECT_RATIOS) {
            const dims = resolveAspectRatioDimensions(ratio);
            expect(dims.width * dims.height).toBeLessThanOrEqual(1024 * 1024);
            expect(dims.width % 64).toBe(0);
            expect(dims.height % 64).toBe(0);
        }
    });

    test("includes framing guidance in director brief when aspectRatio is specified", () => {
        const req = parseImageToolRequest({
            scene: "A sprawling field",
            shot: "scene_illustration",
            visibleSubjects: ["Character"],
            aspectRatio: "widescreen",
        });
        const brief = imageToolRequestContext(req, "Character", "User");
        expect(brief).toContain(
            "Framing aspect ratio: widescreen — widescreen landscape framing (1216x832)",
        );
    });
});

describe("image tool parameters schema and description", () => {
    test("buildImageToolParameters conditionally includes aspectRatio", () => {
        const disabledSchema = buildImageToolParameters(false) as {
            properties: Record<string, unknown>;
            required: string[];
        };
        expect(disabledSchema.properties.aspectRatio).toBeUndefined();
        expect(disabledSchema.required).not.toContain("aspectRatio");

        const enabledSchema = buildImageToolParameters(true) as {
            properties: Record<string, { enum?: string[] }>;
            required: string[];
        };
        expect(enabledSchema.properties.aspectRatio).toBeDefined();
        expect(enabledSchema.properties.aspectRatio?.enum).toEqual([
            "square",
            "widescreen",
            "portrait",
        ]);
        expect(enabledSchema.required).toContain("aspectRatio");
    });

    test("getImageToolDescription mentions aspectRatio only when enabled", () => {
        expect(getImageToolDescription(false)).not.toContain("aspectRatio");
        expect(getImageToolDescription(true)).toContain("aspectRatio");
    });
});

describe("image tool availability", () => {
    test("uses the core secret accessor with sanitized profile snapshots", () => {
        const snapshot = {
            connectionSettings: {
                activeProfileId: "novelai-profile",
                profiles: [
                    {
                        id: "novelai-profile",
                        name: "NovelAI Images",
                        provider: "novelai",
                        config: { apiKey: undefined },
                    },
                ],
            },
        } as unknown as PluginAppSnapshot;
        const api = {
            connections: {
                hasApiKey: (profileId: string) => profileId === "novelai-profile",
            },
        } as unknown as SmileyPluginApi;

        expect(
            isNovelAIImageGenerationAvailable(
                api,
                snapshot,
                defaultImageGenerationSettings,
            ),
        ).toBe(true);
    });
});

function message(content: string, role: "assistant" | "user") {
    return {
        id: content,
        author: role === "user" ? "User" : "Character",
        role,
        createdAt: "2026-01-01T00:00:00.000Z",
        activeSwipeIndex: 0,
        swipes: [
            {
                id: `${content}-swipe`,
                content,
                createdAt: "2026-01-01T00:00:00.000Z",
            },
        ],
    };
}
