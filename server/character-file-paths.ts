import { isAbsolute, join, normalize, relative } from "node:path";
import { assertSafeEntityId } from "./entity-id";
import { BadRequestError } from "./http";
import { userDataDir } from "./paths";

export const characterDataFileName = "character.json";

export function characterDataPath(basePath: string) {
    return join(characterBaseDirectoryPath(basePath), characterDataFileName);
}

export function characterAvatarFileName(type: "png" | "jpeg" | "webp") {
    return `avatar.${type === "jpeg" ? "jpg" : type}`;
}

export function characterAvatarPath(basePath: string, type: "png" | "jpeg" | "webp") {
    return join(characterBaseDirectoryPath(basePath), characterAvatarFileName(type));
}

export function characterBasePath(folderName: string) {
    return `./library/${folderName}`;
}

export function characterBaseDirectoryPath(basePath: string) {
    const requestedPath = normalize(join(userDataDir, "characters", basePath));
    const safeCharactersDir = normalize(join(userDataDir, "characters"));
    const relativePath = relative(safeCharactersDir, requestedPath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        throw new BadRequestError("Character base path is outside userData/characters.");
    }

    return requestedPath;
}

export function characterFolderName(name: string, characterId: string) {
    assertSafeEntityId(characterId, "character");
    const slug = slugCharacterName(name);
    return `${slug}-${shortCharacterId(characterId)}`;
}

export function characterIdFromPath(pathname: string) {
    const match = pathname.match(/^\/api\/characters\/([^/]+)$/);

    if (!match) {
        return "";
    }

    return decodeURIComponent(match[1]);
}

export function characterAvatarIdFromPath(pathname: string) {
    const match = pathname.match(/^\/api\/characters\/([^/]+)\/avatar$/);

    if (!match) {
        return "";
    }

    return decodeURIComponent(match[1]);
}

export function characterExportFromPath(pathname: string) {
    const match = pathname.match(/^\/api\/characters\/([^/]+)\/export\.(json|png)$/);

    if (!match) {
        return undefined;
    }

    return {
        characterId: decodeURIComponent(match[1]),
        format: match[2] as "json" | "png",
    };
}

export function safeFileStem(value: string) {
    return value.replace(/[^a-zA-Z0-9_.-]/g, "_") || "character";
}

export function slugCharacterName(value: string) {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 72);

    return slug || "character";
}

export function shortCharacterId(characterId: string) {
    const withoutPrefix = characterId.replace(/^character[-_]?/i, "");
    return withoutPrefix.split(/[-_.]/)[0]?.slice(0, 8) || characterId.slice(0, 8);
}
