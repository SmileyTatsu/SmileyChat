import type { ComponentChild } from "preact";

import { FormatterApi, FormatterNode, withInlineLineBreaks } from "./nodes";
import { safeImageUrl, safeUrl } from "./safety";
import { getFormatterSettings } from "./settings";

type InlineRenderer = (content: string) => FormatterNode[];
type ListMatch = {
    indent: number;
    ordered: boolean;
    content: string;
    start?: number;
};

const markdownTokenPattern =
    /(`[^`\n]+`|\*\*\*[\s\S]+?\*\*\*|___[\s\S]+?___|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*|_[^_\n]+?_|!\[[^\]\n]*\]\([^) \n]+(?:\s+"[^"\n]{0,120}")?\)|\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"\n]{0,120}")?\))/g;
const escapableMarkdownCharacters = "\\!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

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

            const codeBlockClass = getFormatterSettings().codeBlockScrolling
                ? "scf-code-block scf-code-block-scroll"
                : "scf-code-block";

            blocks.push(
                api.ui.h("pre", { className: codeBlockClass }, [
                    language
                        ? api.ui.h("span", { className: "scf-code-language" }, language)
                        : null,
                    api.ui.h("code", null, codeLines.join("\n")),
                ]),
            );
            continue;
        }

        const table = parseTable(api, lines, index, renderInlineContent);
        if (table) {
            flushParagraph();
            blocks.push(table.node);
            index = table.nextIndex;
            continue;
        }

        if (isHorizontalRule(line)) {
            flushParagraph();
            blocks.push(api.ui.h("hr", { className: "scf-rule" }));
            index += 1;
            continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            flushParagraph();
            const level = heading[1].length;
            blocks.push(
                api.ui.h(
                    `h${Math.min(level + 2, 6)}`,
                    { className: `scf-heading scf-heading-level-${level}` },
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

        const list = parseListBlock(api, lines, index, renderInlineContent);
        if (list) {
            flushParagraph();
            blocks.push(list.node);
            index = list.nextIndex;
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
    let plainText = "";

    const flushPlainText = () => {
        if (!plainText) return;

        let index = 0;
        for (const match of plainText.matchAll(markdownTokenPattern)) {
            const token = match[0];
            const tokenIndex = match.index ?? 0;

            if (tokenIndex > index) {
                nodes.push(plainText.slice(index, tokenIndex));
            }

            nodes.push(renderMarkdownToken(api, token, renderInlineContent));
            index = tokenIndex + token.length;
        }

        if (index < plainText.length) {
            nodes.push(plainText.slice(index));
        }

        plainText = "";
    };

    for (let index = 0; index < text.length; index += 1) {
        if (text[index] === "`") {
            const closingIndex = text.indexOf("`", index + 1);

            if (closingIndex > index + 1) {
                flushPlainText();
                nodes.push(
                    api.ui.h(
                        "code",
                        { className: "scf-code" },
                        text.slice(index + 1, closingIndex),
                    ),
                );
                index = closingIndex;
                continue;
            }
        }

        if (
            text[index] === "\\" &&
            text[index + 1] &&
            escapableMarkdownCharacters.includes(text[index + 1])
        ) {
            flushPlainText();
            nodes.push(text[index + 1]);
            index += 1;
            continue;
        }

        plainText += text[index];
    }

    flushPlainText();

    return nodes.length ? nodes : [text];
}

function parseTable(
    api: FormatterApi,
    lines: string[],
    index: number,
    renderInlineContent: InlineRenderer,
) {
    if (index + 1 >= lines.length) {
        return undefined;
    }

    const headers = splitTableRow(lines[index]);
    const delimiters = splitTableRow(lines[index + 1]);

    if (
        !headers ||
        !delimiters ||
        !headers.length ||
        headers.length !== delimiters.length ||
        !delimiters.every((cell) => /^:?-+:?$/.test(cell))
    ) {
        return undefined;
    }

    const alignments = delimiters.map(tableAlignment);
    const rows: string[][] = [];
    let nextIndex = index + 2;

    while (nextIndex < lines.length) {
        const row = splitTableRow(lines[nextIndex]);
        if (!row) {
            break;
        }

        rows.push(row);
        nextIndex += 1;
    }

    const cellStyle = (columnIndex: number) =>
        alignments[columnIndex] ? { textAlign: alignments[columnIndex] } : undefined;
    const normalizedRow = (row: string[]) =>
        headers.map((_, columnIndex) => row[columnIndex] ?? "");

    return {
        nextIndex,
        node: api.ui.h(
            "div",
            {
                "aria-label": "Markdown table",
                className: "scf-table-wrap",
                role: "region",
                tabIndex: 0,
            },
            [
                api.ui.h("table", { className: "scf-table" }, [
                    api.ui.h("thead", null, [
                        api.ui.h(
                            "tr",
                            null,
                            headers.map((header, columnIndex) =>
                                api.ui.h(
                                    "th",
                                    {
                                        key: `header-${columnIndex}`,
                                        scope: "col",
                                        style: cellStyle(columnIndex),
                                    },
                                    renderInlineContent(header),
                                ),
                            ),
                        ),
                    ]),
                    rows.length
                        ? api.ui.h(
                              "tbody",
                              null,
                              rows.map((row, rowIndex) =>
                                  api.ui.h(
                                      "tr",
                                      { key: `row-${rowIndex}` },
                                      normalizedRow(row).map((cell, columnIndex) =>
                                          api.ui.h(
                                              "td",
                                              {
                                                  key: `cell-${rowIndex}-${columnIndex}`,
                                                  style: cellStyle(columnIndex),
                                              },
                                              renderInlineContent(cell),
                                          ),
                                      ),
                                  ),
                              ),
                          )
                        : null,
                ]),
            ],
        ),
    };
}

function splitTableRow(line: string) {
    if (!hasUnescapedPipe(line)) {
        return undefined;
    }

    const trimmed = line.trim();
    const cells: string[] = [];
    let cell = "";

    for (let index = 0; index < trimmed.length; index += 1) {
        const character = trimmed[index];

        if (character === "\\" && index + 1 < trimmed.length) {
            cell += character + trimmed[index + 1];
            index += 1;
        } else if (character === "|") {
            cells.push(cell.trim());
            cell = "";
        } else {
            cell += character;
        }
    }

    cells.push(cell.trim());

    if (trimmed.startsWith("|")) {
        cells.shift();
    }
    if (endsWithUnescapedPipe(trimmed)) {
        cells.pop();
    }

    return cells;
}

function hasUnescapedPipe(value: string) {
    return splitTableRowCandidate(value);
}

function splitTableRowCandidate(value: string) {
    for (let index = 0; index < value.length; index += 1) {
        if (value[index] === "\\") {
            index += 1;
        } else if (value[index] === "|") {
            return true;
        }
    }

    return false;
}

function endsWithUnescapedPipe(value: string) {
    if (!value.endsWith("|")) {
        return false;
    }

    let slashCount = 0;
    for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index -= 1) {
        slashCount += 1;
    }

    return slashCount % 2 === 0;
}

function tableAlignment(delimiter: string) {
    if (delimiter.startsWith(":") && delimiter.endsWith(":")) return "center";
    if (delimiter.startsWith(":")) return "left";
    if (delimiter.endsWith(":")) return "right";
    return undefined;
}

function isHorizontalRule(line: string) {
    return (
        /^\s{0,3}(?:-\s*){3,}$/.test(line) ||
        /^\s{0,3}(?:\*\s*){3,}$/.test(line) ||
        /^\s{0,3}(?:_\s*){3,}$/.test(line)
    );
}

function parseListBlock(
    api: FormatterApi,
    lines: string[],
    startIndex: number,
    renderInlineContent: InlineRenderer,
    expectedIndent?: number,
) {
    const first =
        startIndex < lines.length ? matchListItem(lines[startIndex]) : undefined;
    if (!first || (expectedIndent !== undefined && first.indent !== expectedIndent)) {
        return undefined;
    }

    const items: ComponentChild[] = [];
    const listIndent = first.indent;
    const ordered = first.ordered;
    let nextIndex = startIndex;
    let hasTaskItems = false;

    while (nextIndex < lines.length) {
        const item = matchListItem(lines[nextIndex]);
        if (!item || item.indent !== listIndent || item.ordered !== ordered) {
            break;
        }

        const itemLines = [item.content];
        nextIndex += 1;

        while (nextIndex < lines.length) {
            const nextLine = lines[nextIndex];
            const nextItem = matchListItem(nextLine);

            if (nextItem || !nextLine.trim() || leadingIndent(nextLine) <= listIndent) {
                break;
            }

            itemLines.push(nextLine.trim());
            nextIndex += 1;
        }

        const itemContent = itemLines.join("\n");
        const task = itemContent.match(/^\[([ xX])\]\s+([\s\S]+)$/);
        const children: ComponentChild[] = [];
        if (task) {
            hasTaskItems = true;
            children.push(
                api.ui.h("label", { className: "scf-task-label" }, [
                    api.ui.h("input", {
                        "aria-label":
                            task[1].toLowerCase() === "x"
                                ? "Completed task"
                                : "Incomplete task",
                        checked: task[1].toLowerCase() === "x",
                        disabled: true,
                        readOnly: true,
                        type: "checkbox",
                    }),
                    api.ui.h(
                        "span",
                        null,
                        joinInlineLines(
                            api,
                            task[2].trim().split("\n"),
                            renderInlineContent,
                        ),
                    ),
                ]),
            );
        } else {
            children.push(...joinInlineLines(api, itemLines, renderInlineContent));
        }

        while (nextIndex < lines.length) {
            const nestedFirst = matchListItem(lines[nextIndex]);
            if (!nestedFirst || nestedFirst.indent <= listIndent) {
                break;
            }

            const nested = parseListBlock(api, lines, nextIndex, renderInlineContent);
            if (!nested) {
                break;
            }

            children.push(nested.node);
            nextIndex = nested.nextIndex;
        }

        items.push(api.ui.h("li", null, children));
    }

    if (!items.length) {
        return undefined;
    }

    return {
        indent: listIndent,
        nextIndex,
        node: api.ui.h(
            ordered ? "ol" : "ul",
            {
                className: hasTaskItems ? "scf-list scf-task-list" : "scf-list",
                ...(ordered && first.start !== 1 ? { start: first.start } : {}),
            },
            items,
        ),
    };
}

function matchListItem(line: string): ListMatch | undefined {
    const match = line.match(/^(\s*)(?:(\d+)[.)]|[-*+])\s+(.+)$/);
    if (!match) {
        return undefined;
    }

    return {
        content: match[3],
        indent: indentWidth(match[1]),
        ordered: Boolean(match[2]),
        start: match[2] ? Number(match[2]) : undefined,
    };
}

function indentWidth(value: string) {
    return [...value].reduce(
        (width, character) => width + (character === "\t" ? 4 : 1),
        0,
    );
}

function leadingIndent(value: string) {
    return indentWidth(value.match(/^\s*/)?.[0] ?? "");
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
