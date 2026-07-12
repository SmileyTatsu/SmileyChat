import { expect, test } from "bun:test";

import { readServerGenerationStream } from "./server-adapter";

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
