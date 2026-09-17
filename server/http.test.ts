import { describe, expect, test } from "bun:test";
import { isCorruptJsonError } from "./http";

describe("isCorruptJsonError", () => {
    test("detects SyntaxError from JSON.parse", () => {
        let syntaxError: unknown;
        try {
            JSON.parse("{ invalid json");
        } catch (error) {
            syntaxError = error;
        }

        expect(isCorruptJsonError(syntaxError)).toBe(true);
    });

    test("detects SyntaxError from empty string", () => {
        let syntaxError: unknown;
        try {
            JSON.parse("");
        } catch (error) {
            syntaxError = error;
        }

        expect(isCorruptJsonError(syntaxError)).toBe(true);
    });

    test("rejects filesystem I/O errors (EACCES, EBUSY, EPERM, etc.)", () => {
        const ebusy = new Error("resource busy or locked");
        (ebusy as unknown as { code: string }).code = "EBUSY";
        expect(isCorruptJsonError(ebusy)).toBe(false);

        const eacces = new Error("permission denied");
        (eacces as unknown as { code: string }).code = "EACCES";
        expect(isCorruptJsonError(eacces)).toBe(false);

        const eperm = new Error("operation not permitted");
        (eperm as unknown as { code: string }).code = "EPERM";
        expect(isCorruptJsonError(eperm)).toBe(false);

        const errnoErr = new Error("system error");
        (errnoErr as unknown as { errno: number }).errno = -4082;
        expect(isCorruptJsonError(errnoErr)).toBe(false);
    });

    test("handles non-error and undefined inputs safely", () => {
        expect(isCorruptJsonError(undefined)).toBe(false);
        expect(isCorruptJsonError(null)).toBe(false);
        expect(isCorruptJsonError("random string")).toBe(false);
        expect(isCorruptJsonError(new Error("generic failure"))).toBe(false);
    });
});
