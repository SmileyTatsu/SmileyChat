import { NotebookText } from "lucide-preact";

import sharedStyles from "../shared-ui.css?raw";
import styles from "./styles.css?raw";

import type { SmileyPluginApi } from "#frontend/lib/plugins/types";

import { loadSummarizerSettings, startSummarizerDaemon } from "./daemon";
import { registerSummaryInjection } from "./injection";
import { chatSummarizerManifest } from "./manifest";
import { SummarizerModal } from "./modal";
import { SummarizerSettingsPanel } from "./settings-panel";

export { chatSummarizerManifest };

export async function activate(api: SmileyPluginApi) {
    await loadSummarizerSettings(api);

    api.ui.addStyles(styles);
    api.ui.addStyles(sharedStyles);
    registerSummaryInjection(api);

    api.ui.registerSettingsPanel({
        id: "settings",
        label: "Chat Summarizer",
        render: ({ snapshot }) => (
            <SummarizerSettingsPanel api={api} snapshot={snapshot} />
        ),
    });

    api.ui.registerHeaderAction({
        id: "open-summary",
        label: "Open chat summary",
        renderIcon: () => <NotebookText size={17} aria-hidden="true" />,
        run: () => {
            api.ui.openModal({
                id: "summary",
                title: "Chat Summary",
                render: ({ close, snapshot }) => (
                    <SummarizerModal api={api} close={close} snapshot={snapshot} />
                ),
            });
        },
    });

    const stopDaemon = startSummarizerDaemon(api);

    return () => {
        stopDaemon();
    };
}

export const chatSummarizerPlugin = {
    manifest: chatSummarizerManifest,
    module: { activate },
};
