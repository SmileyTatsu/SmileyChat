import styles from "./styles.css?raw";

import {
    messageFormattingForMode,
} from "#frontend/lib/message-formatting/quote-highlighting";
import { defaultAppPreferences } from "#frontend/lib/preferences/types";

import { renderFormatted, renderPlain } from "./formatting";
import { smileyChatFormatterManifest } from "./manifest";
import type { FormatterApi } from "./nodes";
import {
    defaultFormatterSettings,
    getFormatterSettings,
    normalizeFormatterSettings,
    setFormatterSettings,
} from "./settings";
import { renderSettingsPanel } from "./settings-panel";

export { smileyChatFormatterManifest };

export async function activate(api: FormatterApi) {
    setFormatterSettings(
        normalizeFormatterSettings(
            await api.storage
                .getJson("settings", defaultFormatterSettings)
                .catch(() => defaultFormatterSettings),
        ),
    );

    api.ui.addStyles(styles);
    registerFormatterRenderer(api);

    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Chat Formatter",
        render: () => renderSettingsPanel(api, () => registerFormatterRenderer(api)),
    });
}

function registerFormatterRenderer(api: FormatterApi) {
    api.ui.registerMessageRenderer({
        id: "xml-style-tags",
        priority: 20,
        render: ({ content, messageFormatting, mode }) => {
            const formatting =
                messageFormatting ?? messageFormattingForMode(defaultAppPreferences, mode);

            return api.ui.h(
                "div",
                {
                    className: `scf-message ${mode === "rp" ? "scf-message-rp" : "scf-message-chat"}`,
                },
                getFormatterSettings().enabled
                    ? renderFormatted(api, content, formatting)
                    : renderPlain(api, content, formatting),
            );
        },
    });
}

export const smileyChatFormatterPlugin = {
    manifest: smileyChatFormatterManifest,
    module: { activate },
};
