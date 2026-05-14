import { isRecord } from "../common/guards";
import { createId } from "../common/ids";
import { defaultCharacterData } from "./defaults";
import type {
    CharacterBook,
    CharacterBookEntry,
    CharacterCollection,
    CharacterSummary,
    CharacterSummaryCollection,
    CharacterImportFormat,
    SmileyCharacter,
    TavernCardDataV2,
} from "./types";

type NormalizeCharacterDataOptions = {
    repairText?: boolean;
};

const characterDataKeys = new Set([
    "name",
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
    "creator_notes",
    "system_prompt",
    "post_history_instructions",
    "alternate_greetings",
    "character_book",
    "tags",
    "creator",
    "character_version",
    "extensions",
    "tagline",
]);

export function normalizeCharacterCollection(value: unknown): CharacterCollection {
    if (!isRecord(value)) {
        return {
            version: 1,
            activeCharacterId: "",
            characters: [],
        };
    }

    const characters = Array.isArray(value.characters)
        ? value.characters
              .map(normalizeCharacter)
              .filter((character): character is SmileyCharacter => Boolean(character))
        : [];
    const safeCharacters = characters;
    const requestedActiveId = asString(value.activeCharacterId);
    const activeCharacterId = safeCharacters.some(
        (character) => character.id === requestedActiveId,
    )
        ? requestedActiveId
        : (safeCharacters[0]?.id ?? "");

    return {
        version: 1,
        activeCharacterId,
        characters: safeCharacters,
    };
}

export function normalizeCharacterSummaryCollection(
    value: unknown,
): CharacterSummaryCollection {
    if (!isRecord(value)) {
        return {
            version: 1,
            activeCharacterId: "",
            characters: [],
        };
    }

    const characters = Array.isArray(value.characters)
        ? value.characters
              .map(normalizeCharacterSummary)
              .filter((character): character is CharacterSummary => Boolean(character))
        : [];
    const safeCharacters = characters;
    const requestedActiveId = asString(value.activeCharacterId);
    const activeCharacterId = safeCharacters.some(
        (character) => character.id === requestedActiveId,
    )
        ? requestedActiveId
        : (safeCharacters[0]?.id ?? "");

    return {
        version: 1,
        activeCharacterId,
        characters: safeCharacters,
    };
}

export function normalizeCharacter(value: unknown): SmileyCharacter | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const now = new Date().toISOString();
    const id = asString(value.id) || createId("character");
    const avatar = normalizeAvatar(value.avatar);
    const importedFrom = normalizeImportedFrom(value.importedFrom);

    return {
        id,
        version: 1,
        data: normalizeTavernCardData(value.data),
        ...(avatar ? { avatar } : {}),
        ...(importedFrom ? { importedFrom } : {}),
        createdAt: asIsoString(value.createdAt) || now,
        updatedAt: asIsoString(value.updatedAt) || now,
    };
}

function normalizeCharacterSummary(value: unknown): CharacterSummary | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = asString(value.id);
    const name = asString(value.name);
    const avatar = normalizeAvatar(value.avatar);
    const importedFrom = normalizeImportedFrom(value.importedFrom);

    if (!id || !name) {
        return undefined;
    }

    return {
        id,
        name,
        tagline: asString(value.tagline),
        ...(avatar ? { avatar } : {}),
        ...(importedFrom ? { importedFrom } : {}),
        updatedAt: asString(value.updatedAt) || new Date().toISOString(),
    };
}

export function normalizeTavernCardData(
    value: unknown,
    options: NormalizeCharacterDataOptions = {},
): TavernCardDataV2 {
    const source = isRecord(value) ? value : {};
    const repairText = options.repairText === true;
    const extensions = isRecord(source.extensions) ? { ...source.extensions } : {};
    const importedTagline = cleanString(source.tagline, repairText).trim();
    const unknownDataFields = collectUnknownDataFields(source);

    if (importedTagline) {
        const smileychat = isRecord(extensions.smileychat) ? extensions.smileychat : {};
        const existingTagline = cleanString(smileychat.tagline, repairText).trim();

        extensions.smileychat = {
            ...smileychat,
            tagline: existingTagline || importedTagline,
        };
    }

    if (Object.keys(unknownDataFields).length > 0) {
        const smileychat = isRecord(extensions.smileychat) ? extensions.smileychat : {};
        extensions.smileychat = {
            ...smileychat,
            unknownDataFields: {
                ...(isRecord(smileychat.unknownDataFields)
                    ? smileychat.unknownDataFields
                    : {}),
                ...unknownDataFields,
            },
        };
    }

    const characterBook = normalizeCharacterBook(source.character_book, options);

    return {
        name: cleanString(source.name, repairText) || defaultCharacterData.name,
        description: cleanString(source.description, repairText),
        personality: cleanString(source.personality, repairText),
        scenario: cleanString(source.scenario, repairText),
        first_mes: cleanString(source.first_mes, repairText),
        mes_example: cleanString(source.mes_example, repairText),
        creator_notes: cleanString(source.creator_notes, repairText),
        system_prompt: cleanString(source.system_prompt, repairText),
        post_history_instructions: cleanString(
            source.post_history_instructions,
            repairText,
        ),
        alternate_greetings: asStringArray(source.alternate_greetings, repairText),
        ...(characterBook ? { character_book: characterBook } : {}),
        tags: asStringArray(source.tags, repairText),
        creator: cleanString(source.creator, repairText),
        character_version: cleanString(source.character_version, repairText),
        extensions,
    };
}

export function getCharacterTagline(character: SmileyCharacter) {
    const smileychat = getSmileychatExtension(character.data.extensions);
    const tagline = asString(smileychat.tagline).trim();

    if (tagline) {
        return tagline;
    }

    return character.data.description.trim().split(/\r?\n/)[0]?.slice(0, 90) ?? "";
}

export function getEditableCharacterTagline(character: SmileyCharacter) {
    const smileychat = getSmileychatExtension(character.data.extensions);

    if (typeof smileychat.tagline === "string") {
        return smileychat.tagline;
    }

    return character.data.description.trim().split(/\r?\n/)[0]?.slice(0, 90) ?? "";
}

export function characterToSummary(character: SmileyCharacter): CharacterSummary {
    return {
        id: character.id,
        name: character.data.name,
        tagline: getCharacterTagline(character),
        ...(character.avatar ? { avatar: character.avatar } : {}),
        ...(character.importedFrom ? { importedFrom: character.importedFrom } : {}),
        updatedAt: character.updatedAt,
    };
}

export function setCharacterTagline(
    data: TavernCardDataV2,
    tagline: string,
): TavernCardDataV2 {
    const smileychat = getSmileychatExtension(data.extensions);

    return {
        ...data,
        extensions: {
            ...data.extensions,
            smileychat: {
                ...smileychat,
                tagline,
            },
        },
    };
}

export function createBlankCharacter(name = "New character"): SmileyCharacter {
    const now = new Date().toISOString();

    return {
        id: createId("character"),
        version: 1,
        data: {
            ...defaultCharacterData,
            name,
            description: "",
            personality: "",
            scenario: "",
            first_mes: "",
            mes_example: "",
            creator_notes: "",
            system_prompt: "",
            post_history_instructions: "",
            alternate_greetings: [],
            tags: [],
            creator: "",
            character_version: "",
            extensions: {
                smileychat: {
                    tagline: "",
                },
            },
        },
        importedFrom: {
            format: "manual",
            importedAt: now,
        },
        createdAt: now,
        updatedAt: now,
    };
}

function normalizeAvatar(value: unknown): SmileyCharacter["avatar"] | undefined {
    if (
        !isRecord(value) ||
        (value.type !== "png" && value.type !== "jpeg" && value.type !== "webp")
    ) {
        return undefined;
    }

    const path = asString(value.path);

    return path ? { type: value.type, path } : undefined;
}

function normalizeImportedFrom(
    value: unknown,
): SmileyCharacter["importedFrom"] | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const format = asImportFormat(value.format);

    if (!format) {
        return undefined;
    }

    return {
        format,
        sourceFileName: asString(value.sourceFileName) || undefined,
        fingerprint: asString(value.fingerprint) || undefined,
        importedAt: asString(value.importedAt) || undefined,
    };
}

function asImportFormat(value: unknown): CharacterImportFormat | undefined {
    return value === "json" || value === "png" || value === "seed" || value === "manual"
        ? value
        : undefined;
}

function normalizeCharacterBook(
    value: unknown,
    options: NormalizeCharacterDataOptions,
): CharacterBook | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const repairText = options.repairText === true;
    const entries = Array.isArray(value.entries)
        ? value.entries
              .map((entry) => normalizeCharacterBookEntry(entry, options))
              .filter((entry): entry is CharacterBookEntry => Boolean(entry))
        : [];

    return {
        name: cleanString(value.name, repairText) || undefined,
        description: cleanString(value.description, repairText) || undefined,
        scan_depth: asOptionalNumber(value.scan_depth),
        token_budget: asOptionalNumber(value.token_budget),
        recursive_scanning:
            typeof value.recursive_scanning === "boolean"
                ? value.recursive_scanning
                : undefined,
        extensions: isRecord(value.extensions) ? { ...value.extensions } : {},
        entries,
    };
}

function normalizeCharacterBookEntry(
    value: unknown,
    options: NormalizeCharacterDataOptions,
): CharacterBookEntry | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const repairText = options.repairText === true;

    return {
        keys: asStringArray(value.keys, repairText),
        content: cleanString(value.content, repairText),
        extensions: isRecord(value.extensions) ? { ...value.extensions } : {},
        enabled: typeof value.enabled === "boolean" ? value.enabled : true,
        insertion_order: asNumber(value.insertion_order, 0),
        case_sensitive:
            typeof value.case_sensitive === "boolean" ? value.case_sensitive : undefined,
        name: cleanString(value.name, repairText) || undefined,
        priority: asOptionalNumber(value.priority),
        id: asOptionalNumber(value.id),
        comment: cleanString(value.comment, repairText) || undefined,
        selective: typeof value.selective === "boolean" ? value.selective : undefined,
        secondary_keys: Array.isArray(value.secondary_keys)
            ? asStringArray(value.secondary_keys, repairText)
            : undefined,
        constant: typeof value.constant === "boolean" ? value.constant : undefined,
        position:
            value.position === "before_char" || value.position === "after_char"
                ? value.position
                : undefined,
    };
}

function collectUnknownDataFields(source: Record<string, unknown>) {
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(source)) {
        if (!characterDataKeys.has(key)) {
            output[key] = value;
        }
    }

    return output;
}

function getSmileychatExtension(extensions: Record<string, unknown>) {
    return isRecord(extensions.smileychat) ? extensions.smileychat : {};
}

function asString(value: unknown) {
    return typeof value === "string" ? value : "";
}

function asIsoString(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    return Number.isFinite(Date.parse(value)) ? value : "";
}

function asStringArray(value: unknown, repairText = false) {
    return Array.isArray(value)
        ? value
              .filter((item): item is string => typeof item === "string")
              .map((item) => (repairText ? repairMojibake(item) : item))
        : [];
}

function cleanString(value: unknown, repairText = false) {
    const text = asString(value);
    return repairText ? repairMojibake(text) : text;
}

function repairMojibake(value: string) {
    if (!/[âÃÂ]/.test(value)) {
        return value;
    }

    const bytes = Uint8Array.from(value, windows1252ByteForCharacter);
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

    return repaired.includes("\uFFFD") ? value : repaired;
}

function windows1252ByteForCharacter(character: string) {
    const code = character.charCodeAt(0);
    const mapped = windows1252ReverseMap.get(code);

    if (mapped !== undefined) {
        return mapped;
    }

    return code <= 0xff ? code : 0x3f;
}

const windows1252ReverseMap = new Map<number, number>([
    [0x20ac, 0x80],
    [0x201a, 0x82],
    [0x0192, 0x83],
    [0x201e, 0x84],
    [0x2026, 0x85],
    [0x2020, 0x86],
    [0x2021, 0x87],
    [0x02c6, 0x88],
    [0x2030, 0x89],
    [0x0160, 0x8a],
    [0x2039, 0x8b],
    [0x0152, 0x8c],
    [0x017d, 0x8e],
    [0x2018, 0x91],
    [0x2019, 0x92],
    [0x201c, 0x93],
    [0x201d, 0x94],
    [0x2022, 0x95],
    [0x2013, 0x96],
    [0x2014, 0x97],
    [0x02dc, 0x98],
    [0x2122, 0x99],
    [0x0161, 0x9a],
    [0x203a, 0x9b],
    [0x0153, 0x9c],
    [0x017e, 0x9e],
    [0x0178, 0x9f],
]);

function asNumber(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
