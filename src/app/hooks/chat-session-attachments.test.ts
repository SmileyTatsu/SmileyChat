import { describe, expect, test } from "bun:test";

import { generatedImageUrlToFile } from "./chat-session-attachments";

describe("generatedImageUrlToFile", () => {
    test("accepts safe raster data URLs", async () => {
        const file = await generatedImageUrlToFile(
            "data:image/png;base64,iVBORw0KGgo=",
            0,
        );

        expect(file.name).toBe("generated-image-1.png");
        expect(file.type).toBe("image/png");
    });

    test("rejects unsafe schemes and SVG data URLs", async () => {
        await expect(generatedImageUrlToFile("javascript:alert(1)", 0)).rejects.toThrow(
            "unsupported URL scheme",
        );
        await expect(
            generatedImageUrlToFile(
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
                0,
            ),
        ).rejects.toThrow("unsupported URL scheme");
    });
});
