import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
    getActiveDialogStack,
    isTopmostDialog,
    popDialog,
    pushDialog,
    resetDialogStackForTesting,
} from "./dialog-manager";

describe("dialog-manager", () => {
    let origDoc: any;

    beforeEach(() => {
        resetDialogStackForTesting();
        origDoc = (globalThis as any).document;
        (globalThis as any).document = {
            body: {
                style: {
                    overflow: "",
                },
            },
        };
    });

    afterEach(() => {
        (globalThis as any).document = origDoc;
        resetDialogStackForTesting();
    });

    test("tracks pushed and popped dialogs in order", () => {
        expect(getActiveDialogStack().length).toBe(0);

        pushDialog("dialog-1");
        expect(getActiveDialogStack()).toEqual(["dialog-1"]);
        expect(isTopmostDialog("dialog-1")).toBe(true);
        expect(isTopmostDialog("dialog-2")).toBe(false);

        pushDialog("dialog-2");
        expect(getActiveDialogStack()).toEqual(["dialog-1", "dialog-2"]);
        expect(isTopmostDialog("dialog-1")).toBe(false);
        expect(isTopmostDialog("dialog-2")).toBe(true);

        popDialog("dialog-2");
        expect(getActiveDialogStack()).toEqual(["dialog-1"]);
        expect(isTopmostDialog("dialog-1")).toBe(true);

        popDialog("dialog-1");
        expect(getActiveDialogStack().length).toBe(0);
        expect(isTopmostDialog("dialog-1")).toBe(false);
    });

    test("popDialog does not decrement scroll lock count on unknown id", () => {
        pushDialog("dialog-1");
        expect(document.body.style.overflow).toBe("hidden");

        // Popping a non-existent ID should return early without modifying scroll lock count
        popDialog("non-existent-id");
        expect(getActiveDialogStack()).toEqual(["dialog-1"]);
        expect(document.body.style.overflow).toBe("hidden");

        // Popping the valid ID should unlock
        popDialog("dialog-1");
        expect(getActiveDialogStack().length).toBe(0);
        expect(document.body.style.overflow).toBe("");
    });

    test("handles scroll lock reference counting across multiple dialogs", () => {
        expect(document.body.style.overflow).toBe("");

        pushDialog("dialog-1");
        expect(document.body.style.overflow).toBe("hidden");

        pushDialog("dialog-2");
        expect(document.body.style.overflow).toBe("hidden");

        popDialog("dialog-2");
        // Still locked because dialog-1 is open
        expect(document.body.style.overflow).toBe("hidden");

        popDialog("dialog-1");
        // All dialogs closed, unlocked
        expect(document.body.style.overflow).toBe("");
    });

    test("handles out-of-order unmounting safely", () => {
        pushDialog("dialog-1");
        pushDialog("dialog-2");
        pushDialog("dialog-3");

        popDialog("dialog-2");
        expect(getActiveDialogStack()).toEqual(["dialog-1", "dialog-3"]);
        expect(isTopmostDialog("dialog-3")).toBe(true);
        expect(isTopmostDialog("dialog-1")).toBe(false);
    });
});
