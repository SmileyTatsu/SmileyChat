import { safeFileStem } from "./character-file-paths";
import { characterAvatarFilePath } from "./character-images";
import { readCharacterById } from "./character-store";
import { BadRequestError } from "./http";

export async function exportCharacterCard(characterId: string, format: "json" | "png") {
    const character = await readCharacterById(characterId);

    if (!character) {
        return new Response("Character not found", { status: 404 });
    }

    const card = {
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
            ...character.data,
            extensions: {
                ...character.data.extensions,
                scyllachat: {
                    ...(isRecord(character.data.extensions.scyllachat)
                        ? character.data.extensions.scyllachat
                        : {}),
                    characterId: character.id,
                },
            },
        },
    };
    const fileStem = safeFileStem(character.data.name || character.id);

    if (format === "json") {
        return new Response(`${JSON.stringify(card, null, 2)}\n`, {
            headers: {
                "Content-Disposition": `attachment; filename="${fileStem}.json"`,
                "Content-Type": "application/json; charset=utf-8",
            },
        });
    }

    if (character.avatar?.type !== "png") {
        return new Response("PNG export needs a PNG avatar.", { status: 400 });
    }

    const avatarPath = await characterAvatarFilePath(character);

    if (!avatarPath) {
        return new Response("PNG export needs an avatar.", { status: 400 });
    }

    const sourceBytes = new Uint8Array(await Bun.file(avatarPath).arrayBuffer());
    const pngBytes = writePngTextChunk(
        sourceBytes,
        "chara",
        Buffer.from(JSON.stringify(card), "utf8").toString("base64"),
    );

    return new Response(pngBytes, {
        headers: {
            "Content-Disposition": `attachment; filename="${fileStem}.png"`,
            "Content-Type": "image/png",
        },
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writePngTextChunk(sourceBytes: Uint8Array, keyword: string, text: string) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];

    for (let index = 0; index < signature.length; index += 1) {
        if (sourceBytes[index] !== signature[index]) {
            throw new BadRequestError("Avatar is not a valid PNG.");
        }
    }

    const chunkData = latin1Bytes(`${keyword}\0${text}`);
    const textChunk = createPngChunk("tEXt", chunkData);
    let offset = signature.length;
    const chunks = [sourceBytes.slice(0, signature.length)];

    while (offset + 8 <= sourceBytes.length) {
        const length = readUint32(sourceBytes, offset);
        const type = asciiBytes(sourceBytes.slice(offset + 4, offset + 8));
        const chunkStart = offset + 8;
        const chunkEnd = chunkStart + length;
        const chunkTotalEnd = chunkEnd + 4;

        if (chunkTotalEnd > sourceBytes.length) {
            throw new BadRequestError("PNG chunk data is incomplete.");
        }

        if (type === "IEND") {
            return concatBytes(...chunks, textChunk, sourceBytes.slice(offset));
        }

        if (
            pngTextChunkKeyword(type, sourceBytes.slice(chunkStart, chunkEnd)) !== keyword
        ) {
            chunks.push(sourceBytes.slice(offset, chunkTotalEnd));
        }

        offset = chunkTotalEnd;
    }

    throw new BadRequestError("PNG is missing IEND chunk.");
}

function pngTextChunkKeyword(type: string, chunk: Uint8Array) {
    if (type !== "tEXt" && type !== "iTXt") {
        return "";
    }

    const separator = chunk.indexOf(0);

    if (separator < 0) {
        return "";
    }

    return asciiBytes(chunk.slice(0, separator));
}

function createPngChunk(type: string, data: Uint8Array) {
    const typeBytes = latin1Bytes(type);
    const chunk = new Uint8Array(12 + data.length);

    writeUint32(chunk, 0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    writeUint32(chunk, 8 + data.length, crc32(concatBytes(typeBytes, data)));
    return chunk;
}

function concatBytes(...parts: Uint8Array[]) {
    const length = parts.reduce((total, part) => total + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;

    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }

    return output;
}

function latin1Bytes(value: string) {
    return Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff);
}

function readUint32(bytes: Uint8Array, offset: number) {
    return (
        bytes[offset] * 0x1000000 +
        ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
    );
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
}

function crc32(bytes: Uint8Array) {
    let crc = 0xffffffff;

    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function asciiBytes(bytes: Uint8Array) {
    return String.fromCharCode(...bytes);
}
