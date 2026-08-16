import { isRecord } from "../common/guards";
import { createId } from "../common/ids";
import { normalizeStringList } from "../connections/config-utils";
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

export const defaultStoryString = `{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`;

export type CustomInstructTemplate = {
    id: string;
    name: string;
    userPrefix?: string;
    userSuffix?: string;
    assistantPrefix?: string;
    assistantSuffix?: string;
    systemPrefix?: string;
    systemSuffix?: string;
    storyString?: string;
    storyStringPrefix?: string;
    storyStringSuffix?: string;
    firstInputSequence?: string;
    lastInputSequence?: string;
    firstOutputSequence?: string;
    lastOutputSequence?: string;
    systemSameAsUser?: boolean;
    userAlignmentMessage?: string;
    systemPrompt?: string;
    sequencesAsStopStrings?: boolean;
    namesAsStopStrings?: boolean;
    alwaysAddCharacterName?: boolean;
    singleLineMode?: boolean;
    collapseConsecutiveNewlines?: boolean;
    exampleSeparator?: string;
    chatStartSeparator?: string;
    stopSequences?: string[];
    wrapSequencesWithNewlines?: boolean;
    namesBehavior?: "never" | "force" | "always";
    replaceMacrosInSequences?: boolean;
    skipExamples?: boolean;
    activationRegex?: string;
    overridePresetPromptOrder?: boolean;
    createdAt?: string;
    updatedAt?: string;
};

export function slugifyInstructName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

export function isValidInstructTemplateId(id: string) {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id);
}

export function normalizeCustomInstructTemplate(value: unknown): CustomInstructTemplate {
    const raw = isRecord(value) ? value : {};
    const name =
        typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim()
            : "Custom Instruct";
    const id =
        typeof raw.id === "string" && isValidInstructTemplateId(raw.id.trim())
            ? raw.id.trim()
            : slugifyInstructName(name) || createId("instruct");

    const stopSequences = normalizeStringList(
        raw.stopSequences ?? raw.stop_sequences ?? raw.stop_sequence ?? raw.stop,
    );

    return {
        id,
        name,
        ...(typeof raw.userPrefix === "string" ? { userPrefix: raw.userPrefix } : {}),
        ...(typeof raw.userSuffix === "string" ? { userSuffix: raw.userSuffix } : {}),
        ...(typeof raw.assistantPrefix === "string"
            ? { assistantPrefix: raw.assistantPrefix }
            : {}),
        ...(typeof raw.assistantSuffix === "string"
            ? { assistantSuffix: raw.assistantSuffix }
            : {}),
        ...(typeof raw.systemPrefix === "string"
            ? { systemPrefix: raw.systemPrefix }
            : {}),
        ...(typeof raw.systemSuffix === "string"
            ? { systemSuffix: raw.systemSuffix }
            : {}),
        ...(typeof raw.storyString === "string" ? { storyString: raw.storyString } : {}),
        ...(typeof raw.story_string === "string"
            ? { storyString: raw.story_string }
            : {}),
        ...(typeof raw.storyStringPrefix === "string"
            ? { storyStringPrefix: raw.storyStringPrefix }
            : {}),
        ...(typeof raw.story_string_prefix === "string"
            ? { storyStringPrefix: raw.story_string_prefix }
            : {}),
        ...(typeof raw.storyStringSuffix === "string"
            ? { storyStringSuffix: raw.storyStringSuffix }
            : {}),
        ...(typeof raw.story_string_suffix === "string"
            ? { storyStringSuffix: raw.story_string_suffix }
            : {}),
        ...(typeof raw.systemPrompt === "string"
            ? { systemPrompt: raw.systemPrompt }
            : {}),
        ...(typeof raw.firstInputSequence === "string"
            ? { firstInputSequence: raw.firstInputSequence }
            : {}),
        ...(typeof raw.lastInputSequence === "string"
            ? { lastInputSequence: raw.lastInputSequence }
            : {}),
        ...(typeof raw.firstOutputSequence === "string"
            ? { firstOutputSequence: raw.firstOutputSequence }
            : {}),
        ...(typeof raw.lastOutputSequence === "string"
            ? { lastOutputSequence: raw.lastOutputSequence }
            : {}),
        ...(raw.systemSameAsUser === true ? { systemSameAsUser: true } : {}),
        ...(typeof raw.userAlignmentMessage === "string"
            ? { userAlignmentMessage: raw.userAlignmentMessage }
            : {}),
        ...(raw.sequencesAsStopStrings === true ? { sequencesAsStopStrings: true } : {}),
        ...(typeof raw.namesAsStopStrings === "boolean"
            ? { namesAsStopStrings: raw.namesAsStopStrings }
            : {}),
        ...(typeof raw.collapseConsecutiveNewlines === "boolean"
            ? { collapseConsecutiveNewlines: raw.collapseConsecutiveNewlines }
            : typeof raw.collapse_consecutive_newlines === "boolean"
              ? { collapseConsecutiveNewlines: raw.collapse_consecutive_newlines }
              : typeof raw.collapse_newlines === "boolean"
                ? { collapseConsecutiveNewlines: raw.collapse_newlines }
                : {}),
        ...(raw.alwaysAddCharacterName === true ? { alwaysAddCharacterName: true } : {}),
        ...(raw.singleLineMode === true ? { singleLineMode: true } : {}),
        ...(raw.overridePresetPromptOrder === true
            ? { overridePresetPromptOrder: true }
            : {}),
        ...(raw.wrapSequencesWithNewlines === true || raw.wrap === true
            ? { wrapSequencesWithNewlines: true }
            : {}),
        ...(raw.namesBehavior === "never" ||
        raw.namesBehavior === "force" ||
        raw.namesBehavior === "always"
            ? { namesBehavior: raw.namesBehavior }
            : {}),
        ...(raw.replaceMacrosInSequences === true || raw.macro === true
            ? { replaceMacrosInSequences: true }
            : {}),
        ...(raw.skipExamples === true || raw.skip_examples === true
            ? { skipExamples: true }
            : {}),
        ...(typeof raw.activationRegex === "string" ||
        typeof raw.activation_regex === "string"
            ? { activationRegex: (raw.activationRegex ?? raw.activation_regex) as string }
            : {}),
        ...(typeof raw.exampleSeparator === "string"
            ? { exampleSeparator: raw.exampleSeparator }
            : {}),
        ...(typeof raw.chatStartSeparator === "string"
            ? { chatStartSeparator: raw.chatStartSeparator }
            : {}),
        ...(stopSequences.length ? { stopSequences } : {}),
        ...(typeof raw.createdAt === "string" ? { createdAt: raw.createdAt } : {}),
        ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
    };
}

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
    formatting?: PresetFormattingSettings,
) {
    const resolved = template === "auto" ? detectInstructTemplate(modelName) : template;
    const turns = messages.map((message) => ({
        role: message.role === "developer" ? "system" : message.role,
        content: messageContentToText(message.content),
    }));

    return formatCanonicalInstructPrompt(turns, resolved, formatting);
}

type InstructTurn = { role: string; content: string };

function formatCanonicalInstructPrompt(
    turns: InstructTurn[],
    template: Exclude<InstructTemplateId, "auto">,
    formatting?: PresetFormattingSettings,
) {
    if (template === "mistral") return renderMistral(turns, formatting);
    if (template === "gemma2") return renderGemma(turns, formatting);
    if (template === "alpaca") return renderAlpaca(turns, formatting);
    const prefill =
        template === "chatml"
            ? "<|im_start|>assistant\n"
            : template === "deepseek-r1"
              ? "<\uFF5CAssistant\uFF5C><think>\n"
              : "<|start_header_id|>assistant<|end_header_id|>\n\n";
    return renderNativeTurns(
        turns,
        formatting,
        (turn) => {
            if (template === "chatml")
                return `<|im_start|>${turn.role}\n${turn.content}<|im_end|>`;
            if (template === "deepseek-r1")
                return `<\uFF5C${turn.role === "assistant" ? "Assistant" : turn.role === "system" ? "System" : "User"}\uFF5C>${turn.content}`;
            return `<|start_header_id|>${turn.role}<|end_header_id|>\n\n${turn.content}<|eot_id|>`;
        },
        prefill,
    );
}

function renderNativeTurns(
    turns: InstructTurn[],
    formatting: PresetFormattingSettings | undefined,
    render: (turn: InstructTurn) => string,
    prefill: string,
) {
    const alignment = formatting?.userAlignmentMessage?.trim();
    const aligned =
        turns[0]?.role === "assistant" && alignment
            ? [{ role: "user", content: alignment }, ...turns]
            : turns;
    return joinGenerated([...aligned.map(render), prefill], "\n", formatting);
}

function canonicalTwoRoleTurns(
    turns: InstructTurn[],
    formatting?: PresetFormattingSettings,
) {
    const output: Array<InstructTurn & { system?: string }> = [];
    let pendingSystem: string[] = [];
    const alignment = formatting?.userAlignmentMessage?.trim() ?? "";
    for (const turn of turns) {
        if (turn.role === "system") {
            pendingSystem.push(turn.content);
            continue;
        }
        if (turn.role !== "user" && turn.role !== "assistant") continue;
        const system = pendingSystem.join("\n\n");
        pendingSystem = [];
        if (turn.role === "assistant" && (system || output.length === 0)) {
            output.push({
                role: "user",
                content: [system, alignment].filter(Boolean).join("\n\n"),
            });
        }
        output.push({ ...turn, ...(turn.role === "user" && system ? { system } : {}) });
    }
    if (pendingSystem.length) {
        output.push({
            role: "user",
            content: [...pendingSystem, alignment].filter(Boolean).join("\n\n"),
        });
    }
    return output;
}

function renderMistral(turns: InstructTurn[], formatting?: PresetFormattingSettings) {
    return canonicalTwoRoleTurns(turns, formatting)
        .map((turn) =>
            turn.role === "user"
                ? `[INST] ${turn.system ? `<<SYS>>\n${turn.system}\n<</SYS>>\n\n` : ""}${turn.content} [/INST]`
                : ` ${turn.content}</s>`,
        )
        .join("");
}

function renderGemma(turns: InstructTurn[], formatting?: PresetFormattingSettings) {
    const canonical = canonicalTwoRoleTurns(turns, formatting);
    return joinGenerated(
        [
            ...canonical.map(
                (turn) =>
                    `<start_of_turn>${turn.role === "assistant" ? "model" : "user"}\n${[turn.system, turn.content].filter(Boolean).join("\n\n")}<end_of_turn>`,
            ),
            "<start_of_turn>model\n",
        ],
        "\n",
        formatting,
    );
}

function renderAlpaca(turns: InstructTurn[], formatting?: PresetFormattingSettings) {
    const canonical = canonicalTwoRoleTurns(turns, formatting);
    return joinGenerated(
        [
            ...canonical.map(
                (turn) =>
                    `### ${turn.role === "assistant" ? "Response" : "Instruction"}:\n${[turn.system, turn.content].filter(Boolean).join("\n\n")}`,
            ),
            "### Response:\n",
        ],
        "\n\n",
        formatting,
    );
}

function joinGenerated(
    parts: string[],
    separator: string,
    formatting?: PresetFormattingSettings,
) {
    const output = parts.join(separator);
    return formatting?.collapseConsecutiveNewlines === false
        ? output
        : output.replace(/\n{3,}/g, "\n\n");
}

export function formatCustomInstructPrompt(
    messages: ChatGenerationMessage[],
    formatting: PresetFormattingSettings,
) {
    const rawTurns = messages.map((message) => ({
        role: message.role === "developer" ? "system" : message.role,
        content: messageContentToText(message.content),
        formattingKind: message.formattingKind,
        speakerName: message.speakerName,
        isFirstAssistantInChat: message.isFirstAssistantInChat,
    }));

    const wrap = (sequence: string) =>
        formatting.wrapSequencesWithNewlines && sequence
            ? `\n${formatting.collapseConsecutiveNewlines === false ? sequence : sequence.replace(/^\n+|\n+$/g, "")}\n`
            : sequence;
    const systemPrefix = wrap(formatting.systemPrefix ?? "");
    const systemSuffix = wrap(formatting.systemSuffix ?? "");
    const userPrefix = wrap(formatting.userPrefix ?? "");
    const userSuffix = wrap(formatting.userSuffix ?? "");
    const assistantPrefix = wrap(formatting.assistantPrefix ?? "");
    const assistantSuffix = wrap(formatting.assistantSuffix ?? "");
    const firstInputPrefix = wrap(
        formatting.firstInputSequence ?? formatting.userPrefix ?? "",
    );
    const lastInputPrefix = wrap(
        formatting.lastInputSequence ?? formatting.userPrefix ?? "",
    );
    const firstOutputPrefix = wrap(
        formatting.firstOutputSequence ?? formatting.assistantPrefix ?? "",
    );
    const lastOutputPrefix = wrap(
        formatting.lastOutputSequence ?? formatting.assistantPrefix ?? "",
    );
    const storyPrefix = wrap(
        formatting.storyStringPrefix !== undefined
            ? formatting.storyStringPrefix
            : (formatting.systemPrefix ?? ""),
    );
    const storySuffix = wrap(
        formatting.storyStringSuffix !== undefined
            ? formatting.storyStringSuffix
            : (formatting.systemSuffix ?? ""),
    );
    const userAlignment = formatting.userAlignmentMessage?.trim();
    const sequenceFor = (sequence: string, speakerName?: string) =>
        formatting.replaceMacrosInSequences
            ? sequence.replace(/\{\{\s*name\s*\}\}/gi, speakerName || "System")
            : sequence;

    const chatTurns = rawTurns.filter(
        (turn) => turn.role !== "system" && !turn.formattingKind,
    );
    const userTurnsCount = chatTurns.filter((turn) => turn.role === "user").length;
    let seenUserTurns = 0;
    let seenAssistantTurns = 0;
    const firstConversationTurn = chatTurns[0];
    const needsAlignment = Boolean(
        userAlignment && firstConversationTurn?.role !== "user",
    );
    let output = needsAlignment ? `${firstInputPrefix}${userAlignment}${userSuffix}` : "";

    for (const turn of rawTurns) {
        if (turn.formattingKind === "raw") {
            output += turn.content;
            continue;
        }
        if (turn.formattingKind === "story") {
            output += `${sequenceFor(storyPrefix, turn.speakerName)}${turn.content}${sequenceFor(storySuffix, turn.speakerName)}`;
            continue;
        }
        if (turn.role === "system") {
            const prefix = sequenceFor(
                formatting.systemSameAsUser ? userPrefix : systemPrefix,
                turn.speakerName,
            );
            const suffix = sequenceFor(
                formatting.systemSameAsUser ? userSuffix : systemSuffix,
                turn.speakerName,
            );
            output += `${prefix}${turn.content}${suffix}`;
            continue;
        }
        const isUser = turn.role === "user";

        if (isUser) {
            seenUserTurns++;
            const isFirstUser = seenUserTurns === 1;
            const isLastUser = seenUserTurns === userTurnsCount;
            const prefix = sequenceFor(
                isFirstUser
                    ? firstInputPrefix
                    : isLastUser
                      ? lastInputPrefix
                      : userPrefix,
                turn.speakerName,
            );
            const suffix = sequenceFor(userSuffix, turn.speakerName);

            let text = turn.content;
            if (isFirstUser && userAlignment && !needsAlignment) {
                text = `${userAlignment}\n\n${text}`;
            }

            output += `${prefix}${text}${suffix}`;
        } else {
            seenAssistantTurns++;
            const isFirstAssistant =
                turn.isFirstAssistantInChat ?? seenAssistantTurns === 1;
            const prefix = sequenceFor(
                isFirstAssistant ? firstOutputPrefix : assistantPrefix,
                turn.speakerName,
            );
            const suffix = sequenceFor(assistantSuffix, turn.speakerName);

            output += `${prefix}${turn.content}${suffix}`;
        }
    }

    const lastTurn = rawTurns[rawTurns.length - 1];
    if (lastTurn && lastTurn.role === "user") {
        output += sequenceFor(lastOutputPrefix, lastTurn.speakerName);
    }

    return output;
}

export function parseInstructTemplateJson(value: unknown): {
    formatting: Partial<PresetFormattingSettings>;
    name?: string;
    template: CustomInstructTemplate;
} {
    if (!isRecord(value)) {
        throw new Error("Invalid JSON: Expected an instruct template object.");
    }

    const raw = value;
    const instruct = isRecord(raw.instruct) ? raw.instruct : raw;
    const context = isRecord(raw.context) ? raw.context : raw;
    const preset = isRecord(raw.preset) ? raw.preset : raw;
    const sysprompt = isRecord(raw.sysprompt) ? raw.sysprompt : raw;

    const name =
        asStringOrUndefined(instruct.name) ??
        asStringOrUndefined(context.name) ??
        asStringOrUndefined(sysprompt.name) ??
        asStringOrUndefined(preset.name) ??
        asStringOrUndefined(raw.name);

    const templateName = name ? name.trim() : undefined;
    const template =
        typeof instruct.instruct_template === "string"
            ? instruct.instruct_template
            : typeof raw.instruct_template === "string"
              ? raw.instruct_template
              : undefined;

    const userPrefix =
        asStringOrUndefined(instruct.userPrefix) ??
        asStringOrUndefined(instruct.user_prefix) ??
        asStringOrUndefined(instruct.input_sequence) ??
        asStringOrUndefined(instruct.user_sequence) ??
        asStringOrUndefined(raw.userPrefix) ??
        asStringOrUndefined(raw.user_prefix) ??
        asStringOrUndefined(raw.input_sequence);

    const userSuffix =
        asStringOrUndefined(instruct.userSuffix) ??
        asStringOrUndefined(instruct.user_suffix) ??
        asStringOrUndefined(instruct.input_suffix) ??
        asStringOrUndefined(instruct.user_sequence_suffix) ??
        asStringOrUndefined(raw.userSuffix) ??
        asStringOrUndefined(raw.user_suffix) ??
        asStringOrUndefined(raw.input_suffix) ??
        asStringOrUndefined(raw.user_sequence_suffix);

    const assistantPrefix =
        asStringOrUndefined(instruct.assistantPrefix) ??
        asStringOrUndefined(instruct.assistant_prefix) ??
        asStringOrUndefined(instruct.output_sequence) ??
        asStringOrUndefined(instruct.assistant_sequence) ??
        asStringOrUndefined(raw.assistantPrefix) ??
        asStringOrUndefined(raw.assistant_prefix) ??
        asStringOrUndefined(raw.output_sequence);

    const assistantSuffix =
        asStringOrUndefined(instruct.assistantSuffix) ??
        asStringOrUndefined(instruct.assistant_suffix) ??
        asStringOrUndefined(instruct.output_suffix) ??
        asStringOrUndefined(instruct.assistant_sequence_suffix) ??
        asStringOrUndefined(raw.assistantSuffix) ??
        asStringOrUndefined(raw.assistant_suffix) ??
        asStringOrUndefined(raw.output_suffix) ??
        asStringOrUndefined(raw.assistant_sequence_suffix);

    const systemPrefix =
        asStringOrUndefined(instruct.systemPrefix) ??
        asStringOrUndefined(instruct.system_prefix) ??
        asStringOrUndefined(instruct.system_sequence) ??
        asStringOrUndefined(instruct.system_sequence_prefix) ??
        asStringOrUndefined(raw.systemPrefix) ??
        asStringOrUndefined(raw.system_prefix) ??
        asStringOrUndefined(raw.system_sequence);

    const systemSuffix =
        asStringOrUndefined(instruct.systemSuffix) ??
        asStringOrUndefined(instruct.system_suffix) ??
        asStringOrUndefined(instruct.system_sequence_suffix) ??
        asStringOrUndefined(instruct.system_suffix) ??
        asStringOrUndefined(raw.systemSuffix) ??
        asStringOrUndefined(raw.system_suffix) ??
        asStringOrUndefined(raw.system_sequence_suffix);

    const sequencesAsStopStrings =
        instruct.sequencesAsStopStrings === true ||
        instruct.wrap_sequences === true ||
        instruct.wrap_sequences_as_stop === true ||
        instruct.sequences_as_stop === true ||
        raw.sequencesAsStopStrings === true ||
        raw.wrap_sequences_as_stop === true ||
        raw.sequences_as_stop === true;

    const namesAsStopStrings = firstBoolean(
        instruct.namesAsStopStrings,
        instruct.names_as_stop,
        context.names_as_stop_strings,
        raw.namesAsStopStrings,
        raw.names_as_stop,
    );
    const collapseConsecutiveNewlines = firstBoolean(
        instruct.collapseConsecutiveNewlines,
        instruct.collapse_consecutive_newlines,
        instruct.collapse_newlines,
        raw.collapseConsecutiveNewlines,
        raw.collapse_consecutive_newlines,
        raw.collapse_newlines,
    );

    const alwaysAddCharacterName =
        context.always_force_name2 === true ||
        raw.alwaysAddCharacterName === true ||
        raw.always_force_name2 === true;

    const singleLineMode =
        context.single_line === true ||
        raw.singleLineMode === true ||
        raw.single_line === true;

    const exampleSeparator =
        asStringOrUndefined(context.example_separator) ??
        asStringOrUndefined(raw.exampleSeparator);

    const chatStartSeparator =
        asStringOrUndefined(context.chat_start) ??
        asStringOrUndefined(raw.chatStartSeparator);
    const storyString =
        asStringOrUndefined(context.story_string) ??
        asStringOrUndefined(instruct.story_string) ??
        asStringOrUndefined(raw.story_string) ??
        asStringOrUndefined(context.storyString) ??
        asStringOrUndefined(raw.storyString);
    const storyStringPrefix =
        asStringOrUndefined(instruct.story_string_prefix) ??
        asStringOrUndefined(raw.story_string_prefix) ??
        asStringOrUndefined(instruct.storyStringPrefix) ??
        asStringOrUndefined(raw.storyStringPrefix);
    const storyStringSuffix =
        asStringOrUndefined(instruct.story_string_suffix) ??
        asStringOrUndefined(raw.story_string_suffix) ??
        asStringOrUndefined(instruct.storyStringSuffix) ??
        asStringOrUndefined(raw.storyStringSuffix);
    const systemPrompt =
        asStringOrUndefined(sysprompt.content) ?? asStringOrUndefined(raw.systemPrompt);
    const firstInputSequence =
        asStringOrUndefined(instruct.first_input_sequence) ??
        asStringOrUndefined(instruct.firstInputSequence) ??
        asStringOrUndefined(raw.firstInputSequence) ??
        asStringOrUndefined(raw.first_input_sequence);
    const lastInputSequence =
        asStringOrUndefined(instruct.last_input_sequence) ??
        asStringOrUndefined(instruct.lastInputSequence) ??
        asStringOrUndefined(raw.lastInputSequence) ??
        asStringOrUndefined(raw.last_input_sequence);
    const firstOutputSequence =
        asStringOrUndefined(instruct.first_output_sequence) ??
        asStringOrUndefined(instruct.firstOutputSequence) ??
        asStringOrUndefined(raw.firstOutputSequence) ??
        asStringOrUndefined(raw.first_output_sequence);
    const lastOutputSequence =
        asStringOrUndefined(instruct.last_output_sequence) ??
        asStringOrUndefined(instruct.lastOutputSequence) ??
        asStringOrUndefined(raw.lastOutputSequence) ??
        asStringOrUndefined(raw.last_output_sequence);
    const systemSameAsUser =
        instruct.system_same_as_user === true ||
        instruct.systemSameAsUser === true ||
        raw.system_same_as_user === true ||
        raw.systemSameAsUser === true;
    const userAlignmentMessage =
        asStringOrUndefined(instruct.user_alignment_message) ??
        asStringOrUndefined(instruct.userAlignmentMessage) ??
        asStringOrUndefined(raw.user_alignment_message) ??
        asStringOrUndefined(raw.userAlignmentMessage);
    const overridePresetPromptOrder =
        instruct.overridePresetPromptOrder === true ||
        raw.overridePresetPromptOrder === true ||
        instruct.override_preset_prompt_order === true;
    const namesBehavior =
        instruct.names_behavior === "none" || instruct.names_behavior === "never"
            ? "never"
            : instruct.names_behavior === "always"
              ? "always"
              : instruct.names_behavior === "force"
                ? "force"
                : undefined;
    const replaceMacrosInSequences = instruct.macro === true || raw.macro === true;
    const skipExamples = instruct.skip_examples === true || raw.skip_examples === true;
    const activationRegex =
        asStringOrUndefined(instruct.activation_regex) ??
        asStringOrUndefined(raw.activation_regex);

    const stopSequences = normalizeStringList(
        instruct.stop_sequence ??
            instruct.stop_sequences ??
            instruct.stopSequences ??
            raw.stop_sequence ??
            raw.stop_sequences ??
            raw.stopSequences ??
            raw.stop,
    );

    const hasAnyCustomSequences = Boolean(
        userPrefix ||
        userSuffix ||
        assistantPrefix ||
        assistantSuffix ||
        systemPrefix ||
        systemSuffix ||
        storyString ||
        firstInputSequence ||
        lastInputSequence ||
        firstOutputSequence ||
        lastOutputSequence ||
        userAlignmentMessage,
    );

    const formatting: Partial<PresetFormattingSettings> = {
        instructTemplate: hasAnyCustomSequences
            ? "custom"
            : ((template as PresetFormattingSettings["instructTemplate"]) ?? "custom"),
        ...(userPrefix !== undefined ? { userPrefix } : {}),
        ...(userSuffix !== undefined ? { userSuffix } : {}),
        ...(assistantPrefix !== undefined ? { assistantPrefix } : {}),
        ...(assistantSuffix !== undefined ? { assistantSuffix } : {}),
        ...(systemPrefix !== undefined ? { systemPrefix } : {}),
        ...(systemSuffix !== undefined ? { systemSuffix } : {}),
        ...(storyString !== undefined ? { storyString } : {}),
        ...(storyStringPrefix !== undefined ? { storyStringPrefix } : {}),
        ...(storyStringSuffix !== undefined ? { storyStringSuffix } : {}),
        ...(firstInputSequence !== undefined ? { firstInputSequence } : {}),
        ...(lastInputSequence !== undefined ? { lastInputSequence } : {}),
        ...(firstOutputSequence !== undefined ? { firstOutputSequence } : {}),
        ...(lastOutputSequence !== undefined ? { lastOutputSequence } : {}),
        ...(systemSameAsUser ? { systemSameAsUser: true } : {}),
        ...(userAlignmentMessage !== undefined ? { userAlignmentMessage } : {}),
        ...(overridePresetPromptOrder ? { overridePresetPromptOrder: true } : {}),
        ...(instruct.wrap === true || raw.wrap === true
            ? { wrapSequencesWithNewlines: true }
            : {}),
        ...(stopSequences.length ? { stopSequences } : {}),
        ...(namesBehavior ? { namesBehavior } : {}),
        ...(replaceMacrosInSequences ? { replaceMacrosInSequences: true } : {}),
        ...(skipExamples ? { skipExamples: true } : {}),
        ...(activationRegex !== undefined ? { activationRegex } : {}),
        ...(sequencesAsStopStrings ? { sequencesAsStopStrings: true } : {}),
        ...(namesAsStopStrings !== undefined ? { namesAsStopStrings } : {}),
        ...(collapseConsecutiveNewlines !== undefined
            ? { collapseConsecutiveNewlines }
            : {}),
        ...(alwaysAddCharacterName ? { alwaysAddCharacterName: true } : {}),
        ...(singleLineMode ? { singleLineMode: true } : {}),
        ...(exampleSeparator !== undefined ? { exampleSeparator } : {}),
        ...(chatStartSeparator !== undefined ? { chatStartSeparator } : {}),
        ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    };

    const customTemplate = normalizeCustomInstructTemplate({
        id:
            slugifyInstructName(templateName || "custom-instruct") ||
            createId("instruct"),
        name: templateName || "Custom Instruct",
        ...formatting,
        ...(stopSequences.length ? { stopSequences } : {}),
        ...(storyString !== undefined ? { storyString } : {}),
        ...(storyStringPrefix !== undefined ? { storyStringPrefix } : {}),
        ...(storyStringSuffix !== undefined ? { storyStringSuffix } : {}),
        ...(systemPrompt !== undefined ? { systemPrompt } : {}),
        ...(firstInputSequence !== undefined ? { firstInputSequence } : {}),
        ...(lastInputSequence !== undefined ? { lastInputSequence } : {}),
        ...(firstOutputSequence !== undefined ? { firstOutputSequence } : {}),
        ...(lastOutputSequence !== undefined ? { lastOutputSequence } : {}),
        ...(systemSameAsUser ? { systemSameAsUser } : {}),
        ...(userAlignmentMessage !== undefined ? { userAlignmentMessage } : {}),
        ...(overridePresetPromptOrder ? { overridePresetPromptOrder } : {}),
        ...(namesBehavior ? { namesBehavior } : {}),
        ...(replaceMacrosInSequences ? { replaceMacrosInSequences: true } : {}),
        ...(skipExamples ? { skipExamples: true } : {}),
        ...(activationRegex !== undefined ? { activationRegex } : {}),
    });

    return {
        name: templateName,
        formatting,
        template: customTemplate,
    };
}

function firstBoolean(...values: unknown[]): boolean | undefined {
    return values.find((value): value is boolean => typeof value === "boolean");
}

function asStringOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}
