import { afterEach, describe, expect, test } from "bun:test";
import {
    createKoboldCPPBody,
    createKoboldCPPConnection,
    createKoboldCPPGenerateUrl,
    createKoboldCPPVersionUrl,
} from "./adapter";

const originalFetch = globalThis.fetch;
const config = {
    apiKey: "secret",
    baseUrl: "http://127.0.0.1:5001",
    maxOutputTokens: 120,
    contextTokenBudget: 32768,
    model: { source: "loaded" as const, id: "Llama-3.1.gguf" },
    instructTemplate: "auto" as const,
};

describe("KoboldCPP connection adapter", () => {
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test("builds native prompt payloads with template stops and local sampler settings", () => {
        const payload = createKoboldCPPBody(
            {
                messages: [],
                promptMessages: [{ role: "user", content: "Hello" }],
                generation: {
                    minP: 0.1,
                    dryMultiplier: 0.8,
                    xtcProbability: 0.5,
                    mirostatMode: 2,
                    repetitionPenaltyRange: 2048,
                    samplerOrder: [6, 0],
                    stopSequences: ["STOP"],
                },
            },
            config,
        );
        expect(payload).toMatchObject({
            max_context_length: 32768,
            trim_stop: true,
            quiet: true,
            min_p: 0.1,
            dry_multiplier: 0.8,
            xtc_probability: 0.5,
            mirostat: 2,
            rep_pen_range: 2048,
            sampler_order: [6, 0],
        });
        expect(payload.stop_sequence).toEqual(
            expect.arrayContaining(["STOP", "<|eot_id|>"]),
        );
    });

    test("streams tokens", async () => {
        globalThis.fetch = (async () =>
            new Response('data: {"token":"Hello"}\n\ndata: {"token":" there"}\n\n', {
                status: 200,
            })) as unknown as typeof fetch;
        const result = await createKoboldCPPConnection(config).generate({
            messages: [],
            promptMessages: [{ role: "user", content: "Hi" }],
            stream: true,
        });
        expect(result.message).toBe("Hello there");
        expect(createKoboldCPPGenerateUrl(config, true)).toBe(
            "http://127.0.0.1:5001/api/extra/generate/stream",
        );
        expect(createKoboldCPPVersionUrl(config)).toBe(
            "http://127.0.0.1:5001/api/extra/version",
        );
    });

    test("authenticates the abort request", async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        globalThis.fetch = (async (url, init) => {
            calls.push({ url: String(url), init });
            if (String(url).endsWith("/abort"))
                return new Response(null, { status: 200 });
            return new Promise<Response>(() => {});
        }) as typeof fetch;
        const controller = new AbortController();
        const adapter = createKoboldCPPConnection(config);
        void adapter.generate({
            messages: [],
            promptMessages: [{ role: "user", content: "Hi" }],
            signal: controller.signal,
        });
        controller.abort();
        await Promise.resolve();
        expect(
            calls.find((call) => call.url.endsWith("/abort"))?.init?.headers,
        ).toMatchObject({ Authorization: "Bearer secret" });
    });
});
