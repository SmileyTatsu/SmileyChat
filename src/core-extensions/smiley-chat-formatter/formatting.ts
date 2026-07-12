import {
    findQuotedTextRanges,
    renderQuotedText,
    type QuotedTextRange,
    type MessageFormattingOptions,
} from "#frontend/lib/message-formatting/quote-highlighting";
import type { ComponentChild, VNode } from "preact";

import { parseInlineMarkdown, renderMarkdownBlocks } from "./markdown";
import { FormatterApi, FormatterNode, isFormatterBreak, paragraphize } from "./nodes";
import { getFormatterSettings } from "./settings";
import { parseXmlNodeList } from "./xml-tags";

export function renderFormatted(
    api: FormatterApi,
    content: string,
    formatting: MessageFormattingOptions,
    dialogueColor?: string,
) {
    if (getFormatterSettings().markdown) {
        return renderMarkdownBlocks(api, content, (inlineContent) =>
            renderInlineContent(api, inlineContent, formatting, dialogueColor),
        );
    }

    return paragraphize(api, renderInlineContent(api, content, formatting, dialogueColor));
}

export function renderPlain(
    api: FormatterApi,
    content: string,
    formatting: MessageFormattingOptions,
    dialogueColor?: string,
) {
    return paragraphize(
        api,
        highlightPlainTextNodes(api, [content], formatting, dialogueColor),
    );
}

function renderInlineContent(
    api: FormatterApi,
    content: string,
    formatting: MessageFormattingOptions,
    dialogueColor?: string,
): FormatterNode[] {
    const settings = getFormatterSettings();
    const markdownNodes = settings.markdown
        ? parseInlineMarkdown(api, content, (inlineContent) =>
              renderInlineContent(api, inlineContent, formatting, dialogueColor),
          )
        : [content];

    const parsedNodes = settings.xmlTags
        ? parseXmlNodeList(api, markdownNodes)
        : markdownNodes;

    return highlightPlainTextNodes(api, parsedNodes, formatting, dialogueColor);
}

function highlightPlainTextNodes(
    api: FormatterApi,
    nodes: FormatterNode[],
    formatting: MessageFormattingOptions,
    dialogueColor?: string,
): FormatterNode[] {
    if (!formatting.highlightQuotes) {
        return nodes;
    }

    return highlightQuotedInlineNodes(api, nodes, dialogueColor);
}

function highlightQuotedInlineNodes(
    api: FormatterApi,
    nodes: FormatterNode[],
    dialogueColor?: string,
) {
    const plainText = nodes.map(textFromNode).join("");
    const quoteRanges = findQuotedTextRanges(plainText);

    if (!quoteRanges.length) {
        return nodes;
    }

    const output: FormatterNode[] = [];
    let quotedChildren: FormatterNode[] = [];
    let cursor = 0;
    let rangeIndex = 0;

    const flushQuote = () => {
        if (!quotedChildren.length) {
            return;
        }

        output.push(
            api.ui.h(
                "span",
                {
                    className: "message-quoted-text",
                    ...(dialogueColor ? { style: { color: dialogueColor } } : {}),
                },
                quotedChildren as ComponentChild[],
            ),
        );
        quotedChildren = [];
    };

    const pushNode = (node: FormatterNode, quoted: boolean) => {
        if (quoted) {
            quotedChildren.push(node);
            return;
        }

        flushQuote();
        output.push(node);
    };

    for (const node of nodes) {
        const nodeText = textFromNode(node);

        if (!nodeText) {
            pushNode(node, isPositionInRange(cursor, quoteRanges, rangeIndex));
            continue;
        }

        if (typeof node !== "string") {
            const nodeStart = cursor;
            const nodeEnd = cursor + nodeText.length;

            while (
                rangeIndex < quoteRanges.length &&
                quoteRanges[rangeIndex].end <= nodeStart
            ) {
                rangeIndex += 1;
            }

            const range = quoteRanges[rangeIndex];
            pushNode(
                node,
                Boolean(range && nodeStart >= range.start && nodeEnd <= range.end),
            );
            cursor = nodeEnd;
            continue;
        }

        let localCursor = 0;

        while (localCursor < node.length) {
            while (
                rangeIndex < quoteRanges.length &&
                quoteRanges[rangeIndex].end <= cursor + localCursor
            ) {
                rangeIndex += 1;
            }

            const range = quoteRanges[rangeIndex];
            const absoluteCursor = cursor + localCursor;
            const quoted = Boolean(
                range && absoluteCursor >= range.start && absoluteCursor < range.end,
            );
            const nextBoundary = quoted
                ? Math.min(range.end, cursor + node.length)
                : Math.min(range?.start ?? cursor + node.length, cursor + node.length);
            const nextLocalCursor = nextBoundary - cursor;

            pushNode(node.slice(localCursor, nextLocalCursor), quoted);
            localCursor = nextLocalCursor;
        }

        cursor += node.length;
    }

    flushQuote();

    return output.length ? output : nodes;
}

function isPositionInRange(
    position: number,
    ranges: QuotedTextRange[],
    rangeIndex: number,
) {
    const range = ranges[rangeIndex];

    return Boolean(range && position >= range.start && position < range.end);
}

function textFromNode(node: FormatterNode): string {
    if (typeof node === "string") {
        return node;
    }

    if (!node || typeof node !== "object" || isFormatterBreak(node)) {
        return "";
    }

    const children = (node as VNode<{ children?: ComponentChild }>).props?.children;

    if (Array.isArray(children)) {
        return children.map(textFromComponentChild).join("");
    }

    return textFromComponentChild(children);
}

function textFromComponentChild(node: ComponentChild | undefined): string {
    if (typeof node === "string" || typeof node === "number") {
        return String(node);
    }

    if (!node || typeof node !== "object") {
        return "";
    }

    const children = (node as VNode<{ children?: ComponentChild }>).props?.children;

    if (Array.isArray(children)) {
        return children.map(textFromComponentChild).join("");
    }

    return textFromComponentChild(children);
}
