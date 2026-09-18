import { describe, expect, test } from "bun:test";
import {
    downscaleImageBlob,
    IMAGE_COMPRESSION_QUALITY,
    MAX_IMAGE_DIMENSION,
} from "./image-downscale";

describe("image-downscale", () => {
    test("exports standard vision max dimension and quality constants", () => {
        expect(MAX_IMAGE_DIMENSION).toBe(1568);
        expect(IMAGE_COMPRESSION_QUALITY).toBe(0.85);
    });

    test("ignores non-image blobs safely", async () => {
        const textBlob = new Blob(["hello world"], { type: "text/plain" });
        const result = await downscaleImageBlob(textBlob);
        expect(result).toBe(textBlob);
    });

    test("ignores svg and gif formats safely", async () => {
        const svgBlob = new Blob(["<svg></svg>"], { type: "image/svg+xml" });
        const gifBlob = new Blob(["GIF89a"], { type: "image/gif" });
        expect(await downscaleImageBlob(svgBlob)).toBe(svgBlob);
        expect(await downscaleImageBlob(gifBlob)).toBe(gifBlob);
    });

    test("falls back safely to original blob when canvas/imageBitmap is not available", async () => {
        const pngBlob = new Blob([new Uint8Array([137, 80, 78, 71])], {
            type: "image/png",
        });
        const result = await downscaleImageBlob(pngBlob);
        expect(result).toBe(pngBlob);
    });
});
