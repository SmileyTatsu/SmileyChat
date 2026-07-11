import { MessageRole } from "#frontend/types";

import {
    chatCompletionTools,
    createChatCompletionMessages,
    normalizeChatCompletionResponse,
} from "../chat-completions";
import { stopSequencesForGeneration } from "../generation-settings";
import { defaultOutputTokenLimit } from "../output-tokens";
import { ChatGenerationMessageRole } from "../types";
import type { ChatGenerationRequest, ChatGenerationResult } from "../types";
import type {
    XAIChatCompletionRequest,
    XAIChatCompletionResponse,
    XAIConnectionConfig,
    XAIReasoningConfig,
    XAIResponsesRequest,
    XAIResponsesResponse,
} from "./types";

export function createXAIChatCompletionBody(
    request: ChatGenerationRequest,
    config: XAIConnectionConfig,
): XAIChatCompletionRequest {
    const messages = createChatCompletionMessages(request, {
        includeReasoningHistory: true,
        mapPromptRole: (role) =>
            role === ChatGenerationMessageRole.Developer
                ? ChatGenerationMessageRole.System
                : role,
        mapHistoryRole: (message) =>
            message.role === MessageRole.User
                ? ChatGenerationMessageRole.User
                : ChatGenerationMessageRole.Assistant,
    });
    const reasoning = cleanXAIReasoningConfig(config.reasoning);
    const generation = request.generation;

    return {
        model: config.model.id,
        messages,
        max_completion_tokens: config.maxCompletionTokens ?? defaultOutputTokenLimit,
        ...(typeof generation?.temperature === "number"
            ? { temperature: generation.temperature }
            : {}),
        ...(typeof generation?.topP === "number" ? { top_p: generation.topP } : {}),
        ...(typeof generation?.seed === "number" ? { seed: generation.seed } : {}),
        ...(!reasoning && typeof generation?.presencePenalty === "number"
            ? { presence_penalty: generation.presencePenalty }
            : {}),
        ...(!reasoning && typeof generation?.frequencyPenalty === "number"
            ? { frequency_penalty: generation.frequencyPenalty }
            : {}),
        ...(!reasoning && stopSequencesForGeneration(generation)
            ? { stop: stopSequencesForGeneration(generation) }
            : {}),
        ...(reasoning?.effort ? { reasoning_effort: reasoning.effort } : {}),
        ...(chatCompletionTools(request.tools)
            ? { tools: chatCompletionTools(request.tools) }
            : {}),
        stream: request.stream === true,
    };
}

export function normalizeXAIChatCompletion(
    response: XAIChatCompletionResponse,
): ChatGenerationResult {
    return normalizeChatCompletionResponse(response, {
        provider: "xai",
        emptyMessage: "xAI response did not include message content.",
    });
}

export function createXAIResponsesBody(
    request: ChatGenerationRequest,
    config: XAIConnectionConfig,
): XAIResponsesRequest {
    const generation = request.generation;
    const reasoning = cleanXAIReasoningConfig(config.reasoning);
    const input = (request.promptMessages ?? []).map((message) => ({
        role:
            message.role === ChatGenerationMessageRole.Assistant
                ? ("assistant" as const)
                : message.role === ChatGenerationMessageRole.System
                  ? ("system" as const)
                  : ("user" as const),
        content:
            typeof message.content === "string"
                ? [{ type: "input_text" as const, text: message.content }]
                : message.content.flatMap<
                      XAIResponsesRequest["input"][number]["content"][number]
                  >((part) => {
                      if (part.type === "text") {
                          return [{ type: "input_text" as const, text: part.text }];
                      }

                      if (part.type === "file") {
                          const fileUrl = isHttpUrl(part.file.url)
                              ? part.file.url
                              : undefined;
                          const fileId =
                              part.file.url && !fileUrl ? part.file.url : undefined;

                          return [
                              {
                                  type: "input_file" as const,
                                  ...(fileId ? { file_id: fileId } : {}),
                                  ...(fileUrl ? { file_url: fileUrl } : {}),
                                  ...(part.file.file_data
                                      ? { file_data: part.file.file_data }
                                      : {}),
                                  ...(part.file.filename
                                      ? { filename: part.file.filename }
                                      : {}),
                              },
                          ];
                      }

                      return [
                          {
                              type: "input_image" as const,
                              image_url: part.image_url.url,
                          },
                      ];
                  }),
    }));

    return {
        model: config.model.id,
        input,
        max_output_tokens: config.maxCompletionTokens ?? defaultOutputTokenLimit,
        ...(typeof generation?.temperature === "number"
            ? { temperature: generation.temperature }
            : {}),
        ...(typeof generation?.topP === "number" ? { top_p: generation.topP } : {}),
        ...(reasoning?.effort ? { reasoning: { effort: reasoning.effort } } : {}),
        stream: request.stream === true,
    };
}

function isHttpUrl(value: string | undefined) {
    return Boolean(value && /^https?:\/\//i.test(value));
}

export function normalizeXAIResponsesResponse(
    response: XAIResponsesResponse,
): ChatGenerationResult {
    const message =
        response.output_text?.trim() ||
        response.output
            ?.flatMap((item) => item.content ?? [])
            .map((item) => item.text ?? "")
            .join("")
            .trim() ||
        "";
    const reasoning = response.output
        ?.filter((item) => item.type === "reasoning")
        .flatMap((item) => item.summary ?? [])
        .map((item) => item.text ?? "")
        .join("")
        .trim();

    if (!message) {
        throw new Error("xAI response did not include message content.");
    }

    return {
        message,
        provider: "xai",
        model: response.model,
        ...(reasoning ? { reasoning } : {}),
        raw: response,
    };
}

export function cleanXAIReasoningConfig(
    reasoning: XAIReasoningConfig | undefined,
): Extract<XAIReasoningConfig, { enabled: true }> | undefined {
    if (!reasoning?.enabled) {
        return undefined;
    }

    if (
        reasoning.effort !== undefined &&
        reasoning.effort !== "low" &&
        reasoning.effort !== "medium" &&
        reasoning.effort !== "high"
    ) {
        return { enabled: true };
    }

    return {
        enabled: true,
        ...(reasoning.effort ? { effort: reasoning.effort } : {}),
    };
}
