import type { NovelAIConnectionProfile } from "#frontend/lib/connections/config";

import {
    applyOnlyFreeLimits,
    type ImageGenerationSettings,
    type NovelAIImageFormat,
    type NovelAIQualityTags,
    type NovelAIUCPreset,
} from "./settings";

type NovelAIImageResponse = {
    images?: Array<{ image?: string; index?: number; seed?: number }>;
    message?: string;
    error?: string | { message?: string };
};

export type NovelAIImageResult = {
    images: string[];
    seeds: number[];
    correlationId: string;
};

export async function generateNovelAIImages(
    profile: NovelAIConnectionProfile,
    settings: ImageGenerationSettings,
    prompt: string,
    signal?: AbortSignal,
): Promise<NovelAIImageResult> {
    const apiKey = profile.config.apiKey?.trim();
    if (!apiKey) {
        throw new Error(`NovelAI profile “${profile.name}” does not have an API token.`);
    }

    const effectiveSettings = settings.onlyFree
        ? applyOnlyFreeLimits(settings)
        : settings;
    const correlationId = createCorrelationId();
    const seed = randomSeed();
    const baseUrl = effectiveSettings.baseUrl.trim().replace(/\/+$/, "");
    const quality = mapQualityTags(effectiveSettings.qualityTags);
    const ucPreset = mapUCPreset(effectiveSettings.ucPreset);
    const response = await fetch(`${baseUrl}/ai/generate-image`, {
        method: "POST",
        signal,
        headers: {
            // Base64 is larger than binary ZIP, but avoids a ZIP parser in the browser and
            // gives this integration one documented response shape for PNG and WebP.
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "x-correlation-id": correlationId,
        },
        body: JSON.stringify({
            action: "generate",
            input: prompt,
            model: effectiveSettings.model,
            parameters: {
                params_version: effectiveSettings.model.startsWith("nai-diffusion-5")
                    ? 4
                    : 3,
                prompt,
                width: effectiveSettings.width,
                height: effectiveSettings.height,
                sampler: effectiveSettings.sampler,
                steps: effectiveSettings.steps,
                scale: effectiveSettings.scale,
                cfg_rescale: effectiveSettings.cfgRescale,
                noise_schedule: effectiveSettings.noiseSchedule,
                n_samples: effectiveSettings.imageCount,
                seed,
                negative_prompt: effectiveSettings.negativePrompt,
                image_format: effectiveSettings.imageFormat,
                qualityToggle: quality.enabled,
                ...(quality.hint === undefined ? {} : { tag_hint_qt: quality.hint }),
                ucPreset,
                tag_hint_uc_preset: ucPreset,
                legacy: false,
                add_original_image: true,
                dynamic_thresholding: false,
                controlnet_strength: 1,
                sm: false,
                sm_dyn: false,
                deliberate_euler_ancestral_bug: false,
                prefer_brownian: true,
                v4_prompt: {
                    caption: { base_caption: prompt, char_captions: [] },
                    use_coords: false,
                    use_order: true,
                },
                v4_negative_prompt: {
                    caption: {
                        base_caption: effectiveSettings.negativePrompt,
                        char_captions: [],
                    },
                    legacy_uc: false,
                    use_coords: false,
                    use_order: false,
                },
            },
        }),
    });

    const payload = (await response.json().catch(() => ({}))) as NovelAIImageResponse;
    if (!response.ok) {
        const apiMessage =
            typeof payload.error === "string"
                ? payload.error
                : payload.error?.message || payload.message;
        throw new Error(
            `NovelAI image generation failed (${response.status}, ${correlationId})${apiMessage ? `: ${apiMessage}` : "."}`,
        );
    }

    const rows = payload.images ?? [];
    const images = rows.flatMap((item) =>
        item.image ? [asImageDataUrl(item.image, effectiveSettings.imageFormat)] : [],
    );
    if (!images.length) {
        throw new Error(`NovelAI returned no images (${correlationId}).`);
    }

    return {
        images,
        seeds: rows.flatMap((item) => (typeof item.seed === "number" ? [item.seed] : [])),
        correlationId,
    };
}

function asImageDataUrl(value: string, format: NovelAIImageFormat) {
    return value.startsWith("data:") ? value : `data:image/${format};base64,${value}`;
}

function mapQualityTags(value: NovelAIQualityTags) {
    if (value === "none") return { enabled: false } as const;
    return { enabled: true, hint: value === "standard" ? 1 : 0 } as const;
}

function mapUCPreset(value: NovelAIUCPreset) {
    const values: Record<NovelAIUCPreset, number> = {
        heavy: 0,
        light: 1,
        furryFocus: 2,
        humanFocus: 3,
        none: 4,
    };
    return values[value];
}

function createCorrelationId() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function randomSeed() {
    return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
}
