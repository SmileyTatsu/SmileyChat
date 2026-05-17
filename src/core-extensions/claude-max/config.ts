import { isRecord } from "#frontend/lib/common/guards";

import { claudeMaxModels } from "./models";
import type { ClaudeMaxConfig, ClaudeMaxThinkingMode } from "./types";

export const defaultClaudeMaxConfig: ClaudeMaxConfig = {
    model: {
        source: "default",
        id: claudeMaxModels[0]?.id ?? "claude-opus-4-7",
    },
    thinking: "adaptive",
    fastMode: false,
};

export function normalizeClaudeMaxConfig(value: unknown): ClaudeMaxConfig {
    const raw = isRecord(value) ? value : {};
    const model = isRecord(raw.model) ? raw.model : {};
    const source = model.source === "custom" ? "custom" : "default";
    const id =
        typeof model.id === "string" && model.id.trim()
            ? model.id.trim()
            : defaultClaudeMaxConfig.model.id;

    return {
        model: { source, id },
        thinking: normalizeThinkingMode(raw.thinking),
        fastMode: typeof raw.fastMode === "boolean" ? raw.fastMode : false,
    };
}

function normalizeThinkingMode(value: unknown): ClaudeMaxThinkingMode {
    return value === "off" ? "off" : "adaptive";
}
