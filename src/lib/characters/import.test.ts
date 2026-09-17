import { deflateSync } from "node:zlib";
import { describe, expect, test } from "bun:test";

import { readPngCharacterJson, readPngTextMetadata } from "./import";

const encoder = new TextEncoder();

describe("PNG character metadata", () => {
    test("decodes complete compressed character cards", () => {
        const card = { name: "Lúna 日本語", description: "A traveler" };
        const encoded = Buffer.from(JSON.stringify(card)).toString("base64");
        for (const [type, data] of [
            ["zTXt", zText("chara", encoded)],
            ["iTXt", iText("chara", encoded, true)],
            ["iTXt", iText("chara", encoded, false)],
        ] as const) {
            expect(readPngCharacterJson(pngWithChunk(type, data))).toEqual(card);
        }
        expect(
            readPngTextMetadata(
                pngWithChunk("iTXt", iText("note", "日本語", true)),
                "note",
            ),
        ).toBe("日本語");
    });

    test("rejects corrupt or oversized compressed metadata and ignores unrelated chunks", () => {
        const corrupt = join(encoder.encode("chara"), new Uint8Array([0, 0, 42]));
        expect(() => readPngTextMetadata(pngWithChunk("zTXt", corrupt), "chara")).toThrow(
            "could not be decompressed",
        );
        expect(readPngTextMetadata(pngWithChunk("zTXt", corrupt), "other")).toBe("");
        const oversized = zText("chara", "x".repeat(16 * 1024 * 1024 + 1));
        expect(() =>
            readPngTextMetadata(pngWithChunk("zTXt", oversized), "chara"),
        ).toThrow("16 MiB");
    });

    test("reads zTXt and compressed iTXt metadata", () => {
        expect(
            readPngTextMetadata(pngWithChunk("zTXt", zText("chara", "zipped")), "chara"),
        ).toBe("zipped");
        expect(
            readPngTextMetadata(
                pngWithChunk("iTXt", iText("chara", "zipped", true)),
                "chara",
            ),
        ).toBe("zipped");
    });
});

function zText(keyword: string, value: string) {
    return join(
        encoder.encode(keyword),
        new Uint8Array([0, 0]),
        deflateSync(encoder.encode(value)),
    );
}

function iText(keyword: string, value: string, compressed: boolean) {
    return join(
        encoder.encode(keyword),
        new Uint8Array([0, compressed ? 1 : 0, 0, 0, 0]),
        compressed ? deflateSync(encoder.encode(value)) : encoder.encode(value),
    );
}

function pngWithChunk(type: string, data: Uint8Array) {
    return join(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk(type, data),
        chunk("IEND", new Uint8Array()),
    );
}

function chunk(type: string, data: Uint8Array) {
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, data.length);
    return join(length, encoder.encode(type), data, new Uint8Array(4));
}

function join(...parts: Uint8Array[]) {
    const result = new Uint8Array(
        parts.reduce((length, part) => length + part.length, 0),
    );
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}
