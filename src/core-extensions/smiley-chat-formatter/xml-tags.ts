import { FormatterApi, FormatterNode, withInlineLineBreaks } from "./nodes";
import { safeColor, safeSize } from "./safety";
import { getFormatterSettings } from "./settings";

type TagFrame = {
    name: string;
    attrs: Record<string, string>;
    openToken: string;
    children: FormatterNode[];
};

const tagPattern = /<\/?[A-Za-z][A-Za-z0-9_-]*(?:\s+[^<>]{0,240})?\s*\/?>|<br\s*\/?>/gi;
const knownTags = new Set([
    "b",
    "bold",
    "i",
    "italic",
    "u",
    "s",
    "strike",
    "small",
    "big",
    "font",
    "color",
    "center",
    "left",
    "right",
    "spoiler",
    "code",
    "quote",
    "br",
]);

export function parseXmlNodeList(api: FormatterApi, nodes: FormatterNode[]) {
    const root = createFrame("root", {}, "");
    const stack = [root];

    for (const node of nodes) {
        if (typeof node === "string") {
            parseXmlStringIntoStack(api, stack, node);
        } else {
            stack[stack.length - 1].children.push(node);
        }
    }

    while (stack.length > 1) {
        const frame = stack.pop();
        if (!frame) {
            break;
        }
        appendLiteralTag(stack[stack.length - 1], frame.openToken);
        stack[stack.length - 1].children.push(...frame.children);
    }

    return root.children;
}

function parseXmlStringIntoStack(api: FormatterApi, stack: TagFrame[], content: string) {
    let index = 0;

    for (const match of content.matchAll(tagPattern)) {
        const token = match[0];
        const tokenIndex = match.index ?? 0;

        appendText(stack[stack.length - 1], content.slice(index, tokenIndex));
        handleTagToken(api, stack, token);
        index = tokenIndex + token.length;
    }

    appendText(stack[stack.length - 1], content.slice(index));
}

function handleTagToken(api: FormatterApi, stack: TagFrame[], token: string) {
    const parsed = parseTagToken(token);

    if (!parsed || !knownTags.has(parsed.name)) {
        if (getFormatterSettings().preserveUnknownTags) {
            appendLiteralTag(stack[stack.length - 1], token);
        }
        return;
    }

    if (parsed.name === "br") {
        stack[stack.length - 1].children.push({ type: "break" });
        return;
    }

    if (parsed.closing) {
        closeFrame(api, stack, parsed.name, token);
        return;
    }

    if (parsed.selfClosing) {
        stack[stack.length - 1].children.push(
            renderTag(api, parsed.name, parsed.attrs, []),
        );
        return;
    }

    stack.push(createFrame(parsed.name, parsed.attrs, token));
}

function parseTagToken(token: string) {
    const match = token.match(
        /^<\s*(\/)?\s*([A-Za-z][A-Za-z0-9_-]*)([\s\S]*?)(\/)?\s*>$/,
    );

    if (!match) {
        return undefined;
    }

    return {
        closing: Boolean(match[1]),
        name: match[2].toLowerCase(),
        attrs: parseAttributes(match[3] ?? ""),
        selfClosing: Boolean(match[4]),
    };
}

function parseAttributes(source: string) {
    const attrs: Record<string, string> = {};
    const attrPattern =
        /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/g;

    for (const match of source.matchAll(attrPattern)) {
        attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
    }

    return attrs;
}

function closeFrame(
    api: FormatterApi,
    stack: TagFrame[],
    name: string,
    closingToken: string,
) {
    const index = findOpenFrameIndex(stack, name);

    if (index < 1) {
        if (getFormatterSettings().preserveUnknownTags) {
            appendLiteralTag(stack[stack.length - 1], closingToken);
        }
        return;
    }

    while (stack.length - 1 >= index) {
        const frame = stack.pop();

        if (!frame) {
            return;
        }

        const rendered = renderTag(api, frame.name, frame.attrs, frame.children);
        stack[stack.length - 1].children.push(rendered);

        if (frame.name === name || tagAliases(frame.name).includes(name)) {
            return;
        }
    }
}

function findOpenFrameIndex(stack: TagFrame[], name: string) {
    for (let index = stack.length - 1; index >= 1; index -= 1) {
        const frame = stack[index];
        if (frame.name === name || tagAliases(frame.name).includes(name)) {
            return index;
        }
    }

    return -1;
}

function tagAliases(name: string) {
    if (name === "b") return ["bold"];
    if (name === "bold") return ["b"];
    if (name === "i") return ["italic"];
    if (name === "italic") return ["i"];
    if (name === "s") return ["strike"];
    if (name === "strike") return ["s"];
    return [];
}

function createFrame(
    name: string,
    attrs: Record<string, string>,
    openToken: string,
): TagFrame {
    return {
        name,
        attrs,
        openToken,
        children: [],
    };
}

function appendText(frame: TagFrame, text: string) {
    if (text) {
        frame.children.push(text);
    }
}

function appendLiteralTag(frame: TagFrame, token: string) {
    if (token) {
        frame.children.push(token);
    }
}

function renderTag(
    api: FormatterApi,
    name: string,
    attrs: Record<string, string>,
    children: FormatterNode[],
): FormatterNode {
    const renderedChildren = withInlineLineBreaks(api, children);

    if (name === "b" || name === "bold")
        return api.ui.h("strong", null, renderedChildren);
    if (name === "i" || name === "italic") return api.ui.h("em", null, renderedChildren);
    if (name === "u") return api.ui.h("u", null, renderedChildren);
    if (name === "s" || name === "strike") return api.ui.h("s", null, renderedChildren);
    if (name === "small") return api.ui.h("small", null, renderedChildren);
    if (name === "big")
        return api.ui.h("span", { className: "scf-font-large" }, renderedChildren);
    if (name === "center")
        return api.ui.h("span", { className: "scf-align-center" }, renderedChildren);
    if (name === "left")
        return api.ui.h("span", { className: "scf-align-left" }, renderedChildren);
    if (name === "right")
        return api.ui.h("span", { className: "scf-align-right" }, renderedChildren);
    if (name === "code")
        return api.ui.h("code", { className: "scf-code" }, renderedChildren);
    if (name === "quote")
        return api.ui.h("span", { className: "scf-quote" }, renderedChildren);

    if (name === "spoiler") {
        if (!getFormatterSettings().spoilers) {
            return renderedChildren;
        }

        return api.ui.h(
            "span",
            {
                "aria-expanded": "false",
                className: "scf-spoiler",
                role: "button",
                tabIndex: 0,
                onClick: revealSpoiler,
                onKeyDown: (event: KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        revealSpoiler(event);
                    }
                },
            },
            renderedChildren,
        );
    }

    if (name === "font") {
        const style: Record<string, string> = {};
        const classNames: string[] = [];
        const color = safeColor(attrs.color);
        const size = safeSize(attrs.size);

        if (color) {
            style.color = color;
        }

        if (size) {
            classNames.push(`scf-font-${size}`);
        }

        return api.ui.h(
            "span",
            {
                className: classNames.join(" ") || undefined,
                style,
            },
            renderedChildren,
        );
    }

    if (name === "color") {
        const color = safeColor(attrs.value ?? attrs.name ?? attrs.color);
        return api.ui.h(
            "span",
            { style: color ? { color } : undefined },
            renderedChildren,
        );
    }

    return renderedChildren;
}

function revealSpoiler(event: Event) {
    const target = event.currentTarget;

    if (!(target instanceof HTMLElement)) {
        return;
    }

    target.classList.add("is-revealed");
    target.setAttribute("aria-expanded", "true");
}
