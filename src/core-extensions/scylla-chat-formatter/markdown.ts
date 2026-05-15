import type { ComponentChild } from "preact";

import { FormatterApi, FormatterNode, withInlineLineBreaks } from "./nodes";
import { safeImageUrl, safeUrl } from "./safety";
import { getFormatterSettings } from "./settings";

type InlineRenderer = (content: string) => FormatterNode[];

const markdownTokenPattern =
    /(`[^`\n]+`|\*\*\*[\s\S]+?\*\*\*|___[\s\S]+?___|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*|_[^_\n]+?_|!\[[^\]\n]*\]\([^) \n]+(?:\s+"[^"\n]{0,120}")?\)|\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"\n]{0,120}")?\))/g;

export function renderMarkdownBlocks(
    api: FormatterApi,
    content: string,
    renderInlineContent: InlineRenderer,
) {
    const lines = content.replace(/\r\n?/g, "\n").split("\n");
    const blocks: ComponentChild[] = [];
    let paragraphLines: string[] = [];
    let index = 0;

    const flushParagraph = () => {
        if (paragraphLines.length) {
            blocks.push(
                api.ui.h(
                    "p",
                    null,
                    joinInlineLines(api, paragraphLines, renderInlineContent),
                ),
            );
            paragraphLines = [];
        }
    };

    while (index < lines.length) {
        const line = lines[index];

        if (!line.trim()) {
            flushParagraph();
            index += 1;
            continue;
        }

        if (getFormatterSettings().codeBlocks && line.trim().startsWith("```")) {
            flushParagraph();
            const language = line
                .trim()
                .slice(3)
                .trim()
                .replace(/[^\w.+#-]/g, "");
            const codeLines: string[] = [];
            index += 1;

            while (index < lines.length && !lines[index].trim().startsWith("```")) {
                codeLines.push(lines[index]);
                index += 1;
            }

            if (index < lines.length) {
                index += 1;
            }

            blocks.push(
                api.ui.h("pre", { className: "scf-code-block" }, [
                    language
                        ? api.ui.h("span", { className: "scf-code-language" }, language)
                        : null,
                    api.ui.h("code", null, codeLines.join("\n")),
                ]),
            );
            continue;
        }

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            flushParagraph();
            blocks.push(
                api.ui.h(
                    `h${Math.min(heading[1].length + 2, 5)}`,
                    { className: "scf-heading" },
                    renderInlineContent(heading[2].trim()),
                ),
            );
            index += 1;
            continue;
        }

        if (/^\s*>\s?/.test(line)) {
            flushParagraph();
            const quoteLines: string[] = [];

            while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
                quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
                index += 1;
            }

            blocks.push(
                api.ui.h("blockquote", { className: "scf-md-quote" }, [
                    api.ui.h(
                        "p",
                        null,
                        joinInlineLines(api, quoteLines, renderInlineContent),
                    ),
                ]),
            );
            continue;
        }

        const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
        if (unordered || ordered) {
            flushParagraph();
            const orderedList = Boolean(ordered);
            const items: ComponentChild[] = [];

            while (index < lines.length) {
                const itemMatch = orderedList
                    ? lines[index].match(/^\s*\d+[.)]\s+(.+)$/)
                    : lines[index].match(/^\s*[-*+]\s+(.+)$/);

                if (!itemMatch) {
                    break;
                }

                items.push(
                    api.ui.h("li", null, renderInlineContent(itemMatch[1].trim())),
                );
                index += 1;
            }

            blocks.push(
                api.ui.h(orderedList ? "ol" : "ul", { className: "scf-list" }, items),
            );
            continue;
        }

        paragraphLines.push(line);
        index += 1;
    }

    flushParagraph();

    return blocks.length ? blocks : [api.ui.h("p", null, "")];
}

export function parseInlineMarkdown(
    api: FormatterApi,
    text: string,
    renderInlineContent: InlineRenderer,
) {
    if (!getFormatterSettings().markdown) {
        return [text];
    }

    const nodes: FormatterNode[] = [];
    let index = 0;

    for (const match of text.matchAll(markdownTokenPattern)) {
        const token = match[0];
        const tokenIndex = match.index ?? 0;

        if (tokenIndex > index) {
            nodes.push(text.slice(index, tokenIndex));
        }

        nodes.push(renderMarkdownToken(api, token, renderInlineContent));
        index = tokenIndex + token.length;
    }

    if (index < text.length) {
        nodes.push(text.slice(index));
    }

    return nodes.length ? nodes : [text];
}

function joinInlineLines(
    api: FormatterApi,
    lines: string[],
    renderInlineContent: InlineRenderer,
) {
    return withInlineLineBreaks(api, renderInlineContent(lines.join("\n")));
}

function renderMarkdownToken(
    api: FormatterApi,
    token: string,
    renderInlineContent: InlineRenderer,
): FormatterNode {
    if (token.startsWith("`") && token.endsWith("`")) {
        return api.ui.h("code", { className: "scf-code" }, token.slice(1, -1));
    }

    if (
        (token.startsWith("***") && token.endsWith("***")) ||
        (token.startsWith("___") && token.endsWith("___"))
    ) {
        return api.ui.h(
            "strong",
            null,
            api.ui.h("em", null, renderInlineContent(token.slice(3, -3))),
        );
    }

    if (
        (token.startsWith("**") && token.endsWith("**")) ||
        (token.startsWith("__") && token.endsWith("__"))
    ) {
        return api.ui.h("strong", null, renderInlineContent(token.slice(2, -2)));
    }

    if (token.startsWith("~~") && token.endsWith("~~")) {
        return api.ui.h("s", null, renderInlineContent(token.slice(2, -2)));
    }

    if (
        (token.startsWith("*") && token.endsWith("*")) ||
        (token.startsWith("_") && token.endsWith("_"))
    ) {
        return api.ui.h("em", null, renderInlineContent(token.slice(1, -1)));
    }

    const imageMatch = token.match(
        /^!\[([^\]\n]*)\]\(([^) \n]+)(?:\s+"([^"\n]{0,120})")?\)$/,
    );
    if (imageMatch && getFormatterSettings().images) {
        const src = safeImageUrl(imageMatch[2]);

        if (src) {
            return api.ui.h("img", {
                alt: imageMatch[1],
                className: "scf-image",
                loading: "lazy",
                src,
                title: imageMatch[3] || undefined,
            });
        }
    }

    const linkMatch = token.match(
        /^\[([^\]\n]+)\]\(([^) \n]+)(?:\s+"([^"\n]{0,120})")?\)$/,
    );
    if (linkMatch && getFormatterSettings().links) {
        const href = safeUrl(linkMatch[2]);

        if (href) {
            return api.ui.h(
                "a",
                {
                    className: "scf-link",
                    href,
                    rel: "noreferrer",
                    target: "_blank",
                    title: linkMatch[3] || undefined,
                },
                renderInlineContent(linkMatch[1]),
            );
        }
    }

    return token;
}
