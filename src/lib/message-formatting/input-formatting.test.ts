import { describe, expect, test } from "bun:test";

import {
    applyBlockquoteFormatting,
    applyTextFormatting,
    getTextFormattingHotkeyResult,
} from "./input-formatting";

describe("chat input formatting", () => {
    const wrappers = [
        ["bold", "**", "**"],
        ["italic", "*", "*"],
        ["underline", "<u>", "</u>"],
        ["strikethrough", "~~", "~~"],
        ["inline code", "`", "`"],
        ["code block", "```\n", "\n```"],
        ["spoiler", "||", "||"],
        ["dialogue quote", '"', '"'],
    ] as const;

    test.each(wrappers)("wraps selected text with %s", (_name, prefix, suffix) => {
        expect(
            applyTextFormatting(
                { value: "hello", selectionStart: 1, selectionEnd: 4 },
                prefix,
                suffix,
            ),
        ).toEqual({
            value: `h${prefix}ell${suffix}o`,
            selectionStart: 1 + prefix.length,
            selectionEnd: 4 + prefix.length,
        });
    });

    test.each(wrappers)(
        "inserts empty %s markup at the cursor",
        (_name, prefix, suffix) => {
            expect(
                applyTextFormatting(
                    { value: "hello", selectionStart: 2, selectionEnd: 2 },
                    prefix,
                    suffix,
                ),
            ).toEqual({
                value: `he${prefix}${suffix}llo`,
                selectionStart: 2 + prefix.length,
                selectionEnd: 2 + prefix.length,
            });
        },
    );

    test("quotes every selected line and retains the quoted block selection", () => {
        expect(
            applyBlockquoteFormatting({
                value: "one\ntwo\nthree",
                selectionStart: 1,
                selectionEnd: 7,
            }),
        ).toEqual({
            value: "> one\n> two\nthree",
            selectionStart: 0,
            selectionEnd: 11,
        });
    });

    test("does not quote the next line when selection ends at its boundary", () => {
        expect(
            applyBlockquoteFormatting({
                value: "one\ntwo",
                selectionStart: 0,
                selectionEnd: 4,
            }),
        ).toEqual({
            value: "> one\ntwo",
            selectionStart: 0,
            selectionEnd: 6,
        });
    });

    test("quotes the current line when there is no selection", () => {
        expect(
            applyBlockquoteFormatting({
                value: "one\ntwo",
                selectionStart: 5,
                selectionEnd: 5,
            }),
        ).toEqual({ value: "one\n> two", selectionStart: 7, selectionEnd: 7 });
    });

    test("maps supported shortcuts to formatting results", () => {
        expect(
            getTextFormattingHotkeyResult(
                {
                    altKey: false,
                    code: "KeyB",
                    ctrlKey: true,
                    metaKey: false,
                    shiftKey: false,
                },
                { value: "word", selectionStart: 0, selectionEnd: 4 },
            ),
        ).toEqual({ value: "**word**", selectionStart: 2, selectionEnd: 6 });
        expect(
            getTextFormattingHotkeyResult(
                {
                    altKey: false,
                    code: "KeyP",
                    ctrlKey: false,
                    metaKey: true,
                    shiftKey: true,
                },
                { value: "", selectionStart: 0, selectionEnd: 0 },
            ),
        ).toEqual({ value: "||||", selectionStart: 2, selectionEnd: 2 });
        expect(
            getTextFormattingHotkeyResult(
                {
                    altKey: true,
                    code: "KeyQ",
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false,
                },
                { value: "line", selectionStart: 2, selectionEnd: 2 },
            ),
        ).toEqual({ value: "> line", selectionStart: 4, selectionEnd: 4 });
    });
});
