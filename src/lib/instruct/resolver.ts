import { loadInstructTemplates } from "../api/client";
import type { PresetFormattingSettings } from "../presets/types";
import type { CustomInstructTemplate } from "./index";

export type InstructTemplateResolution = {
    formatting: PresetFormattingSettings;
    template?: Pick<CustomInstructTemplate, "id" | "name">;
    reason: "manual" | "activation-regex" | "auto-fallback";
};

const builtinActivationRegexes: Record<string, string> = {
    adventure: "adventure",
    "alpaca-single-turn": "alpaca.*single",
    alpaca: "alpaca(?!.*single)",
    "chatml-names": "(?:chatml|qwen).*(?:^|[-_. ])names?(?:[-_. ]|$)",
    chatml: "(?:chatml|qwen)(?!.*(?:^|[-_. ])names?(?:[-_. ]|$))",
    "mistral-v7-tekken":
        "(?=.*(?:^|[-_. ])v7(?:[-_. ]|$))(?=.*tekken)(?:mistral|mixtral)",
    "mistral-v3-tekken":
        "(?=.*(?:^|[-_. ])v(?:0[._-]?3|3)(?:[-_. ]|$))(?=.*tekken)(?:mistral|mixtral)",
    "mistral-v2-v3":
        "(?:mistral|mixtral).*(?:^|[-_. ])v(?:0[._-]?[23]|[23])(?:[-_. ]|$)(?!.*tekken)",
    "mistral-v1":
        "(?:mistral|mixtral).*(?:^|[-_. ])v(?:0[._-]?1|1)(?:[-_. ]|$)(?!.*tekken)",
    "mistral-v7": "(?:mistral|mixtral).*(?:^|[-_. ])v7(?:[-_. ]|$)(?!.*tekken)",
    "command-r": "command[-_ ]?r",
    dots1: "dots[-_ ]?1",
    "llama-4-instruct": "llama[-_ ]?4",
    "llama-3-instruct-names": "llama[-_ ]?3.*(?:^|[-_. ])names?(?:[-_. ]|$)",
    "llama-3-instruct": "llama[-_ ]?3(?!.*(?:^|[-_. ])names?(?:[-_. ]|$))",
    "llama-2-chat": "llama[-_ ]?2",
    "gemma-4": "gemma[-_ ]?4",
    "gemma-2": "gemma[-_ ]?2",
    "deepseek-v2-5": "deepseek.*(?:^|[-_. ])v?2[._-]5(?:[-_. ]|$)",
    "glm-4": "glm[-_ ]?4",
    koala: "koala",
    koboldai: "koboldai",
    "libra-32b": "libra[-_ ]?32b",
    "lightning-1-1": "lightning[-_ ]?1[._-]?1",
    metharme: "metharme",
    "moonshot-ai": "moonshot|kimi",
    "openai-harmony-thinking": "(?=.*harmony)(?=.*thinking)",
    "openai-harmony": "harmony(?!.*thinking)",
    "openorca-openchat": "(?:openorca|openchat)",
    phi: "(?:^|[-_/ ])phi[- ]?\\d",
    "simple-proxy-for-tavern": "simple.*proxy.*tavern",
    story: "(?:story|continuation)",
    synthia: "synthia",
    tulu: "tulu",
    "vicuna-1-0": "vicuna.*1[._-]?0",
    "vicuna-1-1": "vicuna.*1[._-]?1",
    wizardlm: "wizardlm(?!.*13b)",
    "wizardlm-13b": "wizardlm.*13b",
};

const builtinActivationPriorities: Record<string, number> = {
    "mistral-v7-tekken": 300,
    "mistral-v3-tekken": 300,
    "openai-harmony-thinking": 280,
    "openai-harmony": 260,
    "llama-3-instruct-names": 220,
    "chatml-names": 220,
    "mistral-v7": 200,
    "mistral-v2-v3": 200,
    "mistral-v1": 200,
    "deepseek-v2-5": 200,
};

let customTemplateLibrary: Promise<CustomInstructTemplate[]> | undefined;

export function getCustomInstructTemplateLibrary() {
    customTemplateLibrary ??= loadInstructTemplates()
        .then((result) => result.templates ?? [])
        .catch(() => []);
    return customTemplateLibrary;
}

export function setCustomInstructTemplateLibrary(templates: CustomInstructTemplate[]) {
    customTemplateLibrary = Promise.resolve(templates);
}

/** Adds bundled activation metadata so cloned/exported built-ins remain portable. */
export function withBuiltinActivationMetadata(template: CustomInstructTemplate) {
    const activationRegex =
        template.activationRegex ?? builtinActivationRegexes[template.id];
    return {
        ...template,
        ...(activationRegex ? { activationRegex } : {}),
    };
}

export function resolveInstructTemplate({
    activeTemplateId,
    formatting,
    presetFormatting,
    modelId,
    builtInTemplates = [],
    customTemplates = [],
}: {
    activeTemplateId?: string;
    /** Global Formatting settings, including a manually selected template. */
    formatting: PresetFormattingSettings;
    /** Explicit active-preset overrides, which must win over template defaults. */
    presetFormatting?: PresetFormattingSettings;
    modelId?: string;
    builtInTemplates?: CustomInstructTemplate[];
    customTemplates?: CustomInstructTemplate[];
}): InstructTemplateResolution {
    const allTemplates = [...builtInTemplates, ...customTemplates].map(
        withBuiltinActivationMetadata,
    );
    const manualId = activeTemplateId?.startsWith("builtin:")
        ? activeTemplateId.slice(8)
        : activeTemplateId?.startsWith("custom:")
          ? activeTemplateId.slice(7)
          : activeTemplateId?.trim() || undefined;

    if (manualId && manualId !== "auto" && manualId !== "none") {
        const manual = allTemplates.find((template) => template.id === manualId);
        if (manual) return fromTemplate(manual, formatting, presetFormatting, "manual");
    }

    if (manualId === "auto") {
        const match = templateForModel(allTemplates, modelId ?? "");
        if (match)
            return fromTemplate(match, formatting, presetFormatting, "activation-regex");
    }

    return {
        formatting: { ...formatting, ...presetFormatting },
        reason: "auto-fallback",
    };
}

export async function resolveActiveInstructTemplate(
    input: Omit<Parameters<typeof resolveInstructTemplate>[0], "builtInTemplates">,
) {
    const { default: builtInTemplates } =
        await import("#frontend/data/default-instruct-templates");
    return resolveInstructTemplate({ ...input, builtInTemplates });
}

function templateForModel(templates: CustomInstructTemplate[], modelId: string) {
    if (!modelId.trim()) return undefined;
    return templates
        .filter((template) => matchesModel(template.activationRegex, modelId))
        .sort(
            (a, b) =>
                activationPriority(b) - activationPriority(a) ||
                a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        )[0];
}

function activationPriority(template: CustomInstructTemplate) {
    return (
        builtinActivationPriorities[template.id] ?? template.activationRegex?.length ?? 0
    );
}

function matchesModel(pattern: string | undefined, modelId: string) {
    if (!pattern?.trim()) return false;
    try {
        return new RegExp(pattern, "i").test(modelId);
    } catch {
        return false;
    }
}

function fromTemplate(
    template: CustomInstructTemplate,
    formatting: PresetFormattingSettings,
    presetFormatting: PresetFormattingSettings | undefined,
    reason: InstructTemplateResolution["reason"],
): InstructTemplateResolution {
    const {
        id,
        name,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...templateFormatting
    } = template;
    return {
        formatting: {
            ...templateFormatting,
            ...formatting,
            ...presetFormatting,
            instructTemplate: "custom",
        },
        template: { id, name },
        reason,
    };
}
