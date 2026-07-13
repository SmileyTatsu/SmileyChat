import type { ChatGenerationMessage } from "#frontend/lib/connections/types";
import type { SmileyPluginApi } from "#frontend/lib/plugins/types";
import type { Message } from "#frontend/types";

import sharedStyles from "../shared-ui.css?raw";
import styles from "./styles.css?raw";
import {
    depthForMessage,
    runRegexPass,
    targetForMessage,
    targetForPromptMessage,
} from "./engine";
import { regexReplacerManifest } from "./manifest";
import { activate as activateSettings, getRegexSettings } from "./settings";
import { RegexReplacerSettingsPanel } from "./settings-panel";

export { regexReplacerManifest };

export async function activate(api: SmileyPluginApi) {
    await activateSettings(api);
    api.ui.addStyles(styles);
    api.ui.addStyles(sharedStyles);

    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Regex Replacer",
        render: () => <RegexReplacerSettingsPanel api={api} />,
    });

    api.chat.registerInputMiddleware((content, context) => {
        const target = content.trimStart().startsWith("/") ? "slashCommand" : "userInput";
        return runForDestination(api, content, target, "save", 0);
    });

    api.chat.registerOutputMiddleware({
        id: "regex-replacer-output",
        priority: -100,
        async run(content) {
            return runForDestination(api, content, "aiResponse", "save", 0);
        },
    });

    api.chat.registerMessageUpdateMiddleware((message, context) => {
        if (
            context.kind !== "edit" &&
            context.kind !== "swipe" &&
            context.kind !== "update"
        ) {
            return undefined;
        }

        const target = targetForMessage(message);
        const activeSwipe = message.swipes[message.activeSwipeIndex];
        if (!target || !activeSwipe) return undefined;

        const depth = depthForMessage(context.chat.messages, message.id);
        const content = runForDestination(
            api,
            activeSwipe.content,
            target,
            "save",
            depth,
        );
        const reasoning = activeSwipe.reasoning
            ? runForDestination(api, activeSwipe.reasoning, "reasoning", "save", depth)
            : activeSwipe.reasoning;

        if (content === activeSwipe.content && reasoning === activeSwipe.reasoning)
            return undefined;
        const swipes = [...message.swipes];
        swipes[message.activeSwipeIndex] = { ...activeSwipe, content, reasoning };
        return { ...message, swipes };
    });

    api.chat.registerPromptMiddleware((messages, context) =>
        messages.map((message, index) =>
            transformPromptMessage(api, message, context.messages.length - 1 - index),
        ),
    );

    api.ui.registerMessageDisplayMiddleware((content, context) => {
        const snapshot = api.state.getSnapshot();
        const target = targetForMessage(context.message);
        if (!snapshot || !target) return content;
        return runForDestination(
            api,
            content,
            target,
            "display",
            depthForMessage(snapshot.messages, context.message.id),
        );
    });
}

function transformPromptMessage(
    api: SmileyPluginApi,
    message: ChatGenerationMessage,
    depth: number,
) {
    const target = targetForPromptMessage(message);
    if (!target) return message;
    const content = transformPromptContent(api, message.content, target, depth);
    const reasoning = message.reasoning
        ? runForDestination(api, message.reasoning, "reasoning", "prompt", depth)
        : message.reasoning;
    return { ...message, content, reasoning };
}

function transformPromptContent(
    api: SmileyPluginApi,
    content: ChatGenerationMessage["content"],
    target: Parameters<typeof runForDestination>[2],
    depth: number,
) {
    if (typeof content === "string")
        return runForDestination(api, content, target, "prompt", depth);
    return content.map((part) =>
        part.type === "text"
            ? {
                  ...part,
                  text: runForDestination(api, part.text, target, "prompt", depth),
              }
            : part,
    );
}

function runForDestination(
    api: SmileyPluginApi,
    text: string,
    target: Parameters<typeof runRegexPass>[1]["target"],
    destination: "save" | "display" | "prompt",
    depth: number,
) {
    const settings = getRegexSettings();
    if (!settings.enabled) return text;

    const profile = settings.profiles.find(
        (item) => item.id === settings.activeProfileId,
    );
    if (
        !profile?.rules.some(
            (rule) => rule.destination === destination && rule.targets[target],
        )
    )
        return text;
    return runRegexPass(text, {
        destination,
        depth,
        target,
        macroResolver: (value) => api.presets.resolveMacros(value),
    });
}

export const regexReplacerPlugin = {
    manifest: regexReplacerManifest,
    module: { activate },
};
