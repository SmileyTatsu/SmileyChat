import type { FormatterApi } from "./nodes";
import type { FormatterSettings } from "./settings";
import { getFormatterSettings } from "./settings";

export function renderSettingsPanel(
    api: FormatterApi,
    currentSettings?: FormatterSettings,
    updateSettings?: (patch: Partial<FormatterSettings>) => void,
) {
    const active = currentSettings ?? getFormatterSettings();

    const checkbox = (
        label: string,
        description: string,
        key: keyof Omit<FormatterSettings, "version">,
    ) =>
        api.ui.h("label", { className: "scf-setting-row" }, [
            api.ui.h("span", null, [
                api.ui.h("span", null, label),
                api.ui.h("small", null, description),
            ]),
            api.ui.h("input", {
                type: "checkbox",
                checked: Boolean(active[key]),
                onChange: (event: Event) => {
                    const target = event.currentTarget;
                    if (target instanceof HTMLInputElement) {
                        updateSettings?.({ [key]: target.checked });
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
        api.ui.h("div", { className: "scf-settings-card" }, [
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
        ]),
    ]);
}
