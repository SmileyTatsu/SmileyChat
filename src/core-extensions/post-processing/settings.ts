import { createId } from "#frontend/lib/common/ids";

export type PipelinePass = {
    id: string;
    name: string;
    enabled: boolean;
    prompt: string;
    profileId: string;
    presetId: string;
    modelId: string;
    contextMessageLimit: number;
    includeCharacter: boolean;
    includeSceneContext: boolean;
    stream: boolean;
};

export type PostProcessingPipeline = {
    id: string;
    name: string;
    passes: PipelinePass[];
};

export type PostProcessingSettings = {
    version: 1;
    enabled: boolean;
    autoRun: boolean;
    showDiff: boolean;
    minChars: number;
    activePipelineId: string;
    pipelines: PostProcessingPipeline[];
};

// Default prompts sourced from closuretxt's recast-post-processing:
// https://github.com/closuretxt/recast-post-processing

export const promptGrounding = `You are a prose editor. Edit <text_to_transform> so it feels rooted in the story's world, consistent with its rules, tone, setting, and the way things work there. Making it feels like it belongs to this specific world. Do not make slop or guesswork.
Essentially make the text make sense, apply crude logic and reactions from the world, scene and characters.
You don't have context about the scene, keep that in mind.

When a character announces an action and then immediately executes it or time passes, add one short beat between the two so the reader doesn't feel like they blinked and missed the transition. It can be a reaction, a half-second, anything that confirms time moved.

Return only the rewritten text. No explanations, no notes, no commentary.`;

export const promptCharacterBehavior = `You are a character consistency editor. Your only job is to fix dialog and actions that are not in character in <text_to_transform>. Do not improve prose. Do not fix grammar. Do not restructure sentences. Keep in mind you may not have received the whole scene context.
Priority order for character signals: example dialogue > personality traits > general description > scene context.

Fix text if it:
- Uses phrasing that contradicts the example dialogue voice
- Has the character act warmer, cooler, more helpful, or more dramatic than the card defines
- Responds only to the surface of what was said, ignoring what the other character is visibly feeling
- States emotion directly instead of showing it through behavior or word choice
- Resolves tension the character would hold

<banned_behaviors>
Also following are behaviors from characters that should be modified or removed completely:
- Asking for a compensation, any kind of 'Okay but give me this', should be avoided and exchanged to something else. Compliance is not easily bought.
- Stiff unexpected behavior from characters. Characters should not stop and ask things if it doesn't fit them or the context.
</banned_behaviors>

Return only the corrected text. No explanations, no commentary.`;

export const promptProseRhythm = `You are a prose editor. Your only job is to improve how <text_to_transform> reads without changing what it says.
Rules:
- Do not change any dialogue. Not a single word.
- Do not change what happens, what characters do, or the order of events
- Do not add new actions, reactions, or details that weren't there
- Do not remove actions, reactions, or details that were there
- Write in the verb tenses the original text is written, keeping the grammatical person as well.
- Prioritize avoiding repetition of descriptive words by changing the phrase or removing it altogether

What you may change:
- Sentence length variation, break up monotonous rhythm, mix short and long
- Eliminate repeated sentence structures, especially consecutive sentences starting the same way
- Convert telling to showing, remove emotion labels and replace with physical behavior or action
- Cut filler phrases that carry no meaning
- Tighten overly wordy constructions without losing meaning
- Favor flowing sentences connected by conjunctions over short stopped ones
- Remove any unnecessary 'waiting' at the end of the dialog, if that wait is already clear by the text or cannot be implemented naturally with something else, then remove it

Use the scene context only to match the established prose tone and style of the exchange. Do not drift from the register already set.

Return only the rewritten text. No explanations, no notes, no commentary.`;

export const promptRepetitionHammer = `Simply edit <text_to_transform> and remove all repeated words or dialogs from it.

Rules:
- Remove only words that are removable
- Change only if allows the text to still make sense
- Prioritize removing things seen in the more recent interactions

Return only the rewritten text. No explanations, no notes, no commentary. Think only once to avoid overthinking.`;

export function createNewPass(): PipelinePass {
    return {
        id: createId("post-pass"),
        name: "New Pass",
        enabled: true,
        prompt: promptGrounding,
        profileId: "",
        presetId: "",
        modelId: "",
        contextMessageLimit: 3,
        includeCharacter: true,
        includeSceneContext: true,
        stream: true,
    };
}

export function createDefaultPipeline(): PostProcessingPipeline {
    return {
        id: createId("post-pipeline"),
        name: "Default Pipeline",
        passes: [
            {
                id: createId("post-pass"),
                name: "Grounding",
                enabled: true,
                prompt: promptGrounding,
                profileId: "",
                presetId: "",
                modelId: "",
                contextMessageLimit: 3,
                includeCharacter: true,
                includeSceneContext: true,
                stream: true,
            },
            {
                id: createId("post-pass"),
                name: "Character Behavior Validator",
                enabled: false,
                prompt: promptCharacterBehavior,
                profileId: "",
                presetId: "",
                modelId: "",
                contextMessageLimit: 7,
                includeCharacter: true,
                includeSceneContext: true,
                stream: true,
            },
            {
                id: createId("post-pass"),
                name: "Prose Rhythm",
                enabled: false,
                prompt: promptProseRhythm,
                profileId: "",
                presetId: "",
                modelId: "",
                contextMessageLimit: 13,
                includeCharacter: true,
                includeSceneContext: true,
                stream: true,
            },
            {
                id: createId("post-pass"),
                name: "Repetition Hammer",
                enabled: false,
                prompt: promptRepetitionHammer,
                profileId: "",
                presetId: "",
                modelId: "",
                contextMessageLimit: 35,
                includeCharacter: true,
                includeSceneContext: true,
                stream: true,
            },
        ],
    };
}

export function defaultPostProcessingSettings(): PostProcessingSettings {
    const pipeline = createDefaultPipeline();

    return {
        version: 1,
        enabled: false,
        autoRun: false,
        showDiff: true,
        minChars: 120,
        activePipelineId: pipeline.id,
        pipelines: [pipeline],
    };
}

export function normalizePostProcessingSettings(value: unknown): PostProcessingSettings {
    const fallback = defaultPostProcessingSettings();
    const source = isRecord(value) ? value : {};
    const pipelines = normalizePipelines(source.pipelines);
    const activePipelineId = stringValue(source.activePipelineId);
    const activePipeline = pipelines.find((item) => item.id === activePipelineId);

    return {
        version: 1,
        enabled: booleanValue(source.enabled, fallback.enabled),
        autoRun: booleanValue(source.autoRun, fallback.autoRun),
        showDiff: booleanValue(source.showDiff, fallback.showDiff),
        minChars: integerValue(source.minChars, 0, 100000, fallback.minChars),
        activePipelineId:
            activePipeline?.id ?? pipelines[0]?.id ?? fallback.activePipelineId,
        pipelines: pipelines.length ? pipelines : fallback.pipelines,
    };
}

export function activePipeline(settings: PostProcessingSettings) {
    return (
        settings.pipelines.find(
            (pipeline) => pipeline.id === settings.activePipelineId,
        ) ?? settings.pipelines[0]
    );
}

function normalizePipelines(value: unknown): PostProcessingPipeline[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => normalizePipeline(item))
        .filter((item): item is PostProcessingPipeline => Boolean(item));
}

function normalizePipeline(value: unknown): PostProcessingPipeline | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = stringValue(value.id) || createId("post-pipeline");
    const name = stringValue(value.name) || "Untitled Pipeline";
    const passes = Array.isArray(value.passes)
        ? value.passes
              .map((item) => normalizePass(item))
              .filter((item): item is PipelinePass => Boolean(item))
        : [];

    return {
        id,
        name,
        passes,
    };
}

function normalizePass(value: unknown): PipelinePass | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    return {
        id: stringValue(value.id) || createId("post-pass"),
        name: stringValue(value.name) || "Untitled Pass",
        enabled: booleanValue(value.enabled, true),
        prompt: typeof value.prompt === "string" ? value.prompt : promptGrounding,
        profileId: stringValue(value.profileId),
        presetId: stringValue(value.presetId),
        modelId: stringValue(value.modelId),
        contextMessageLimit: integerValue(value.contextMessageLimit, -1, 100000, -1),
        includeCharacter: booleanValue(value.includeCharacter, true),
        includeSceneContext: booleanValue(value.includeSceneContext, true),
        stream: booleanValue(value.stream, true),
    };
}

function integerValue(
    value: unknown,
    minimum: number,
    maximum: number,
    fallback: number,
) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function booleanValue(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
