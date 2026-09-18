import { Image } from "lucide-preact";

import { getMessageContent } from "#frontend/lib/messages";
import type { PluginAppSnapshot, SmileyPluginApi } from "#frontend/lib/plugins/types";

import sharedStyles from "../shared-ui.css?raw";
import styles from "./styles.css?raw";
import {
    createImages,
    isNovelAIImageGenerationAvailable,
    writeImagePrompt,
} from "./controller";
import { imageGenerationManifest } from "./manifest";
import { ImageGenerationModal } from "./modal";
import {
    getImageGenerationSettings,
    loadImageGenerationSettings,
    type ImageContextMode,
} from "./settings";
import { ImageGenerationSettingsPanel } from "./settings-panel";

export { imageGenerationManifest };

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

    api.tools.registerTool({
        name: "generate_image",
        displayName: "Generate image",
        description:
            "Generate a NovelAI image and return it with this assistant response. Use this tool only in either of these cases: (1) a character is sending the user a selfie, photo, or other image because it was requested in the conversation, including an in-fiction request between characters; or (2) an image is strictly necessary to fulfill an explicit user request. Do not generate unsolicited illustrations, scene visuals, visual reveals, decorative images, or images that merely enrich the roleplay. Those require an explicit user request. Never simulate this tool by writing image descriptions, prompt tags, attachment markers, or generated image context text. When an image is requested, call the tool. This tool takes no arguments. Do not compose or supply an image prompt. SmileyChat derives the visual intent from the current conversation, uses the configured preset and bounded history in a separate prompt-writer request, inserts the result into {{prompt}}, preserves the fixed master prompt, calls NovelAI, and returns the generated image.",
        parameters: {
            type: "object",
            additionalProperties: false,
            properties: {},
        },
        isAvailable: (snapshot) => isNovelAIImageGenerationAvailable(api, snapshot),
        async run(_args, context) {
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
            api.logger.info("Image generation tool started", {
                contextMode: "last-message",
                sourceMessageId: sourceMessage.id,
            });
            try {
                const draft = await writeImagePrompt(api, context, "last-message", "");
                const outcome = await createImages(
                    api,
                    context,
                    draft.prompt,
                    context.signal,
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
