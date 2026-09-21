import sharedStyles from "../shared-ui.css?raw";
import styles from "./styles.css?raw";

import { messageFormattingForMode } from "#frontend/lib/message-formatting/quote-highlighting";
import { defaultAppPreferences } from "#frontend/lib/preferences/types";

import { renderFormatted, renderPlain } from "./formatting";
import { smileyChatFormatterManifest } from "./manifest";
import type { FormatterApi } from "./nodes";
import {
    defaultFormatterSettings,
    getFormatterSettings,
    normalizeFormatterSettings,
    setFormatterSettings,
    type FormatterSettings,
} from "./settings";
import { renderSettingsPanel } from "./settings-panel";

export { smileyChatFormatterManifest };

export async function activate(api: FormatterApi) {
    await api.settings.register<FormatterSettings>({
        key: "settings",
        defaultValues: defaultFormatterSettings,
        normalize: normalizeFormatterSettings,
    });
    setFormatterSettings(
        api.settings.get<FormatterSettings>("settings") ?? defaultFormatterSettings,
    );
    api.settings.subscribe<FormatterSettings>((newSettings) => {
        setFormatterSettings(newSettings);
        registerFormatterRenderer(api);
    });

    api.ui.addStyles(styles);
    api.ui.addStyles(sharedStyles);
    registerFormatterRenderer(api);

    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Chat Formatter",
        render: ({ settings, updateSettings }) =>
            renderSettingsPanel(api, settings, updateSettings),
    });
}

function registerFormatterRenderer(api: FormatterApi) {
    api.ui.registerMessageRenderer({
        id: "xml-style-tags",
        priority: 20,
        render: ({ content, characterDialogueColor, messageFormatting, mode }) => {
            const formatting =
                messageFormatting ??
                messageFormattingForMode(defaultAppPreferences, mode);

            return api.ui.h(
                "div",
                {
                    className: `scf-message ${mode === "rp" ? "scf-message-rp" : "scf-message-chat"}`,
                },
                getFormatterSettings().enabled
                    ? renderFormatted(api, content, formatting, characterDialogueColor)
                    : renderPlain(api, content, formatting, characterDialogueColor),
            );
        },
    });
}

export const smileyChatFormatterPlugin = {
    manifest: smileyChatFormatterManifest,
    module: { activate },
};
