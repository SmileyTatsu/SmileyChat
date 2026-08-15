import { isRecord } from "../common/guards";
import { messageContentToText } from "../connections/images";
import type { ChatGenerationMessage } from "../connections/types";
import type { PresetFormattingSettings } from "../presets/types";

export type InstructTemplateId =
    | "auto"
    | "llama3"
    | "chatml"
    | "mistral"
    | "gemma2"
    | "alpaca"
    | "deepseek-r1";

export const instructTemplateLabels: Record<InstructTemplateId, string> = {
    auto: "Auto-detect from model",
    llama3: "Llama 3",
    chatml: "ChatML / Qwen",
    mistral: "Mistral",
    gemma2: "Gemma 2",
    alpaca: "Alpaca",
    "deepseek-r1": "DeepSeek-R1",
};
export const instructTemplateStopSequences: Record<
    Exclude<InstructTemplateId, "auto">,
    string[]
> = {
    llama3: ["<|eot_id|>", "<|start_header_id|>", "<|end_of_text|>"],
    chatml: ["<|im_end|>", "<|im_start|>"],
    mistral: ["</s>", "[INST]"],
    gemma2: ["<end_of_turn>"],
    alpaca: ["### Instruction:"],
    "deepseek-r1": ["<｜end_of_sentence｜>", "<｜User｜>"],
};

export function getInstructTemplateStopSequences(
    template: InstructTemplateId,
    modelName = "",
) {
    return instructTemplateStopSequences[
        template === "auto" ? detectInstructTemplate(modelName) : template
    ];
}

export function detectInstructTemplate(
    modelName: string,
): Exclude<InstructTemplateId, "auto"> {
    const model = modelName.toLowerCase();
    if (model.includes("deepseek-r1") || model.includes("deepseek_r1"))
        return "deepseek-r1";
    if (model.includes("gemma")) return "gemma2";
    if (model.includes("mistral") || model.includes("mixtral")) return "mistral";
    if (
        model.includes("qwen") ||
        model.includes("chatml") ||
        model.includes("yi") ||
        model.includes("command-r") ||
        model.includes("phi-3") ||
        model.includes("phi-4")
    )
        return "chatml";
    if (model.includes("alpaca")) return "alpaca";
    return "llama3";
}

export function formatInstructPrompt(
    messages: ChatGenerationMessage[],
    template: InstructTemplateId,
    modelName = "",
) {
    const resolved = template === "auto" ? detectInstructTemplate(modelName) : template;
    const turns = messages.map((message) => ({
        role: message.role === "developer" ? "system" : message.role,
        content: messageContentToText(message.content),
    }));

    if (resolved === "chatml") {
        return `${turns.map((turn) => `<|im_start|>${turn.role}\n${turn.content}<|im_end|>`).join("\n")}\n<|im_start|>assistant\n`;
    }
    if (resolved === "mistral") {
        const system = turns
            .filter((turn) => turn.role === "system")
            .map((turn) => turn.content)
            .join("\n\n");
        const chat = turns.filter((turn) => turn.role !== "system");
        if (chat.length === 0) {
            return `<s>[INST] <<SYS>>\n${system}\n<</SYS>>\n\n [/INST]`;
        }
        return chat
            .map((turn, index) =>
                turn.role === "user"
                    ? `<s>[INST] ${index === 0 && system ? `<<SYS>>\n${system}\n<</SYS>>\n\n` : ""}${turn.content} [/INST]`
                    : ` ${turn.content}</s>`,
            )
            .join("");
    }
    if (resolved === "gemma2") {
        return `${turns.map((turn) => `<start_of_turn>${turn.role === "assistant" ? "model" : turn.role}\n${turn.content}<end_of_turn>`).join("\n")}\n<start_of_turn>model\n`;
    }
    if (resolved === "alpaca") {
        return `${turns.map((turn) => `### ${turn.role === "assistant" ? "Response" : turn.role === "system" ? "System" : "Instruction"}:\n${turn.content}`).join("\n\n")}\n\n### Response:\n`;
    }
    if (resolved === "deepseek-r1") {
        return `${turns.map((turn) => `<｜${turn.role === "assistant" ? "Assistant" : turn.role === "system" ? "System" : "User"}｜>${turn.content}`).join("\n")}\n<｜Assistant｜><think>\n`;
    }
    return `${turns.map((turn) => `<|start_header_id|>${turn.role}<|end_header_id|>\n\n${turn.content}<|eot_id|>`).join("\n")}\n<|start_header_id|>assistant<|end_header_id|>\n\n`;
}

export function formatCustomInstructPrompt(
    messages: ChatGenerationMessage[],
    formatting: PresetFormattingSettings,
) {
    const sequenceFor = (role: ChatGenerationMessage["role"]) => {
        if (role === "assistant")
            return [formatting.assistantPrefix ?? "", formatting.assistantSuffix ?? ""];
        if (role === "system" || role === "developer")
            return [formatting.systemPrefix ?? "", formatting.systemSuffix ?? ""];
        return [formatting.userPrefix ?? "", formatting.userSuffix ?? ""];
    };
    const output = messages.map((message) => {
        const [prefix, suffix] = sequenceFor(message.role);
        return `${prefix}${messageContentToText(message.content)}${suffix}`;
    });
    return `${output.join("\n")}${formatting.assistantPrefix ?? ""}`;
}

export function parseInstructTemplateJson(value: unknown): {
    formatting: Partial<PresetFormattingSettings>;
    name?: string;
} {
    if (!isRecord(value)) {
        throw new Error("Invalid JSON: Expected an instruct template object.");
    }

    const name = typeof value.name === "string" ? value.name.trim() : undefined;
    const template =
        typeof value.instruct_template === "string" ? value.instruct_template : undefined;

    const userPrefix =
        asStringOrUndefined(value.userPrefix) ??
        asStringOrUndefined(value.user_prefix) ??
        asStringOrUndefined(value.input_sequence);

    const userSuffix =
        asStringOrUndefined(value.userSuffix) ??
        asStringOrUndefined(value.user_suffix) ??
        asStringOrUndefined(value.user_sequence_suffix);

    const assistantPrefix =
        asStringOrUndefined(value.assistantPrefix) ??
        asStringOrUndefined(value.assistant_prefix) ??
        asStringOrUndefined(value.output_sequence);

    const assistantSuffix =
        asStringOrUndefined(value.assistantSuffix) ??
        asStringOrUndefined(value.assistant_suffix) ??
        asStringOrUndefined(value.assistant_sequence_suffix);

    const systemPrefix =
        asStringOrUndefined(value.systemPrefix) ??
        asStringOrUndefined(value.system_prefix) ??
        asStringOrUndefined(value.system_sequence);

    const systemSuffix =
        asStringOrUndefined(value.systemSuffix) ??
        asStringOrUndefined(value.system_suffix) ??
        asStringOrUndefined(value.system_sequence_suffix);

    const sequencesAsStopStrings =
        value.sequencesAsStopStrings === true ||
        value.sequences_as_stop === true ||
        value.wrap_sequences_as_stop === true ||
        value.wrap_sequences === true;

    const hasAnyCustomSequences = Boolean(
        userPrefix ||
        userSuffix ||
        assistantPrefix ||
        assistantSuffix ||
        systemPrefix ||
        systemSuffix,
    );

    return {
        name,
        formatting: {
            instructTemplate: hasAnyCustomSequences
                ? "custom"
                : ((template as PresetFormattingSettings["instructTemplate"]) ??
                  "custom"),
            ...(userPrefix !== undefined ? { userPrefix } : {}),
            ...(userSuffix !== undefined ? { userSuffix } : {}),
            ...(assistantPrefix !== undefined ? { assistantPrefix } : {}),
            ...(assistantSuffix !== undefined ? { assistantSuffix } : {}),
            ...(systemPrefix !== undefined ? { systemPrefix } : {}),
            ...(systemSuffix !== undefined ? { systemSuffix } : {}),
            ...(sequencesAsStopStrings ? { sequencesAsStopStrings: true } : {}),
        },
    };
}

function asStringOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}
