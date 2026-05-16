import type { FormatterApi } from "./nodes";
import type { FormatterSettings } from "./settings";
import {
    getFormatterSettings,
    normalizeFormatterSettings,
    setFormatterSettings,
} from "./settings";

export function renderSettingsPanel(
    api: FormatterApi,
    registerFormatterRenderer: () => void,
) {
    const statusId = "scf-settings-status";

    const update = async (patch: Partial<FormatterSettings>) => {
        const nextSettings = normalizeFormatterSettings({
            ...getFormatterSettings(),
            ...patch,
        });
        const status = document.getElementById(statusId);

        setFormatterSettings(nextSettings);

        try {
            await api.storage.setJson("settings", nextSettings);
            registerFormatterRenderer();
            if (status) {
                status.textContent = "Saved.";
            }
        } catch {
            if (status) {
                status.textContent = "Could not save settings.";
            }
        }
    };

    const checkbox = (
        label: string,
        description: string,
        key: keyof Omit<FormatterSettings, "version">,
    ) =>
        api.ui.h("label", { className: "scf-setting-row" }, [
            api.ui.h("span", null, [label, api.ui.h("small", null, description)]),
            api.ui.h("input", {
                type: "checkbox",
                checked: Boolean(getFormatterSettings()[key]),
                onChange: (event: Event) => {
                    const target = event.currentTarget;
                    if (target instanceof HTMLInputElement) {
                        void update({ [key]: target.checked });
                    }
                },
            }),
        ]);

    return api.ui.h("section", { className: "scf-settings" }, [
        api.ui.h(
            "p",
            null,
            "Use safe XML-style formatting tags in chat messages. Unknown tags are shown as text.",
        ),
        checkbox(
            "Enable formatter",
            "Render allowed formatting tags in messages.",
            "enabled",
        ),
        checkbox(
            "Enable markdown",
            "Parse common markdown such as **bold**, lists, and quotes.",
            "markdown",
        ),
        checkbox(
            "Enable XML-style tags",
            'Parse tags such as <font color="red">.',
            "xmlTags",
        ),
        checkbox(
            "Enable links",
            "Render safe http, https, and mailto markdown links.",
            "links",
        ),
        checkbox(
            "Enable images",
            "Render safe markdown images from http, https, or local URLs.",
            "images",
        ),
        checkbox(
            "Enable code blocks",
            "Render fenced markdown code blocks.",
            "codeBlocks",
        ),
        checkbox(
            "Scroll code blocks",
            "Keep long fenced code lines on one line with horizontal scrolling.",
            "codeBlockScrolling",
        ),
        checkbox(
            "Enable spoilers",
            "Render <spoiler>hidden text</spoiler> as click-to-reveal.",
            "spoilers",
        ),
        checkbox(
            "Show unknown tags",
            "Keep unsupported tags visible instead of silently removing them.",
            "preserveUnknownTags",
        ),
        api.ui.h("p", { className: "scf-settings-status", id: statusId }, ""),
    ]);
}
