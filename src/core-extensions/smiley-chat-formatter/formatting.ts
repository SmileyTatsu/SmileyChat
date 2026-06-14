import {
    renderQuotedText,
    type MessageFormattingOptions,
} from "#frontend/lib/message-formatting/quote-highlighting";

import { parseInlineMarkdown, renderMarkdownBlocks } from "./markdown";
import { FormatterApi, FormatterNode, paragraphize } from "./nodes";
import { getFormatterSettings } from "./settings";
import { parseXmlNodeList } from "./xml-tags";

export function renderFormatted(
    api: FormatterApi,
    content: string,
    formatting: MessageFormattingOptions,
) {
    if (getFormatterSettings().markdown) {
        return renderMarkdownBlocks(api, content, (inlineContent) =>
            renderInlineContent(api, inlineContent, formatting),
        );
    }

    return paragraphize(api, renderInlineContent(api, content, formatting));
}

export function renderPlain(
    api: FormatterApi,
    content: string,
    formatting: MessageFormattingOptions,
) {
    return paragraphize(api, highlightPlainTextNodes(api, [content], formatting));
}

function renderInlineContent(
    api: FormatterApi,
    content: string,
    formatting: MessageFormattingOptions,
): FormatterNode[] {
    const settings = getFormatterSettings();
    const markdownNodes = settings.markdown
        ? parseInlineMarkdown(api, content, (inlineContent) =>
              renderInlineContent(api, inlineContent, formatting),
          )
        : [content];

    const parsedNodes = settings.xmlTags
        ? parseXmlNodeList(api, markdownNodes)
        : markdownNodes;

    return highlightPlainTextNodes(api, parsedNodes, formatting);
}

function highlightPlainTextNodes(
    api: FormatterApi,
    nodes: FormatterNode[],
    formatting: MessageFormattingOptions,
): FormatterNode[] {
    if (!formatting.highlightQuotes) {
        return nodes;
    }

    return nodes.flatMap((node) =>
        typeof node === "string"
            ? renderQuotedText(api.ui.h, node, { enabled: true })
            : [node],
    );
}
