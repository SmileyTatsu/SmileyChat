import type { NovelAIConnectionProfile } from "#frontend/lib/connections/config";
import {
    ChatGenerationMessageRole,
    type ChatGenerationMessage,
} from "#frontend/lib/connections/types";
import { getMessageContent } from "#frontend/lib/messages";
import type {
    PluginAppSnapshot,
    PluginToolContext,
    SmileyPluginApi,
} from "#frontend/lib/plugins/types";
import { compilePresetMessages } from "#frontend/lib/presets/compile";

import { compileMasterPrompt, splitMasterPrompt } from "./master-prompt";
import { generateNovelAIImages } from "./novelai";
import {
    getImageGenerationSettings,
    type ImageContextMode,
    type ImageGenerationSettings,
} from "./settings";

const PROMPT_WRITER_RESPONSE_CONTRACT = `This is an application response protocol and is not user-editable. Return exactly one JSON object and no surrounding prose or code fence. Use this shape: {"roleMap":[{"role":"Subject","purpose":"short purpose"}],"prompt":"exact prompt insertion","notes":["short assumption"]}. The prompt field is required and must contain only the text that replaces {{prompt}}. roleMap and notes may be empty arrays. Never copy, rewrite, normalize, reorder, or remove the fixed master-prompt prefix or suffix.`;

const PROMPT_WRITER_LABEL_RESPONSE_CONTRACT = `This is an application response protocol and is not user-editable. Return exactly one JSON object and no surrounding prose or code fence. Use this shape: {"roleMap":[{"role":"Subject","purpose":"short purpose"}],"prompt":"exact prompt insertion","label":"compact visual memory","notes":["short assumption"]}. The prompt field is required and must contain only the text that replaces {{prompt}}. The label field is required and must be a concise plain-language description of the resulting image for future chat context, preserving subject identity, image type, current appearance, action, framing, and setting while omitting artist and quality tags. Keep the label under 300 characters. roleMap and notes may be empty arrays. Never copy, rewrite, normalize, reorder, or remove the fixed master-prompt prefix or suffix.`;

const PROMPT_WRITER_RAW_RESPONSE_CONTRACT = `This is an application response protocol and is not user-editable. Output only the exact prompt insertion that replaces {{prompt}}. Return only the comma-separated tags and natural language bindings. Do not wrap in JSON, markdown code fences, quotes, or conversational explanations. Never copy, rewrite, normalize, reorder, or remove the fixed master-prompt prefix or suffix.`;

export type ImagePromptDraft = {
    roleMap: Array<{ role: string; purpose: string }>;
    prompt: string;
    label: string;
    notes: string[];
};

export type ImageGenerationOutcome = {
    compiledPrompt: string;
    images: string[];
    seeds: number[];
    correlationId: string;
};

export const IMAGE_TOOL_SHOTS = [
    "selfie",
    "mirror_selfie",
    "self_timer",
    "other_person_photo",
    "scene_illustration",
    "portrait",
] as const;

export type ImageToolShot = (typeof IMAGE_TOOL_SHOTS)[number];

export const IMAGE_TOOL_ASPECT_RATIOS = ["square", "widescreen", "portrait"] as const;

export type ImageToolAspectRatio = (typeof IMAGE_TOOL_ASPECT_RATIOS)[number];

export const STANDARD_ASPECT_RATIO_DIMENSIONS: Record<
    ImageToolAspectRatio,
    { width: number; height: number }
> = {
    square: { width: 1024, height: 1024 },
    widescreen: { width: 1216, height: 832 },
    portrait: { width: 832, height: 1216 },
};

export const DEFAULT_ASPECT_RATIO_DIMENSIONS = {
    width: 832,
    height: 1216,
} as const;

export function resolveAspectRatioDimensions(
    aspectRatio?: ImageToolAspectRatio | string,
): { width: number; height: number } {
    if (aspectRatio && aspectRatio in STANDARD_ASPECT_RATIO_DIMENSIONS) {
        return STANDARD_ASPECT_RATIO_DIMENSIONS[aspectRatio as ImageToolAspectRatio];
    }
    return DEFAULT_ASPECT_RATIO_DIMENSIONS;
}

export type ImageToolRequest = {
    scene: string;
    shot: ImageToolShot;
    visibleSubjects: string[];
    aspectRatio?: ImageToolAspectRatio;
};

const IMAGE_TOOL_SHOT_GUIDANCE: Record<ImageToolShot, string> = {
    selfie: "through-the-lens selfie taken by a visible subject; the camera or phone stays behind the lens",
    mirror_selfie: "mirror selfie; the reflected camera or phone may be visible",
    self_timer:
        "self-timer or fixed-camera photograph; do not invent another photographer",
    other_person_photo:
        "photograph taken by another established person behind the camera; do not add that photographer to the frame",
    scene_illustration:
        "non-diegetic scene illustration; nobody in the story is holding a camera or taking the picture",
    portrait: "posed portrait; do not invent an in-world photographer or camera prop",
};

export function parseImageToolRequest(args: Record<string, unknown>): ImageToolRequest {
    const scene = typeof args.scene === "string" ? args.scene.trim() : "";
    if (!scene) {
        throw new Error("Image generation requires a concise scene description.");
    }

    if (!IMAGE_TOOL_SHOTS.includes(args.shot as ImageToolShot)) {
        throw new Error("Image generation requires a supported shot type.");
    }

    const visibleSubjects = Array.isArray(args.visibleSubjects)
        ? [
              ...new Set(
                  args.visibleSubjects
                      .filter((subject): subject is string => typeof subject === "string")
                      .map((subject) => subject.trim())
                      .filter(Boolean),
              ),
          ]
        : [];
    if (!visibleSubjects.length) {
        throw new Error("Image generation requires at least one visible subject.");
    }

    let aspectRatio: ImageToolAspectRatio | undefined;
    const rawAspect = (
        typeof args.aspectRatio === "string"
            ? args.aspectRatio
            : typeof args.aspect_ratio === "string"
              ? args.aspect_ratio
              : typeof args.orientation === "string"
                ? args.orientation
                : ""
    )
        .trim()
        .toLowerCase();

    if (rawAspect) {
        if (rawAspect === "square" || rawAspect === "1:1" || rawAspect === "1/1") {
            aspectRatio = "square";
        } else if (
            rawAspect === "widescreen" ||
            rawAspect === "landscape" ||
            rawAspect === "wide" ||
            rawAspect === "16:9" ||
            rawAspect === "16/9"
        ) {
            aspectRatio = "widescreen";
        } else if (
            rawAspect === "portrait" ||
            rawAspect === "vertical" ||
            rawAspect === "tall" ||
            rawAspect === "9:16" ||
            rawAspect === "9/16"
        ) {
            aspectRatio = "portrait";
        } else {
            throw new Error(
                "Image generation requires a supported aspect ratio: square, widescreen, or portrait.",
            );
        }
    }

    return {
        scene,
        shot: args.shot as ImageToolShot,
        visibleSubjects,
        ...(aspectRatio ? { aspectRatio } : {}),
    };
}

export function imageToolRequestContext(
    request: ImageToolRequest,
    characterName: string,
    personaName: string,
) {
    const normalizedPersonaName = personaName.trim().toLocaleLowerCase();
    const personaIsVisible =
        Boolean(normalizedPersonaName) &&
        request.visibleSubjects.some(
            (subject) => subject.toLocaleLowerCase() === normalizedPersonaName,
        );

    const lines = [
        "Automatic image director brief. Treat this as the authoritative intent for the new image, while using recent chat context only to resolve appearance and continuity details.",
        `Tool caller / active character: ${characterName}`,
        `Scene to depict: ${request.scene}`,
        `Shot type: ${request.shot} — ${IMAGE_TOOL_SHOT_GUIDANCE[request.shot]}`,
    ];

    if (request.aspectRatio) {
        const framingDesc =
            request.aspectRatio === "widescreen"
                ? "widescreen landscape framing (1216x832)"
                : request.aspectRatio === "square"
                  ? "square framing (1024x1024)"
                  : "portrait vertical framing (832x1216)";
        lines.push(`Framing aspect ratio: ${request.aspectRatio} — ${framingDesc}`);
    }

    lines.push(
        `Complete visible-subject list: ${request.visibleSubjects.join(", ")}`,
        personaIsVisible
            ? `The active user persona (${personaName}) is explicitly visible because they are named in the subject list.`
            : `The active user persona (${personaName}) is not visible. Do not depict them, their body, or an implied off-camera presence.`,
        "Do not add people, photographers, camera operators, reflections, or body parts belonging to anyone outside the complete visible-subject list.",
    );

    return lines.join("\n");
}

export function imageContextFromSnapshot(
    snapshot: PluginAppSnapshot,
    mode: ImageContextMode,
    sourceText = "",
    includeRecentConversation = true,
) {
    const character = snapshot.character.data;
    const lastMessage = [...snapshot.messages]
        .reverse()
        .map(getMessageContent)
        .find((content) => content.trim());
    const recent = includeRecentConversation
        ? snapshot.messages
              .slice(-8)
              .map((message) => `${message.author}: ${getMessageContent(message)}`)
              .join("\n")
        : "Provided separately as structured chat history.";

    switch (mode) {
        case "character":
            return `Create a full character image of ${character.name}.\nDescription: ${character.description}\nPersonality: ${character.personality}`;
        case "portrait":
            return `Create a portrait of ${character.name}.\nDescription: ${character.description}\nPersonality: ${character.personality}`;
        case "persona":
            return `Create an image of ${snapshot.persona.name}.\nDescription: ${snapshot.persona.description || "No persona description provided."}`;
        case "scene":
            return `Create the current story scene.\nScenario: ${character.scenario}\nRecent conversation:\n${recent}`;
        case "last-message":
            return `Illustrate this message:\n${sourceText.trim() || lastMessage || "No message available."}`;
        case "background":
            return `Create an environment/background without foreground character focus.\nScenario: ${character.scenario}\nRecent context:\n${recent}`;
        case "raw":
        case "custom":
            return sourceText.trim();
    }
}

export async function writeImagePrompt(
    api: SmileyPluginApi,
    snapshot: PluginAppSnapshot,
    mode: ImageContextMode,
    sourceText: string,
): Promise<ImagePromptDraft> {
    const startedAt = Date.now();
    const settings = getImageGenerationSettings();
    const context = imageContextFromSnapshot(
        snapshot,
        mode,
        sourceText,
        !settings.includePresetContext,
    );
    if (!context) {
        throw new Error("Describe the image before asking the AI to write a prompt.");
    }

    const selectedPreset = settings.includePresetContext
        ? snapshot.presetCollection.presets.find(
              (preset) =>
                  preset.id ===
                  (settings.promptWriterPresetId ||
                      snapshot.presetCollection.activePresetId),
          )
        : undefined;
    const historyCount = settings.includePresetContext
        ? Math.min(settings.promptWriterHistoryLimit, snapshot.messages.length)
        : 0;
    const messages = buildPromptWriterMessages(snapshot, settings, mode, context);
    api.logger.info("Image prompt writer started", {
        mode,
        contextLength: context.length,
        profileId: settings.promptWriterProfileId || "active",
        modelId: settings.promptWriterModelId?.trim() || "default",
        rawPromptWriter: settings.rawPromptWriter,
        includePresetContext: settings.includePresetContext,
        presetId: selectedPreset?.id || "none",
        historyMessageCount: historyCount,
    });

    let rawResponse = "";
    try {
        const result = await api.model.generate({
            profileId: settings.promptWriterProfileId || undefined,
            modelId: settings.promptWriterModelId?.trim() || undefined,
            presetId: selectedPreset?.id,
            stream: false,
            messages,
        });
        rawResponse = result.message;
        api.logger.info("Image prompt writer raw response", {
            profileId: settings.promptWriterProfileId || "active",
            modelId: settings.promptWriterModelId?.trim() || "default",
            raw: result.message,
            length: result.message.length,
        });
        const parsed = parsePromptWriterResult(
            result.message,
            settings.generatedImageContextMode === "label",
            settings.rawPromptWriter,
        );
        api.logger.info("Image prompt writer completed", {
            durationMs: Date.now() - startedAt,
            insertionLength: parsed.prompt.length,
            labelLength: parsed.label.length,
            notes: parsed.notes.length,
        });
        return parsed;
    } catch (error) {
        api.logger.error("Image prompt writer failed", {
            error,
            raw: rawResponse,
        });
        throw error;
    }
}

export function buildPromptWriterMessages(
    snapshot: PluginAppSnapshot,
    settings: ImageGenerationSettings,
    mode: ImageContextMode,
    context: string,
): ChatGenerationMessage[] {
    const { prefix, suffix } = splitMasterPrompt(settings.masterPrompt);
    const presetId =
        settings.promptWriterPresetId || snapshot.presetCollection.activePresetId;
    const preset = settings.includePresetContext
        ? snapshot.presetCollection.presets.find((item) => item.id === presetId)
        : undefined;
    const historyMessages =
        settings.includePresetContext && settings.promptWriterHistoryLimit > 0
            ? snapshot.messages.slice(-settings.promptWriterHistoryLimit)
            : [];
    const presetMessages = settings.includePresetContext
        ? compilePresetMessages(preset, {
              character: snapshot.character,
              messages: historyMessages,
              historyMessages,
              mode: snapshot.mode,
              personaDescription: snapshot.persona.description,
              personaName: snapshot.persona.name,
              userStatus: snapshot.userStatus,
          })
        : [];

    return [
        ...presetMessages,
        {
            role: ChatGenerationMessageRole.System,
            content: settings.promptInstruction,
        },
        {
            role: ChatGenerationMessageRole.System,
            content: settings.rawPromptWriter
                ? PROMPT_WRITER_RAW_RESPONSE_CONTRACT
                : settings.generatedImageContextMode === "label"
                  ? PROMPT_WRITER_LABEL_RESPONSE_CONTRACT
                  : PROMPT_WRITER_RESPONSE_CONTRACT,
        },
        {
            role: ChatGenerationMessageRole.User,
            content: settings.rawPromptWriter
                ? [
                      `Visual request mode: ${mode}`,
                      `Context for this image:\n${context}`,
                      `NovelAI model: ${settings.model}`,
                      `Fixed master-prompt prefix: ${prefix}`,
                      `Fixed master-prompt suffix: ${suffix}`,
                      "Prefix and suffix are immutable user text. Do not repeat their tags in prompt unless the visual request cannot be expressed otherwise. Follow the latest visual request while remaining consistent with the supplied preset and recent chat context.",
                      "Generate only the raw prompt tags and bindings to insert into {{prompt}}.",
                  ].join("\n\n")
                : JSON.stringify(
                      {
                          task: "Write only the replaceable insertion for {{prompt}}.",
                          contextMode: mode,
                          visualContext: context,
                          novelAIImageModel: settings.model,
                          fixedMasterPrompt: settings.masterPrompt,
                          fixedPrefix: prefix,
                          fixedSuffix: suffix,
                          warning:
                              "Prefix and suffix are immutable user text. Do not repeat their tags in prompt unless the visual request cannot be expressed otherwise. Follow the latest visual request while remaining consistent with the supplied preset and recent chat context.",
                      },
                      null,
                      2,
                  ),
        },
    ];
}

export function stripThinkingTags(value: string): string {
    return value.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
}

export function parsePromptWriterResult(
    value: string,
    requireLabel = false,
    rawPromptWriter = false,
): ImagePromptDraft {
    const withoutThinking = stripThinkingTags(value);
    const trimmed = withoutThinking.trim();

    if (rawPromptWriter) {
        // Strip code fences if model wrapped the raw prompt in ```tags or ```
        const unfenced = trimmed
            .replace(/^```[a-z0-9_-]*\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();

        // If the model still returned JSON despite raw prompt mode, extract the prompt field
        if (unfenced.startsWith("{") && unfenced.endsWith("}")) {
            try {
                const parsed = JSON.parse(unfenced) as Record<string, unknown>;
                if (typeof parsed.prompt === "string" && parsed.prompt.trim()) {
                    const prompt = parsed.prompt.trim();
                    const label =
                        typeof parsed.label === "string" && parsed.label.trim()
                            ? parsed.label.trim().slice(0, 300)
                            : prompt.slice(0, 300);
                    return { roleMap: [], prompt, label, notes: [] };
                }
            } catch {
                // Not valid JSON, continue with unfenced text
            }
        }

        if (!unfenced) {
            throw new Error("The prompt writer returned an empty prompt.");
        }

        return {
            roleMap: [],
            prompt: unfenced,
            label: unfenced.slice(0, 300),
            notes: [],
        };
    }

    // Structured JSON mode
    // 1. If wrapped in markdown codeblock, extract codeblock contents first
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidateText = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;

    // 2. Locate the outermost JSON object
    const objectStart = candidateText.indexOf("{");
    const objectEnd = candidateText.lastIndexOf("}");
    const jsonText =
        objectStart >= 0 && objectEnd > objectStart
            ? candidateText.slice(objectStart, objectEnd + 1)
            : candidateText;

    let parsed: Record<string, unknown> | null = null;
    try {
        parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
        // Try lenient sanitization for common LLM syntax flaws:
        // - Trailing commas: ,} or ,]
        // - Unescaped backslashes in NovelAI syntax: \{tag\} -> {tag}
        try {
            const sanitized = jsonText
                .replace(/,\s*([\]}])/g, "$1")
                .replace(/\\([{}[\]])/g, "$1");
            parsed = JSON.parse(sanitized) as Record<string, unknown>;
        } catch {
            parsed = null;
        }
    }

    try {
        if (!parsed || typeof parsed !== "object") {
            throw new Error("Invalid structured JSON");
        }
        if (typeof parsed.prompt !== "string" || !parsed.prompt.trim()) {
            throw new Error("The prompt writer returned an empty prompt field.");
        }
        if (requireLabel && (typeof parsed.label !== "string" || !parsed.label.trim())) {
            throw new Error("The prompt writer returned an empty label field.");
        }
        const roleMap = Array.isArray(parsed.roleMap)
            ? parsed.roleMap.flatMap((entry) => {
                  if (!entry || typeof entry !== "object") return [];
                  const item = entry as Record<string, unknown>;
                  return typeof item.role === "string" && typeof item.purpose === "string"
                      ? [{ role: item.role, purpose: item.purpose }]
                      : [];
              })
            : [];
        const notes = Array.isArray(parsed.notes)
            ? parsed.notes.filter((note): note is string => typeof note === "string")
            : [];
        return {
            roleMap,
            prompt: parsed.prompt.trim(),
            label:
                typeof parsed.label === "string" ? parsed.label.trim().slice(0, 300) : "",
            notes,
        };
    } catch (error) {
        if (error instanceof Error && error.message.includes("prompt writer")) {
            throw error;
        }
        throw new Error(
            "The prompt writer returned an invalid structured response. Try generating the prompt again.",
        );
    }
}

export type ImageGenerationOverrides = {
    width?: number;
    height?: number;
};

export async function createImages(
    api: SmileyPluginApi,
    snapshot: PluginAppSnapshot | PluginToolContext,
    insertion: string,
    signal?: AbortSignal,
    overrides?: ImageGenerationOverrides,
): Promise<ImageGenerationOutcome> {
    const startedAt = Date.now();
    const settings = getImageGenerationSettings();
    const effectiveSettings: ImageGenerationSettings = {
        ...settings,
        ...(overrides?.width ? { width: overrides.width } : {}),
        ...(overrides?.height ? { height: overrides.height } : {}),
    };
    const compiledPrompt = compileMasterPrompt(settings.masterPrompt, insertion.trim());
    const profile = resolveNovelAIProfile(api, snapshot, effectiveSettings);
    api.logger.info("NovelAI image request started", {
        profileId: profile.id,
        model: effectiveSettings.model,
        width: effectiveSettings.width,
        height: effectiveSettings.height,
        steps: effectiveSettings.steps,
        imageCount: effectiveSettings.imageCount,
        imageFormat: effectiveSettings.imageFormat,
        compiledPromptLength: compiledPrompt.length,
    });

    try {
        const result = await generateNovelAIImages(
            profile,
            effectiveSettings,
            compiledPrompt,
            signal,
        );
        api.logger.info("NovelAI image request completed", {
            durationMs: Date.now() - startedAt,
            imageCount: result.images.length,
            imageDataCharacters: result.images.reduce(
                (total, image) => total + image.length,
                0,
            ),
            correlationId: result.correlationId,
        });
        return { compiledPrompt, ...result };
    } catch (error) {
        api.logger.error("NovelAI image request failed", error);
        throw error;
    }
}

export async function saveImagesToChat(
    api: SmileyPluginApi,
    outcome: ImageGenerationOutcome,
) {
    const files = await Promise.all(
        outcome.images.map(async (url, index) => {
            const blob = await (await fetch(url)).blob();
            const extension = blob.type === "image/webp" ? "webp" : "png";
            return new File([blob], `novelai-${Date.now()}-${index + 1}.${extension}`, {
                type: blob.type || "image/png",
            });
        }),
    );
    const seedText = outcome.seeds.length ? ` · seed ${outcome.seeds.join(", ")}` : "";
    await api.actions.injectMessage(
        "system",
        `NovelAI image${files.length === 1 ? "" : "s"}${seedText}`,
        {
            authorName: "Image Generation",
            files,
            includeInPrompt: false,
            promptRole: "none",
        },
    );
}

function resolveNovelAIProfile(
    api: SmileyPluginApi,
    snapshot: PluginAppSnapshot | PluginToolContext,
    settings: ImageGenerationSettings,
) {
    const profileId = resolveNovelAIProfileId(snapshot, settings);
    if (!profileId) {
        throw new Error("Create a NovelAI connection profile before generating images.");
    }
    const profile = api.connections.getProfileWithSecrets(profileId);

    if (!profile || profile.provider !== "novelai") {
        throw new Error(
            "The selected NovelAI connection profile is no longer available.",
        );
    }
    return profile as NovelAIConnectionProfile;
}

export function resolveNovelAIProfileId(
    snapshot: PluginAppSnapshot | PluginToolContext,
    settings: ImageGenerationSettings,
) {
    const profiles = snapshot.connectionSettings.profiles;
    const preferred = settings.novelAIProfileId
        ? profiles.find((profile) => profile.id === settings.novelAIProfileId)
        : undefined;
    const active = profiles.find(
        (profile) => profile.id === snapshot.connectionSettings.activeProfileId,
    );
    return (
        (preferred?.provider === "novelai" ? preferred : undefined) ??
        (active?.provider === "novelai" ? active : undefined) ??
        profiles.find((item) => item.provider === "novelai")
    )?.id;
}

export function isNovelAIImageGenerationAvailable(
    api: SmileyPluginApi,
    snapshot: PluginAppSnapshot,
    settings = getImageGenerationSettings(),
) {
    const profileId = resolveNovelAIProfileId(snapshot, settings);
    return Boolean(profileId && api.connections.hasApiKey(profileId));
}
