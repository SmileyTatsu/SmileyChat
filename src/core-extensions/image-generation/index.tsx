import { Image } from "lucide-preact";

import { getMessageContent } from "#frontend/lib/messages";
import type { PluginAppSnapshot, SmileyPluginApi } from "#frontend/lib/plugins/types";

import sharedStyles from "../shared-ui.css?raw";
import styles from "./styles.css?raw";
import {
    createImages,
    IMAGE_TOOL_ASPECT_RATIOS,
    IMAGE_TOOL_SHOTS,
    imageToolRequestContext,
    isNovelAIImageGenerationAvailable,
    parseImageToolRequest,
    resolveAspectRatioDimensions,
    writeImagePrompt,
} from "./controller";
import { imageGenerationManifest } from "./manifest";
import { ImageGenerationModal } from "./modal";
import {
    getImageGenerationSettings,
    loadImageGenerationSettings,
    onImageGenerationSettingsChange,
    type ImageContextMode,
} from "./settings";
import { ImageGenerationSettingsPanel } from "./settings-panel";

export { imageGenerationManifest };

export function buildImageToolParameters(
    allowModelAspectRatio: boolean,
): Record<string, unknown> {
    const properties: Record<string, unknown> = {
        scene: {
            type: "string",
            minLength: 1,
            maxLength: 1200,
            description:
                "Concise narrative description of the exact current moment to depict, including action, setting, and transient state. Do not use image-model tags.",
        },
        shot: {
            type: "string",
            enum: IMAGE_TOOL_SHOTS,
            description:
                "Camera relationship. Choose other_person_photo only if another photographer is established in the conversation.",
        },
        visibleSubjects: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            uniqueItems: true,
            items: { type: "string" },
            description:
                "Exhaustive list of people or characters visible in the image. Normally this contains only the active character. Include the user persona only when explicitly required.",
        },
    };

    if (allowModelAspectRatio) {
        properties.aspectRatio = {
            type: "string",
            enum: IMAGE_TOOL_ASPECT_RATIOS,
            description:
                "Optional framing aspect ratio: 'square' (1024x1024), 'widescreen' (1216x832 landscape), or 'portrait' (832x1216 vertical). Standard dimensions within free generation limits.",
        };
    }

    return {
        type: "object",
        additionalProperties: false,
        properties,
        required: [
            "scene",
            "shot",
            "visibleSubjects",
            ...(allowModelAspectRatio ? ["aspectRatio"] : []),
        ],
    };
}

export function getImageToolDescription(allowModelAspectRatio: boolean): string {
    const base =
        "Generate a NovelAI image and return it with this assistant response. Use this tool only when a character is sending a requested selfie/photo, or when an image is strictly necessary to fulfill an explicit user request. Do not generate unsolicited illustrations, decorative images, or visual reveals. Supply a short narrative scene brief, the exact camera relationship, and the complete list of visible subjects. The active user persona must not appear unless the current request explicitly requires them and they are named in visibleSubjects. Use other_person_photo only when the conversation establishes another photographer; use scene_illustration for a non-diegetic illustration. Do not write NovelAI tags or copy the character card into scene. SmileyChat sends this director brief, the configured preset, and bounded history to a separate prompt writer.";
    if (allowModelAspectRatio) {
        return `${base} You can optionally specify aspectRatio as 'square', 'widescreen', or 'portrait'.`;
    }
    return base;
}

export async function activate(api: SmileyPluginApi) {
    await loadImageGenerationSettings(api);
    api.ui.addStyles(sharedStyles);
    api.ui.addStyles(styles);

    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Image Generation",
        render: ({ snapshot }) => (
            <ImageGenerationSettingsPanel api={api} snapshot={snapshot} />
        ),
    });

    api.ui.registerMessageAction({
        id: "illustrate-message",
        label: "Illustrate message",
        renderIcon: () => <Image size={14} aria-hidden="true" />,
        run: ({ content, snapshot }) =>
            openImageModal(api, snapshot, content, "last-message"),
    });

    api.commands.register({
        name: "image",
        description: "Open image generation using the optional text as visual direction.",
        run: (argumentsText, { snapshot }) =>
            openImageModal(
                api,
                snapshot,
                argumentsText,
                argumentsText ? "custom" : undefined,
            ),
    });

    let unregisterTool: (() => void) | undefined;

    function registerImageTool() {
        unregisterTool?.();
        const settings = getImageGenerationSettings();
        unregisterTool = api.tools.registerTool({
            name: "generate_image",
            displayName: "Generate image",
            get description() {
                return getImageToolDescription(
                    getImageGenerationSettings().allowModelAspectRatio,
                );
            },
            get parameters() {
                return buildImageToolParameters(
                    getImageGenerationSettings().allowModelAspectRatio,
                );
            },
            isAvailable: (snapshot) => isNovelAIImageGenerationAvailable(api, snapshot),
            async run(args, context) {
                const sourceMessage = [...context.messages]
                    .reverse()
                    .find((message) => getMessageContent(message).trim());
                if (!sourceMessage) {
                    const error = new Error(
                        "Image generation needs a meaningful message in the active conversation.",
                    );
                    api.logger.error("Image generation tool failed", error);
                    throw error;
                }
                const request = parseImageToolRequest(args);
                const currentSettings = getImageGenerationSettings();
                const directorBrief = imageToolRequestContext(
                    request,
                    context.character.data.name,
                    context.persona.name,
                );
                api.logger.info("Image generation tool started", {
                    contextMode: "last-message",
                    sourceMessageId: sourceMessage.id,
                    shot: request.shot,
                    visibleSubjects: request.visibleSubjects,
                    aspectRatio: request.aspectRatio ?? "default",
                });
                try {
                    const draft = await writeImagePrompt(
                        api,
                        context,
                        "last-message",
                        directorBrief,
                    );
                    const overrides = currentSettings.allowModelAspectRatio
                        ? resolveAspectRatioDimensions(request.aspectRatio)
                        : undefined;
                    const outcome = await createImages(
                        api,
                        context,
                        draft.prompt,
                        context.signal,
                        overrides,
                    );
                    api.logger.info("Image generation tool completed", {
                        correlationId: outcome.correlationId,
                        imageCount: outcome.images.length,
                        sourceMessageId: sourceMessage.id,
                    });
                    const imageContext =
                        getImageGenerationSettings().generatedImageContextMode === "label"
                            ? `Image label: ${draft.label}`
                            : `NovelAI prompt tags: ${draft.prompt}`;
                    return {
                        content: "Image generated successfully and attached.",
                        images: outcome.images,
                        imageContext,
                        suppressHistoryProtocol: true,
                    };
                } catch (error) {
                    api.logger.error("Image generation tool failed", error);
                    throw error;
                }
            },
        });
    }

    registerImageTool();
    onImageGenerationSettingsChange(() => registerImageTool());
}

function openImageModal(
    api: SmileyPluginApi,
    snapshot: PluginAppSnapshot,
    initialSource = "",
    initialMode?: ImageContextMode,
) {
    api.ui.openModal({
        id: "generate-image",
        title: "Generate Image",
        render: ({ close }) => (
            <ImageGenerationModal
                api={api}
                close={close}
                snapshot={snapshot}
                initialSource={initialSource}
                initialMode={initialMode}
            />
        ),
    });
}

export const imageGenerationPlugin = {
    manifest: imageGenerationManifest,
    module: { activate },
};
