import { expect, test } from "bun:test";

import { readServerGenerationResult, readServerGenerationStream } from "./server-adapter";

test("reads CRLF-framed server generation events", async () => {
    const tokens: string[] = [];
    const result = await readServerGenerationStream(
        new Response(
            'event: token\r\ndata: {"token":"Hello "}\r\n\r\nevent: done\r\ndata: {"message":"Hello","provider":"openai-compatible"}\r\n\r\n',
        ),
        { messages: [], onToken: (token) => tokens.push(token) },
    );

    expect(tokens).toEqual(["Hello "]);
    expect(result).toMatchObject({ message: "Hello", provider: "openai-compatible" });
});

test("reads a terminal event without a trailing blank line", async () => {
    const result = await readServerGenerationStream(
        new Response('event: done\ndata: {"message":"Complete","provider":"anthropic"}'),
        { messages: [] },
    );

    expect(result).toMatchObject({ message: "Complete", provider: "anthropic" });
});

test("uses received tokens when a stream ends without a terminal event", async () => {
    const tokens: string[] = [];
    const result = await readServerGenerationStream(
        new Response('event: token\ndata: {"token":"Partial"}'),
        { messages: [], onToken: (token) => tokens.push(token) },
    );

    expect(tokens).toEqual(["Partial"]);
    expect(result).toMatchObject({
        message: "Partial",
        provider: "smileychat-server",
    });
});

test("ignores SSE comment/heartbeat lines before real events", async () => {
    const tokens: string[] = [];
    const result = await readServerGenerationStream(
        new Response(
            ': open\n\n: ping\n\nevent: token\ndata: {"token":"Hi"}\n\n: ping\n\nevent: done\ndata: {"message":"Hi","provider":"openai-compatible"}\n\n',
        ),
        { messages: [], onToken: (token) => tokens.push(token) },
    );

    expect(tokens).toEqual(["Hi"]);
    expect(result).toMatchObject({ message: "Hi", provider: "openai-compatible" });
});

test("treats a comment-only stream as empty", async () => {
    await expect(
        readServerGenerationStream(new Response(": open\n\n: ping\n\n"), {
            messages: [],
        }),
    ).rejects.toThrow("no SSE events received");
});

test("reports an empty SSE response clearly", async () => {
    await expect(
        readServerGenerationStream(new Response(""), { messages: [] }),
    ).rejects.toThrow("no SSE events received");
});

test("reads a completed non-stream generation JSON response", async () => {
    const result = await readServerGenerationResult(
        Response.json({
            result: {
                message: "Complete",
                provider: "openai-compatible",
            },
        }),
    );

    expect(result).toMatchObject({
        message: "Complete",
        provider: "openai-compatible",
    });
});

test("surfaces a non-stream generation error response", async () => {
    await expect(
        readServerGenerationResult(Response.json({ error: "Provider unavailable" })),
    ).rejects.toThrow("Provider unavailable");
});
