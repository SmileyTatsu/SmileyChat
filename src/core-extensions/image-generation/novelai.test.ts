import { afterEach, describe, expect, test } from "bun:test";

import {
    createConnectionProfile,
    type NovelAIConnectionProfile,
} from "#frontend/lib/connections/config";

import { generateNovelAIImages } from "./novelai";
import { defaultImageGenerationSettings } from "./settings";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("NovelAI image generation", () => {
    test("sends the documented JSON request and normalizes base64 images", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            requests.push(new Request(input, init));
            return Response.json(
                { images: [{ image: "aGVsbG8=", index: 0, seed: 42 }] },
                { status: 201 },
            );
        }) as typeof fetch;
        const profile = createConnectionProfile("novelai") as NovelAIConnectionProfile;
        if (profile.provider !== "novelai") throw new Error("bad test profile");
        profile.config.apiKey = "secret-token";

        const result = await generateNovelAIImages(
            profile,
            defaultImageGenerationSettings,
            "fixed, subject, quality",
        );
        const request = requests[0];
        const body = (await request.json()) as Record<string, unknown>;

        expect(request.url).toBe("https://image.novelai.net/ai/generate-image");
        expect(request.headers.get("authorization")).toBe("Bearer secret-token");
        expect(request.headers.get("accept")).toBe("application/json");
        expect(request.headers.get("x-correlation-id")).toMatch(/^[A-Za-z0-9]{6}$/);
        expect(body.action).toBe("generate");
        expect(body.input).toBe("fixed, subject, quality");
        expect(body.model).toBe("nai-diffusion-5-full");
        expect(body.parameters).toMatchObject({
            params_version: 4,
            prompt: "fixed, subject, quality",
            sampler: "k_euler_ancestral",
            image_format: "png",
            qualityToggle: true,
            tag_hint_qt: 1,
            ucPreset: 0,
            tag_hint_uc_preset: 0,
        });
        expect(result.images).toEqual(["data:image/png;base64,aGVsbG8="]);
        expect(result.seeds).toEqual([42]);
    });

    test("uses WebP MIME and enforces only-free request limits", async () => {
        let request: Request | undefined;
        globalThis.fetch = (async (input, init) => {
            request = new Request(input, init);
            return Response.json({ images: [{ image: "aGVsbG8=" }] });
        }) as typeof fetch;
        const profile = createConnectionProfile("novelai") as NovelAIConnectionProfile;
        if (profile.provider !== "novelai") throw new Error("bad test profile");
        profile.config.apiKey = "secret-token";

        const result = await generateNovelAIImages(
            profile,
            {
                ...defaultImageGenerationSettings,
                width: 1536,
                height: 1024,
                steps: 50,
                imageCount: 4,
                imageFormat: "webp",
                qualityTags: "none",
                ucPreset: "humanFocus",
                onlyFree: true,
            },
            "subject",
        );
        if (!request) throw new Error("missing request");
        const body = (await request.json()) as {
            parameters: Record<string, unknown>;
        };

        expect(body.parameters.width as number).toBeLessThanOrEqual(1536);
        expect(
            (body.parameters.width as number) * (body.parameters.height as number),
        ).toBeLessThanOrEqual(1024 * 1024);
        expect(body.parameters).toMatchObject({
            steps: 28,
            n_samples: 1,
            image_format: "webp",
            qualityToggle: false,
            ucPreset: 3,
            tag_hint_uc_preset: 3,
        });
        expect(body.parameters).not.toHaveProperty("tag_hint_qt");
        expect(result.images).toEqual(["data:image/webp;base64,aGVsbG8="]);
    });

    test("does not make a request without a token", async () => {
        const profile = createConnectionProfile("novelai") as NovelAIConnectionProfile;
        if (profile.provider !== "novelai") throw new Error("bad test profile");
        await expect(
            generateNovelAIImages(profile, defaultImageGenerationSettings, "subject"),
        ).rejects.toThrow("does not have an API token");
    });
});
