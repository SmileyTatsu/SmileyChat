import { describe, expect, test } from "bun:test";
import {
    downscaleImageBlob,
    imageDownscaleOptions,
    IMAGE_COMPRESSION_QUALITY,
    MAX_IMAGE_DIMENSION,
    setImageDownscaleOptions,
} from "./image-downscale";

describe("image-downscale", () => {
    test("exports standard vision max dimension and quality constants", () => {
        expect(MAX_IMAGE_DIMENSION).toBe(1568);
        expect(IMAGE_COMPRESSION_QUALITY).toBe(0.85);
    });

    test("publishes the preference for later encodes", () => {
        setImageDownscaleOptions({ maxDimension: 1024, quality: 0.7 });

        expect(imageDownscaleOptions()).toEqual({ maxDimension: 1024, quality: 0.7 });

        setImageDownscaleOptions({
            maxDimension: MAX_IMAGE_DIMENSION,
            quality: IMAGE_COMPRESSION_QUALITY,
        });
        expect(imageDownscaleOptions()).toEqual({
            maxDimension: MAX_IMAGE_DIMENSION,
            quality: IMAGE_COMPRESSION_QUALITY,
        });
    });

    test("sends the original blob when the dimension limit is disabled", async () => {
        const pngBlob = new Blob([new Uint8Array([137, 80, 78, 71])], {
            type: "image/png",
        });

        expect(await downscaleImageBlob(pngBlob, { maxDimension: 0 })).toBe(pngBlob);
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
