import type { ComponentChild } from "preact";

import type { ScyllaPluginApi } from "#frontend/lib/plugins/types";

export type FormatterBreak = {
    type: "break";
};

export type FormatterNode = ComponentChild | FormatterBreak;
export type FormatterApi = ScyllaPluginApi;

export function isFormatterBreak(node: FormatterNode): node is FormatterBreak {
    return Boolean(
        node && typeof node === "object" && "type" in node && node.type === "break",
    );
}

export function splitTextByNewline(text: string) {
    return text.split(/(\n)/).filter(Boolean);
}

export function withInlineLineBreaks(api: FormatterApi, inputNodes: FormatterNode[]) {
    const outputNodes: ComponentChild[] = [];

    for (const node of inputNodes) {
        if (isFormatterBreak(node)) {
            outputNodes.push(api.ui.h("br", null));
            continue;
        }

        if (typeof node !== "string") {
            outputNodes.push(node);
            continue;
        }

        for (const part of splitTextByNewline(node)) {
            outputNodes.push(part === "\n" ? api.ui.h("br", null) : part);
        }
    }

    return outputNodes;
}

export function paragraphize(api: FormatterApi, nodes: FormatterNode[]) {
    const paragraphs: ComponentChild[] = [];
    let current: ComponentChild[] = [];
    let breakCount = 0;

    const flush = () => {
        if (current.length) {
            paragraphs.push(api.ui.h("p", null, current));
            current = [];
        }
    };

    for (const node of nodes) {
        if (isFormatterBreak(node)) {
            breakCount += 1;

            if (breakCount >= 2) {
                flush();
            } else {
                current.push(api.ui.h("br", null));
            }
            continue;
        }

        const parts = typeof node === "string" ? splitTextByNewline(node) : [node];

        for (const part of parts) {
            if (part === "\n") {
                breakCount += 1;

                if (breakCount >= 2) {
                    flush();
                } else {
                    current.push(api.ui.h("br", null));
                }
            } else {
                breakCount = 0;
                current.push(part);
            }
        }
    }

    flush();

    return paragraphs.length ? paragraphs : [api.ui.h("p", null, "")];
}
