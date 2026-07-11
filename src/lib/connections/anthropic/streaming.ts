import { readJsonServerSentEvents } from "../streaming";
import type {
    AnthropicContentBlock,
    AnthropicCreateMessageResponse,
    AnthropicStreamEvent,
    AnthropicThinkingBlock,
} from "./types";

export type AnthropicStreamResult = {
    message: string;
    reasoning: string;
    response: AnthropicCreateMessageResponse;
};

export async function readAnthropicStream(
    response: Response,
    onToken: (tokens: { message: string; reasoning: string }) => void,
    signal?: AbortSignal,
): Promise<AnthropicStreamResult> {
    let message = "";
    let reasoning = "";
    const content: AnthropicContentBlock[] = [];
    const toolInputJson = new Map<number, string>();
    const output: AnthropicCreateMessageResponse = {
        content,
    };

    await readJsonServerSentEvents<AnthropicStreamEvent>(
        response,
        (event) => {
            if (event.type === "error") {
                throw new Error(
                    event.error?.message
                        ? `Anthropic stream failed: ${event.error.message}`
                        : "Anthropic stream failed.",
                );
            }

            if (event.type === "message_start" && event.message) {
                output.id = event.message.id;
                output.model = event.message.model;
                output.role = event.message.role;
                output.type = event.message.type;
                output.usage = event.message.usage;
                return;
            }

            if (event.type === "content_block_start" && event.content_block) {
                content[event.index] = event.content_block;
                return;
            }

            if (event.type === "content_block_delta") {
                const delta = event.delta;

                if (delta?.type === "text_delta" && delta.text) {
                    message += delta.text;
                    const current = ensureTextBlock(content, event.index);
                    current.text += delta.text;
                    onToken({ message: delta.text, reasoning: "" });
                    return;
                }

                if (delta?.type === "thinking_delta" && delta.thinking) {
                    reasoning += delta.thinking;
                    const current = ensureThinkingBlock(content, event.index);
                    current.thinking = `${current.thinking ?? ""}${delta.thinking}`;
                    onToken({ message: "", reasoning: delta.thinking });
                    return;
                }

                if (delta?.type === "signature_delta" && delta.signature) {
                    const current = ensureThinkingBlock(content, event.index);
                    current.signature = delta.signature;
                }

                if (delta?.type === "input_json_delta" && delta.partial_json) {
                    const current = ensureToolUseBlock(content, event.index);
                    const nextJson =
                        (toolInputJson.get(event.index) ?? "") + delta.partial_json;
                    toolInputJson.set(event.index, nextJson);
                    current.input = parsePartialToolInput(nextJson);
                    return;
                }

                return;
            }

            if (event.type === "message_delta") {
                output.stop_reason = event.delta?.stop_reason;
                output.stop_sequence = event.delta?.stop_sequence;
                output.usage = {
                    ...(output.usage ?? {}),
                    ...(event.usage ?? {}),
                };
            }
        },
        signal,
    );

    output.content = content.filter(Boolean);

    return {
        message,
        reasoning,
        response: output,
    };
}

function ensureTextBlock(content: AnthropicContentBlock[], index: number) {
    const current = content[index];

    if (current?.type === "text") {
        return current;
    }

    const next = { type: "text" as const, text: "" };
    content[index] = next;
    return next;
}

function ensureThinkingBlock(content: AnthropicContentBlock[], index: number) {
    const current = content[index];

    if (current?.type === "thinking") {
        return current;
    }

    const next: AnthropicThinkingBlock = { type: "thinking", thinking: "" };
    content[index] = next;
    return next;
}

function ensureToolUseBlock(content: AnthropicContentBlock[], index: number) {
    const current = content[index];

    if (current?.type === "tool_use") {
        return current;
    }

    const next: AnthropicContentBlock = {
        type: "tool_use",
        id: `tool-call-${index + 1}`,
        name: "",
        input: {},
    };
    content[index] = next;
    return next;
}

function parsePartialToolInput(value: string) {
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
}
