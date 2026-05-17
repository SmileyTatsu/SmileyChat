import type { ClaudeMaxModel } from "./types";

export const claudeMaxModels: ClaudeMaxModel[] = [
    { id: "claude-opus-4-7", label: "Claude Opus 4.7", context: 1_000_000, maxOutput: 128_000 },
    { id: "claude-opus-4-6", label: "Claude Opus 4.6", context: 1_000_000, maxOutput: 32_000 },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", context: 1_000_000, maxOutput: 32_000 },
    { id: "claude-opus-4-5", label: "Claude Opus 4.5", context: 1_000_000, maxOutput: 32_000 },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", context: 1_000_000, maxOutput: 16_000 },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", context: 200_000, maxOutput: 8_192 },
];

const opusFourSevenPlus = /^claude-opus-4-(?:[7-9]|\d{2,})/;

export function modelSupportsAdaptiveThinking(modelId: string) {
    return opusFourSevenPlus.test(modelId);
}

export function findClaudeMaxModel(modelId: string) {
    return claudeMaxModels.find((model) => model.id === modelId);
}
