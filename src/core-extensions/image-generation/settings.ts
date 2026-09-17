import type { SmileyPluginApi } from "#frontend/lib/plugins/types";

import { DEFAULT_IMAGE_PROMPT_INSTRUCTION } from "./default-instruction";
import { PROMPT_MACRO, splitMasterPrompt } from "./master-prompt";

export const IMAGE_SETTINGS_KEY = "settings";
export const ONLY_FREE_MAX_PIXELS = 1024 * 1024;

export const NOVELAI_SAMPLERS = [
    { id: "k_euler_ancestral", label: "Euler Ancestral" },
    { id: "k_euler", label: "Euler" },
    { id: "k_dpmpp_2s_ancestral", label: "DPM++ 2S Ancestral" },
    { id: "k_dpmpp_2m_sde", label: "DPM++ 2M SDE" },
    { id: "k_dpmpp_2m", label: "DPM++ 2M" },
] as const;

export type NovelAISampler = (typeof NOVELAI_SAMPLERS)[number]["id"];
export type NovelAIQualityTags = "standard" | "light" | "none";
export type NovelAIUCPreset = "heavy" | "light" | "furryFocus" | "humanFocus" | "none";
export type NovelAIImageFormat = "png" | "webp";
export type GeneratedImageContextMode = "tags" | "label";

export type ImageContextMode =
    | "character"
    | "portrait"
    | "persona"
    | "scene"
    | "last-message"
    | "background"
    | "raw"
    | "custom";

export type ImageGenerationSettings = {
    version: 1;
    masterPrompt: string;
    promptInstruction: string;
    promptWriterProfileId: string;
    includePresetContext: boolean;
    promptWriterPresetId: string;
    promptWriterHistoryLimit: number;
    generatedImageContextMode: GeneratedImageContextMode;
    novelAIProfileId: string;
    baseUrl: string;
    model: string;
    defaultMode: ImageContextMode;
    width: number;
    height: number;
    sampler: NovelAISampler;
    steps: number;
    scale: number;
    cfgRescale: number;
    noiseSchedule: string;
    negativePrompt: string;
    imageCount: number;
    qualityTags: NovelAIQualityTags;
    ucPreset: NovelAIUCPreset;
    imageFormat: NovelAIImageFormat;
    onlyFree: boolean;
};

export const defaultImageGenerationSettings: ImageGenerationSettings = {
    version: 1,
    masterPrompt: PROMPT_MACRO,
    promptInstruction: DEFAULT_IMAGE_PROMPT_INSTRUCTION,
    promptWriterProfileId: "",
    includePresetContext: true,
    promptWriterPresetId: "",
    promptWriterHistoryLimit: 8,
    generatedImageContextMode: "tags",
    novelAIProfileId: "",
    baseUrl: "https://image.novelai.net",
    model: "nai-diffusion-5-full",
    defaultMode: "scene",
    width: 832,
    height: 1216,
    sampler: "k_euler_ancestral",
    steps: 28,
    scale: 5,
    cfgRescale: 0,
    noiseSchedule: "karras",
    negativePrompt:
        "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry",
    imageCount: 1,
    qualityTags: "standard",
    ucPreset: "heavy",
    imageFormat: "png",
    onlyFree: false,
};

let cachedSettings = defaultImageGenerationSettings;

export function getImageGenerationSettings() {
    return cachedSettings;
}

export async function loadImageGenerationSettings(api: SmileyPluginApi) {
    cachedSettings = normalizeImageGenerationSettings(
        await api.storage.getJson(IMAGE_SETTINGS_KEY, defaultImageGenerationSettings),
    );
    return cachedSettings;
}

export async function saveImageGenerationSettings(
    api: SmileyPluginApi,
    value: ImageGenerationSettings,
) {
    const normalized = normalizeImageGenerationSettings(value);
    splitMasterPrompt(normalized.masterPrompt);
    await api.storage.setJson(IMAGE_SETTINGS_KEY, normalized);
    cachedSettings = normalized;
    return normalized;
}

export function normalizeImageGenerationSettings(
    value: unknown,
): ImageGenerationSettings {
    const input =
        value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const text = (key: keyof ImageGenerationSettings, fallback: string) =>
        typeof input[key] === "string" ? (input[key] as string) : fallback;
    const number = (
        key: keyof ImageGenerationSettings,
        fallback: number,
        min: number,
        max: number,
    ) => {
        const next = Number(input[key]);
        return Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : fallback;
    };
    const modes: ImageContextMode[] = [
        "character",
        "portrait",
        "persona",
        "scene",
        "last-message",
        "background",
        "raw",
        "custom",
    ];
    const defaultMode = modes.includes(input.defaultMode as ImageContextMode)
        ? (input.defaultMode as ImageContextMode)
        : defaultImageGenerationSettings.defaultMode;

    const samplerIds = NOVELAI_SAMPLERS.map((sampler) => sampler.id);
    const sampler = samplerIds.includes(input.sampler as NovelAISampler)
        ? (input.sampler as NovelAISampler)
        : defaultImageGenerationSettings.sampler;
    const qualityTags = normalizeQualityTags(input);
    const ucPreset = normalizeUCPreset(input.ucPreset);
    const imageFormat =
        input.imageFormat === "webp" || input.imageFormat === "png"
            ? input.imageFormat
            : defaultImageGenerationSettings.imageFormat;
    const onlyFree = input.onlyFree === true;
    const includePresetContext = input.includePresetContext !== false;
    const generatedImageContextMode =
        input.generatedImageContextMode === "label" ? "label" : "tags";
    const normalized: ImageGenerationSettings = {
        ...defaultImageGenerationSettings,
        masterPrompt: text("masterPrompt", defaultImageGenerationSettings.masterPrompt),
        promptInstruction: text(
            "promptInstruction",
            defaultImageGenerationSettings.promptInstruction,
        ),
        promptWriterProfileId: text("promptWriterProfileId", ""),
        includePresetContext,
        promptWriterPresetId: text("promptWriterPresetId", ""),
        promptWriterHistoryLimit: Math.round(
            number(
                "promptWriterHistoryLimit",
                defaultImageGenerationSettings.promptWriterHistoryLimit,
                0,
                50,
            ),
        ),
        generatedImageContextMode,
        novelAIProfileId: text("novelAIProfileId", ""),
        baseUrl: text("baseUrl", defaultImageGenerationSettings.baseUrl),
        model: text("model", defaultImageGenerationSettings.model),
        defaultMode,
        width: number("width", defaultImageGenerationSettings.width, 64, 2048),
        height: number("height", defaultImageGenerationSettings.height, 64, 2048),
        sampler,
        steps: Math.round(number("steps", defaultImageGenerationSettings.steps, 1, 50)),
        scale: number("scale", defaultImageGenerationSettings.scale, 0, 20),
        cfgRescale: number("cfgRescale", defaultImageGenerationSettings.cfgRescale, 0, 1),
        noiseSchedule: text(
            "noiseSchedule",
            defaultImageGenerationSettings.noiseSchedule,
        ),
        negativePrompt: text(
            "negativePrompt",
            defaultImageGenerationSettings.negativePrompt,
        ),
        imageCount: Math.round(
            number("imageCount", defaultImageGenerationSettings.imageCount, 1, 4),
        ),
        qualityTags,
        ucPreset,
        imageFormat,
        onlyFree,
        version: 1 as const,
    };

    return onlyFree ? applyOnlyFreeLimits(normalized) : normalized;
}

export function applyOnlyFreeLimits(
    settings: ImageGenerationSettings,
): ImageGenerationSettings {
    let width = settings.width;
    let height = settings.height;

    if (width * height > ONLY_FREE_MAX_PIXELS) {
        const ratio = Math.sqrt(ONLY_FREE_MAX_PIXELS / (width * height));
        width = Math.max(64, Math.floor((width * ratio) / 64) * 64);
        height = Math.max(64, Math.floor((height * ratio) / 64) * 64);
    }

    return {
        ...settings,
        width,
        height,
        steps: Math.min(settings.steps, 28),
        imageCount: 1,
    };
}

function normalizeQualityTags(input: Record<string, unknown>): NovelAIQualityTags {
    if (
        input.qualityTags === "standard" ||
        input.qualityTags === "light" ||
        input.qualityTags === "none"
    ) {
        return input.qualityTags;
    }

    if (input.qualityToggle === false) return "none";
    return defaultImageGenerationSettings.qualityTags;
}

function normalizeUCPreset(value: unknown): NovelAIUCPreset {
    if (
        value === "heavy" ||
        value === "light" ||
        value === "furryFocus" ||
        value === "humanFocus" ||
        value === "none"
    ) {
        return value;
    }

    const legacyValues: Record<number, NovelAIUCPreset> = {
        0: "heavy",
        1: "light",
        2: "furryFocus",
        3: "humanFocus",
        4: "none",
    };
    return legacyValues[Number(value)] ?? defaultImageGenerationSettings.ucPreset;
}
