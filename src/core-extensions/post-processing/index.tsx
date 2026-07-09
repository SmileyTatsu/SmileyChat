import { Sparkles } from "lucide-preact";

import sharedStyles from "../shared-ui.css?raw";
import styles from "./styles.css?raw";

import { getMessageContent } from "#frontend/lib/messages";
import type { SmileyPluginApi } from "#frontend/lib/plugins/types";
import { MessageRole } from "#frontend/types";

import {
    getLatestAcceptedText,
    getPostProcessingSettings,
    isPipelineRunning,
    loadPostProcessingSettings,
    runPipeline,
} from "./controller";
import { contextFromOutputMiddleware, contextFromSnapshot } from "./engine";
import { postProcessingManifest } from "./manifest";
import { PostProcessingSettingsPanel } from "./settings-panel";

export { postProcessingManifest };

export async function activate(api: SmileyPluginApi) {
    await loadPostProcessingSettings(api);

    api.ui.addStyles(styles);
    api.ui.addStyles(sharedStyles);

    api.presets.registerMacro("recast_latest", () => getLatestAcceptedText());

    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Post Processing",
        render: ({ snapshot }) => (
            <PostProcessingSettingsPanel api={api} snapshot={snapshot} />
        ),
    });

    api.chat.registerOutputMiddleware({
        id: "pipeline",
        priority: -50,
        async run(content, context) {
            const settings = getPostProcessingSettings();

            if (
                !settings.enabled ||
                !settings.autoRun ||
                isPipelineRunning() ||
                content.trim().length < settings.minChars
            ) {
                return content;
            }

            const result = await runPipeline(api, {
                context: contextFromOutputMiddleware(context),
                mode: "auto",
                originalText: content,
            });

            return result.accepted ? result.text : content;
        },
    });

    api.ui.registerMessageAction({
        id: "post-process-message",
        label: "Post-process",
        renderIcon: () => <Sparkles size={14} aria-hidden="true" />,
        async run({ content, message, snapshot }) {
            const settings = getPostProcessingSettings();
            const text = content.trim();

            if (
                !settings.enabled ||
                !text ||
                isPipelineRunning() ||
                message.metadata?.displayRole === "system" ||
                message.role === MessageRole.System
            ) {
                return;
            }

            const result = await runPipeline(api, {
                context: contextFromSnapshot(snapshot),
                mode: "manual",
                originalText: text,
            });

            if (result.accepted && result.text !== text) {
                await api.actions.editMessage(message.id, result.text);
            }
        },
    });
}

export const postProcessingPlugin = {
    manifest: postProcessingManifest,
    module: { activate },
};
