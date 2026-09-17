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
        includePresetContext: settings.includePresetContext,
        presetId: selectedPreset?.id || "none",
        historyMessageCount: historyCount,
    });

    try {
        const result = await api.model.generate({
            profileId: settings.promptWriterProfileId || undefined,
            presetId: selectedPreset?.id,
            stream: false,
            messages,
        });
        const parsed = parsePromptWriterResult(
            result.message,
            settings.generatedImageContextMode === "label",
        );
        api.logger.info("Image prompt writer completed", {
            durationMs: Date.now() - startedAt,
            insertionLength: parsed.prompt.length,
            labelLength: parsed.label.length,
            notes: parsed.notes.length,
        });
        return parsed;
    } catch (error) {
        api.logger.error("Image prompt writer failed", error);
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
            content:
                settings.generatedImageContextMode === "label"
                    ? PROMPT_WRITER_LABEL_RESPONSE_CONTRACT
                    : PROMPT_WRITER_RESPONSE_CONTRACT,
        },
        {
            role: ChatGenerationMessageRole.User,
            content: JSON.stringify(
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

export function parsePromptWriterResult(
    value: string,
    requireLabel = false,
): ImagePromptDraft {
    const trimmed = value.trim();
    const unfenced = trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    const objectStart = unfenced.indexOf("{");
    const objectEnd = unfenced.lastIndexOf("}");
    const jsonText =
        objectStart >= 0 && objectEnd > objectStart
            ? unfenced.slice(objectStart, objectEnd + 1)
            : unfenced;

    try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
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

export async function createImages(
    api: SmileyPluginApi,
    snapshot: PluginAppSnapshot | PluginToolContext,
    insertion: string,
    signal?: AbortSignal,
): Promise<ImageGenerationOutcome> {
    const startedAt = Date.now();
    const settings = getImageGenerationSettings();
    const compiledPrompt = compileMasterPrompt(settings.masterPrompt, insertion.trim());
    const profile = resolveNovelAIProfile(api, snapshot, settings);
    api.logger.info("NovelAI image request started", {
        profileId: profile.id,
        model: settings.model,
        width: settings.width,
        height: settings.height,
        steps: settings.steps,
        imageCount: settings.imageCount,
        imageFormat: settings.imageFormat,
        compiledPromptLength: compiledPrompt.length,
    });

    try {
        const result = await generateNovelAIImages(
            profile,
            settings,
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
