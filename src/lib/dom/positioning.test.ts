import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { clampMenuPosition } from "./positioning";

describe("clampMenuPosition", () => {
    test("keeps coordinates unchanged when the menu fits comfortably within bounds", () => {
        const result = clampMenuPosition(100, 200, 180, 150, 12, {
            width: 1000,
            height: 800,
        });

        expect(result).toEqual({ x: 100, y: 200 });
    });

    test("clamps coordinates at extreme bottom-right viewport edge", () => {
        const result = clampMenuPosition(1000, 800, 200, 150, 12, {
            width: 1000,
            height: 800,
        });

        // 1000 - 200 - 12 = 788
        // 800 - 150 - 12 = 638
        expect(result).toEqual({ x: 788, y: 638 });
    });

    test("clamps coordinates at extreme top-left viewport edge", () => {
        const result = clampMenuPosition(0, 0, 200, 150, 12, {
            width: 1000,
            height: 800,
        });

        expect(result).toEqual({ x: 12, y: 12 });
    });

    test("clamps negative coordinates to padding", () => {
        const result = clampMenuPosition(-50, -100, 200, 150, 12, {
            width: 1000,
            height: 800,
        });

        expect(result).toEqual({ x: 12, y: 12 });
    });

    test("respects custom padding", () => {
        const resultTopLeft = clampMenuPosition(5, 5, 200, 150, 24, {
            width: 1000,
            height: 800,
        });
        expect(resultTopLeft).toEqual({ x: 24, y: 24 });

        const resultBottomRight = clampMenuPosition(990, 790, 200, 150, 24, {
            width: 1000,
            height: 800,
        });
        // 1000 - 200 - 24 = 776
        // 800 - 150 - 24 = 626
        expect(resultBottomRight).toEqual({ x: 776, y: 626 });
    });

    test("respects explicit left and top bounds offsets (e.g. pinch-zoom)", () => {
        const result = clampMenuPosition(500, 600, 150, 100, 12, {
            left: 50,
            top: 100,
            width: 400,
            height: 300,
        });

        // Horizontal: left 50 + width 400 = max edge 450; 450 - 150 - 12 = 288
        // Vertical: top 100 + height 300 = max edge 400; 400 - 100 - 12 = 288
        expect(result).toEqual({ x: 288, y: 288 });
    });

    test("handles invalid or negative padding safely", () => {
        const resultNegative = clampMenuPosition(5, 5, 200, 150, -10, {
            width: 1000,
            height: 800,
        });
        expect(resultNegative).toEqual({ x: 5, y: 5 });

        const resultNaN = clampMenuPosition(5, 5, 200, 150, Number.NaN, {
            width: 1000,
            height: 800,
        });
        expect(resultNaN).toEqual({ x: 12, y: 12 });
    });

    test("handles viewports smaller than menu dimensions safely", () => {
        const result = clampMenuPosition(50, 50, 300, 400, 12, {
            width: 200,
            height: 250,
        });

        expect(result).toEqual({ x: 12, y: 12 });
    });

    test("handles non-finite coordinates and dimensions safely", () => {
        const result = clampMenuPosition(
            Number.NaN,
            Number.POSITIVE_INFINITY,
            -50,
            Number.NaN,
            12,
            {
                width: 1000,
                height: 800,
            },
        );

        expect(result).toEqual({ x: 12, y: 12 });
    });

    describe("with window globals", () => {
        const originalInnerWidth = globalThis.window?.innerWidth;
        const originalInnerHeight = globalThis.window?.innerHeight;
        const originalVisualViewport = globalThis.window?.visualViewport;

        beforeEach(() => {
            if (!globalThis.window) {
                globalThis.window = {} as unknown as Window & typeof globalThis;
            }
            (globalThis.window as unknown as { innerWidth: number }).innerWidth = 1920;
            (globalThis.window as unknown as { innerHeight: number }).innerHeight = 1080;
            (
                globalThis.window as unknown as { visualViewport?: unknown }
            ).visualViewport = undefined;
        });

        afterEach(() => {
            if (globalThis.window) {
                (globalThis.window as unknown as { innerWidth?: number }).innerWidth =
                    originalInnerWidth;
                (globalThis.window as unknown as { innerHeight?: number }).innerHeight =
                    originalInnerHeight;
                (
                    globalThis.window as unknown as { visualViewport?: unknown }
                ).visualViewport = originalVisualViewport;
            }
        });

        test("defaults to window.innerWidth and window.innerHeight when bounds and visualViewport are omitted", () => {
            const result = clampMenuPosition(1920, 1080, 200, 300, 12);

            // 1920 - 200 - 12 = 1708
            // 1080 - 300 - 12 = 768
            expect(result).toEqual({ x: 1708, y: 768 });
        });

        test("automatically respects visualViewport dimensions and scroll offsets", () => {
            (globalThis.window as unknown as { visualViewport: unknown }).visualViewport =
                {
                    width: 400,
                    height: 450, // e.g. Virtual keyboard open
                    offsetLeft: 20,
                    offsetTop: 50,
                };

            const result = clampMenuPosition(1000, 1000, 180, 200, 12);

            // X: 20 + 400 - 180 - 12 = 228
            // Y: 50 + 450 - 200 - 12 = 288
            expect(result).toEqual({ x: 228, y: 288 });
        });

        test("falls back to window dimensions when bounds properties are NaN or invalid", () => {
            const result = clampMenuPosition(1920, 1080, 200, 300, 12, {
                width: Number.NaN,
                height: Number.NaN,
            });

            expect(result).toEqual({ x: 1708, y: 768 });
        });

        test("handles negative explicit bounds safely", () => {
            const result = clampMenuPosition(100, 100, 200, 300, 12, {
                width: -500,
                height: -300,
            });

            expect(result).toEqual({ x: 100, y: 100 });
        });
    });
});
