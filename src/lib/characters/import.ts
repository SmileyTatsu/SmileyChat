import { isRecord } from "../common/guards";
import { createId } from "../common/ids";
import { normalizeTavernCardData } from "./normalize";
import type { CharacterImportFormat, SmileyCharacter, TavernCardDataV2 } from "./types";

type ImportCharacterOptions = {
    format: CharacterImportFormat;
    sourceFileName?: string;
    fingerprint?: string;
    avatarPath?: string;
    characterId?: string;
};

export function importCharacterCard(
    raw: unknown,
    options: ImportCharacterOptions,
): SmileyCharacter {
    const now = new Date().toISOString();
    const data = normalizeImportedCardData(raw);
    const characterId =
        safeImportedCharacterId(options.characterId) ??
        safeImportedCharacterId(smileychatCharacterIdFromRaw(raw)) ??
        createId("character");

    return {
        id: characterId,
        version: 1,
        data,
        ...(options.avatarPath
            ? {
                  avatar: {
                      type: "png" as const,
                      path: options.avatarPath,
                  },
              }
            : {}),
        importedFrom: {
            format: options.format,
            sourceFileName: options.sourceFileName,
            fingerprint: options.fingerprint,
            importedAt: now,
        },
        createdAt: now,
        updatedAt: now,
    };
}

export function smileychatCharacterIdFromRaw(raw: unknown) {
    const data = rawCardData(raw);
    const extensions = isRecord(data?.extensions) ? data.extensions : undefined;
    const smileychat = isRecord(extensions?.smileychat)
        ? extensions.smileychat
        : undefined;

    return typeof smileychat?.characterId === "string" ? smileychat.characterId : "";
}

export function normalizeImportedCardData(raw: unknown): TavernCardDataV2 {
    if (!isRecord(raw)) {
        throw new Error("Character card is not a JSON object.");
    }

    if (raw.spec === "chara_card_v3" && isRecord(raw.data)) {
        return normalizeTavernCardData(preserveV3Fields(raw.data), {
            repairText: true,
        });
    }

    if (raw.spec === "chara_card_v2" && isRecord(raw.data)) {
        return normalizeTavernCardData(raw.data, {
            repairText: true,
        });
    }

    if (!isTavernV1Card(raw)) {
        throw new Error("Character JSON is not a supported Tavern V1, V2, or V3 card.");
    }

    return normalizeTavernCardData(raw, {
        repairText: true,
    });
}

export function parseCharacterJson(text: string) {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new Error("Character JSON could not be parsed.");
    }
}

export function readPngCharacterJson(bytes: ArrayBuffer | Uint8Array) {
    const metadataValues = readPngTextMetadataValues(bytes, "chara");
    const metadata = metadataValues[metadataValues.length - 1];

    if (!metadata) {
        throw new Error('PNG does not contain a "chara" metadata field.');
    }

    return parseCharacterJson(decodeBase64Utf8(metadata));
}

export function readPngTextMetadata(bytes: ArrayBuffer | Uint8Array, keyword: string) {
    return readPngTextMetadataValues(bytes, keyword)[0] ?? "";
}

function readPngTextMetadataValues(bytes: ArrayBuffer | Uint8Array, keyword: string) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    const values: string[] = [];

    if (data.length < signature.length) {
        throw new Error("PNG file is too small.");
    }

    for (let index = 0; index < signature.length; index += 1) {
        if (data[index] !== signature[index]) {
            throw new Error("File is not a valid PNG.");
        }
    }

    let offset = signature.length;

    while (offset + 8 <= data.length) {
        const length = readUint32(data, offset);
        const type = ascii(data.slice(offset + 4, offset + 8));
        const chunkStart = offset + 8;
        const chunkEnd = chunkStart + length;

        if (chunkEnd + 4 > data.length) {
            throw new Error("PNG chunk data is incomplete.");
        }

        const chunk = data.slice(chunkStart, chunkEnd);
        const value = textChunkValue(type, chunk, keyword);

        if (value !== undefined) {
            values.push(value);
        }

        offset = chunkEnd + 4;
    }

    return values;
}

function isTavernV1Card(value: Record<string, unknown>) {
    return (
        typeof value.name === "string" &&
        ["description", "personality", "scenario", "first_mes", "mes_example"].some(
            (field) => typeof value[field] === "string",
        )
    );
}

function preserveV3Fields(data: Record<string, unknown>) {
    const {
        assets,
        nickname,
        creator_notes_multilingual,
        source,
        group_only_greetings,
        creation_date,
        modification_date,
        extensions,
        ...sharedData
    } = data;
    const existingExtensions = isRecord(extensions) ? extensions : {};
    const smileychat = isRecord(existingExtensions.smileychat)
        ? existingExtensions.smileychat
        : {};

    return {
        ...sharedData,
        extensions: {
            ...existingExtensions,
            smileychat: {
                ...smileychat,
                importedV3: {
                    assets,
                    nickname,
                    creator_notes_multilingual,
                    source,
                    group_only_greetings,
                    creation_date,
                    modification_date,
                },
            },
        },
    };
}

function rawCardData(raw: unknown): Record<string, unknown> | undefined {
    if (!isRecord(raw)) {
        return undefined;
    }

    return isRecord(raw.data) ? raw.data : raw;
}

function safeImportedCharacterId(value: string | undefined) {
    if (!value) {
        return undefined;
    }

    return /^character[-_a-zA-Z0-9.]+$/.test(value) ? value : undefined;
}

function textChunkValue(type: string, chunk: Uint8Array, keyword: string) {
    if (type === "tEXt") {
        const separator = chunk.indexOf(0);

        if (separator < 0) {
            return undefined;
        }

        const chunkKeyword = latin1(chunk.slice(0, separator));

        return chunkKeyword === keyword ? latin1(chunk.slice(separator + 1)) : undefined;
    }

    if (type === "iTXt") {
        const firstSeparator = chunk.indexOf(0);

        if (firstSeparator < 0 || latin1(chunk.slice(0, firstSeparator)) !== keyword) {
            return undefined;
        }

        const compressionFlag = chunk[firstSeparator + 1];

        if (compressionFlag !== 0) {
            throw new Error(
                "Compressed iTXt PNG character metadata is not supported yet.",
            );
        }

        let cursor = firstSeparator + 3;
        const languageEnd = chunk.indexOf(0, cursor);

        if (languageEnd < 0) {
            return undefined;
        }

        cursor = languageEnd + 1;
        const translatedKeywordEnd = chunk.indexOf(0, cursor);

        if (translatedKeywordEnd < 0) {
            return undefined;
        }

        return utf8(chunk.slice(translatedKeywordEnd + 1));
    }

    return undefined;
}

function readUint32(data: Uint8Array, offset: number) {
    return (
        data[offset] * 0x1000000 +
        ((data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3])
    );
}

function ascii(data: Uint8Array) {
    return String.fromCharCode(...data);
}

function latin1(data: Uint8Array) {
    return Array.from(data, (byte) => String.fromCharCode(byte)).join("");
}

function utf8(data: Uint8Array) {
    return new TextDecoder().decode(data);
}

function decodeBase64Utf8(value: string) {
    const normalized = value.trim();

    if (typeof atob === "function") {
        const binary = atob(normalized);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return utf8(bytes);
    }

    return Buffer.from(normalized, "base64").toString("utf8");
}
