import { describe, expect, test } from "bun:test";
import { h, type ComponentChild, type VNode } from "preact";

import { renderFormatted } from "./formatting";
import { defaultFormatterSettings, setFormatterSettings } from "./settings";
import { isFormatterBreak, type FormatterApi, type FormatterNode } from "./nodes";

const api = {
    ui: { h },
} as FormatterApi;

describe("smiley chat formatter", () => {
    test("highlights quoted text that contains markdown emphasis", () => {
        setFormatterSettings(defaultFormatterSettings);

        const nodes = renderFormatted(api, '"You\'re not *listening*."', {
            highlightQuotes: true,
            italicizeMessages: true,
        });
        const quote = findNodeByClass(nodes, "message-quoted-text");

        expect(quote).toBeTruthy();
        expect(textFromNode(quote)).toBe('"You\'re not listening."');
        expect(findNodeByType([quote], "em")).toBeTruthy();
    });

    test("highlights quotes when the closing quote immediately follows emphasis", () => {
        setFormatterSettings(defaultFormatterSettings);

        const nodes = renderFormatted(api, '"Try *now*"', {
            highlightQuotes: true,
            italicizeMessages: true,
        });
        const quote = findNodeByClass(nodes, "message-quoted-text");

        expect(quote).toBeTruthy();
        expect(textFromNode(quote)).toBe('"Try now"');
        expect(findNodeByType([quote], "em")).toBeTruthy();
    });
});

function findNodeByClass(nodes: FormatterNode[], className: string): VNode | undefined {
    for (const node of nodes) {
        const match = findNode(
            node,
            (candidate) =>
                (candidate.props as { className?: string } | undefined)?.className ===
                className,
        );

        if (match) {
            return match;
        }
    }

    return undefined;
}

function findNodeByType(nodes: FormatterNode[], type: string): VNode | undefined {
    for (const node of nodes) {
        const match = findNode(node, (candidate) => candidate.type === type);

        if (match) {
            return match;
        }
    }

    return undefined;
}

function findNode(
    node: FormatterNode | ComponentChild | undefined,
    predicate: (node: VNode) => boolean,
): VNode | undefined {
    if (!node || typeof node !== "object" || isFormatterBreak(node)) {
        return undefined;
    }

    const vnode = node as VNode;

    if (predicate(vnode)) {
        return vnode;
    }

    for (const child of childrenOf(vnode)) {
        const match = findNode(child, predicate);

        if (match) {
            return match;
        }
    }

    return undefined;
}

function textFromNode(node: FormatterNode | ComponentChild | undefined): string {
    if (typeof node === "string" || typeof node === "number") {
        return String(node);
    }

    if (!node || typeof node !== "object" || isFormatterBreak(node)) {
        return "";
    }

    return childrenOf(node as VNode)
        .map(textFromNode)
        .join("");
}

function childrenOf(node: VNode): ComponentChild[] {
    const children = node.props?.children;

    if (Array.isArray(children)) {
        return children;
    }

    return children === undefined || children === null ? [] : [children];
}
