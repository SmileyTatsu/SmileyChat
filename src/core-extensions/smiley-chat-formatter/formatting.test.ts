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

    test("uses the resolved character color for quoted dialogue", () => {
        setFormatterSettings(defaultFormatterSettings);

        const nodes = renderFormatted(
            api,
            '"A custom color stays limited to dialogue."',
            {
                highlightQuotes: true,
                italicizeMessages: true,
            },
            "#28a5d5",
        );
        const quote = findNodeByClass(nodes, "message-quoted-text");

        expect((quote?.props as { style?: unknown } | undefined)?.style).toEqual({
            color: "#28a5d5",
        });
    });

    test("renders GFM-style tables with alignment and escaped pipes", () => {
        setFormatterSettings(defaultFormatterSettings);

        const nodes = renderFormatted(
            api,
            "| Name | Score |\n| :--- | ---: |\n| A\\|B | **42** |\n| C | 7 |",
            { highlightQuotes: false, italicizeMessages: true },
        );
        const table = findNodeByType(nodes, "table");
        const cells = findNodesByType(nodes, "td");

        expect(table).toBeTruthy();
        expect(textFromNode(table)).toBe("NameScoreA|B42C7");
        expect((cells[1]?.props as { style?: unknown }).style).toEqual({
            textAlign: "right",
        });
        expect(findNodesByType(nodes, "th")[0]?.key).toBe("header-0");
        expect(findNodesByType(nodes, "tr")[1]?.key).toBe("row-0");
    });

    test("accepts single-hyphen GFM table delimiters", () => {
        setFormatterSettings(defaultFormatterSettings);

        const nodes = renderFormatted(api, "| A | B |\n| :- | -: |\n| left | right |", {
            highlightQuotes: false,
            italicizeMessages: true,
        });

        expect(findNodeByType(nodes, "table")).toBeTruthy();
    });

    test("renders horizontal rules and all supported heading depths", () => {
        setFormatterSettings(defaultFormatterSettings);

        const nodes = renderFormatted(
            api,
            "#### Detail\n---\n##### Smaller\n***\n###### Smallest\n___",
            { highlightQuotes: false, italicizeMessages: true },
        );

        expect(findNodesByType(nodes, "hr")).toHaveLength(3);
        expect(findNodesByType(nodes, "h6")).toHaveLength(3);
        expect(findNodeByClassPart(nodes, "scf-heading-level-6")).toBeTruthy();
    });

    test("renders nested lists and read-only task indicators", () => {
        setFormatterSettings(defaultFormatterSettings);

        const nodes = renderFormatted(
            api,
            "- Parent\n  1. Child\n     - [x] Done\n     - [ ] Next\n- Final",
            { highlightQuotes: false, italicizeMessages: true },
        );
        const checkboxes = findNodesByType(nodes, "input");

        expect(findNodesByType(nodes, "ul")).toHaveLength(2);
        expect(findNodesByType(nodes, "ol")).toHaveLength(1);
        expect(checkboxes).toHaveLength(2);
        expect(
            (checkboxes[0].props as { checked?: unknown; disabled?: unknown }).checked,
        ).toBe(true);
        expect(
            (checkboxes[0].props as { checked?: unknown; disabled?: unknown }).disabled,
        ).toBe(true);
        expect((checkboxes[1].props as { checked?: unknown }).checked).toBe(false);
        expect((checkboxes[0].props as { readOnly?: unknown }).readOnly).toBe(true);
    });

    test("keeps uneven nested lists under their parent and preserves continuation text", () => {
        setFormatterSettings(defaultFormatterSettings);

        const nodes = renderFormatted(
            api,
            "- Root\n    - Deep child\n  - Shallow child\n- This item\n  continues on a second line\n- Final",
            { highlightQuotes: false, italicizeMessages: true },
        );
        const rootList = findNodesByType(nodes, "ul")[0];

        expect(findNodesByType(nodes, "ul")).toHaveLength(3);
        expect(textFromNode(rootList)).toBe(
            "RootDeep childShallow childThis itemcontinues on a second lineFinal",
        );
        expect(findNodesByType(nodes, "p")).toHaveLength(0);
    });

    test("keeps escaped markdown punctuation literal", () => {
        setFormatterSettings(defaultFormatterSettings);

        const nodes = renderFormatted(
            api,
            "\\*literal\\* and \\_plain\\_ and \\~tilde\\~ but *emphasis*",
            { highlightQuotes: false, italicizeMessages: true },
        );

        expect(textFromNode(nodes[0])).toBe(
            "*literal* and _plain_ and ~tilde~ but emphasis",
        );
        expect(findNodesByType(nodes, "em")).toHaveLength(1);
    });

    test("preserves escapes and private-use characters inside inline code", () => {
        setFormatterSettings(defaultFormatterSettings);
        const privateUseCharacter = String.fromCharCode(0xe000);

        const nodes = renderFormatted(
            api,
            `Use \`a\\*b${privateUseCharacter}\` and \\*outside\\*`,
            { highlightQuotes: false, italicizeMessages: true },
        );
        const code = findNodeByType(nodes, "code");

        expect(textFromNode(code)).toBe(`a\\*b${privateUseCharacter}`);
        expect(textFromNode(nodes[0])).toBe(
            `Use a\\*b${privateUseCharacter} and *outside*`,
        );
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

function findNodeByClassPart(
    nodes: FormatterNode[],
    className: string,
): VNode | undefined {
    for (const node of nodes) {
        const match = findNode(node, (candidate) =>
            Boolean(
                (candidate.props as { className?: string } | undefined)?.className
                    ?.split(" ")
                    .includes(className),
            ),
        );

        if (match) {
            return match;
        }
    }

    return undefined;
}

function findNodesByType(nodes: FormatterNode[], type: string) {
    const matches: VNode[] = [];

    for (const node of nodes) {
        collectNodes(node, (candidate) => candidate.type === type, matches);
    }

    return matches;
}

function collectNodes(
    node: FormatterNode | ComponentChild | undefined,
    predicate: (node: VNode) => boolean,
    matches: VNode[],
) {
    if (!node || typeof node !== "object" || isFormatterBreak(node)) {
        return;
    }

    const vnode = node as VNode;
    if (predicate(vnode)) {
        matches.push(vnode);
    }

    for (const child of childrenOf(vnode)) {
        collectNodes(child, predicate, matches);
    }
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
