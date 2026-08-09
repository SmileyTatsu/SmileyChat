export type TextFormattingResult = {
    selectionEnd: number;
    selectionStart: number;
    value: string;
};

export type TextFormattingHotkey = Pick<
    KeyboardEvent,
    "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey"
>;

type TextSelection = {
    selectionEnd: number;
    selectionStart: number;
    value: string;
};

export function applyTextFormatting(
    { value, selectionStart, selectionEnd }: TextSelection,
    prefix: string,
    suffix = prefix,
): TextFormattingResult {
    const start = clampSelectionOffset(value, selectionStart);
    const end = Math.max(start, clampSelectionOffset(value, selectionEnd));
    const selectedText = value.slice(start, end);
    const nextValue = `${value.slice(0, start)}${prefix}${selectedText}${suffix}${value.slice(end)}`;
    const nextSelectionStart = start + prefix.length;

    return {
        value: nextValue,
        selectionStart: nextSelectionStart,
        selectionEnd: start === end ? nextSelectionStart : end + prefix.length,
    };
}

export function applyBlockquoteFormatting({
    value,
    selectionStart,
    selectionEnd,
}: TextSelection): TextFormattingResult {
    const start = clampSelectionOffset(value, selectionStart);
    const end = Math.max(start, clampSelectionOffset(value, selectionEnd));
    const selectionHasText = start !== end;
    const firstLineStart = lineStartAt(value, start);
    const lastSelectedOffset = selectionHasText ? end - 1 : start;
    const finalLineStart = lineStartAt(value, lastSelectedOffset);
    const lineStarts = [firstLineStart];

    for (let offset = firstLineStart; offset < finalLineStart; offset += 1) {
        if (value[offset] === "\n") {
            lineStarts.push(offset + 1);
        }
    }

    let nextValue = value;
    for (let index = lineStarts.length - 1; index >= 0; index -= 1) {
        const lineStart = lineStarts[index];
        nextValue = `${nextValue.slice(0, lineStart)}> ${nextValue.slice(lineStart)}`;
    }

    const insertedLength = lineStarts.length * 2;
    return {
        value: nextValue,
        selectionStart: selectionHasText ? firstLineStart : start + 2,
        selectionEnd: selectionHasText ? end + insertedLength : start + 2,
    };
}

export function getTextFormattingHotkeyResult(
    event: TextFormattingHotkey,
    selection: TextSelection,
): TextFormattingResult | undefined {
    const primaryModifier = (event.ctrlKey || event.metaKey) && !event.altKey;

    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        return event.code === "KeyQ" ? applyBlockquoteFormatting(selection) : undefined;
    }

    if (!primaryModifier) {
        return undefined;
    }

    if (!event.shiftKey) {
        if (event.code === "KeyB") return applyTextFormatting(selection, "**");
        if (event.code === "KeyI") return applyTextFormatting(selection, "*");
        if (event.code === "KeyU") return applyTextFormatting(selection, "<u>", "</u>");
        return undefined;
    }

    if (event.code === "KeyX") return applyTextFormatting(selection, "~~");
    if (event.code === "KeyC") return applyTextFormatting(selection, "`");
    if (event.code === "KeyK") return applyTextFormatting(selection, "```\n", "\n```");
    if (event.code === "KeyP") return applyTextFormatting(selection, "||");
    if (event.code === "Digit9") return applyBlockquoteFormatting(selection);
    if (event.code === "Digit2" || event.code === "Quote") {
        return applyTextFormatting(selection, '"');
    }

    return undefined;
}

export function restoreTextareaSelection(
    textarea: HTMLTextAreaElement,
    result: TextFormattingResult,
) {
    requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
}

function clampSelectionOffset(value: string, offset: number) {
    return Math.max(0, Math.min(value.length, offset));
}

function lineStartAt(value: string, offset: number) {
    return value.lastIndexOf("\n", Math.max(0, offset) - 1) + 1;
}
