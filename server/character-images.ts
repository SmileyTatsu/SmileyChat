import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { BadRequestError, contentTypeFor } from "./http";
import { maxAvatarBytes } from "./paths";
import {
    characterAvatarPath,
    characterBaseDirectoryPath,
    characterBasePath,
    characterFolderName,
} from "./character-file-paths";
import { characterBasePathById } from "./character-store";
import type { SmileyCharacter } from "../src/lib/characters/types";

export type AvatarType = NonNullable<SmileyCharacter["avatar"]>["type"];

export async function deleteCharacterAvatarAsset(character: SmileyCharacter) {
    if (!character.avatar) {
        return;
    }

    const basePath = await characterBasePathById(character.id);

    if (!basePath) {
        return;
    }

    await rm(characterAvatarPath(basePath, character.avatar.type), { force: true });
}

export async function characterAvatarFilePath(character: SmileyCharacter) {
    if (!character.avatar) {
        return "";
    }

    const basePath = await characterBasePathById(character.id);
    const requestedPath = basePath
        ? characterAvatarPath(basePath, character.avatar.type)
        : "";

    if (!requestedPath || !existsSync(requestedPath)) {
        return "";
    }

    return requestedPath;
}

export async function writeAvatarAssetBytes(
    character: Pick<SmileyCharacter, "id" | "data">,
    bytes: Uint8Array,
    avatarType: AvatarType,
    basePath = "",
) {
    if (bytes.byteLength === 0) {
        throw new BadRequestError("Avatar image is empty.");
    }

    if (bytes.byteLength > maxAvatarBytes) {
        throw new BadRequestError("Avatar image is too large. Use an image under 20 MB.");
    }

    if (detectImageType(bytes) !== avatarType) {
        throw new BadRequestError("Avatar file content is not a valid image.");
    }

    const targetBasePath =
        basePath ||
        characterBasePath(characterFolderName(character.data.name, character.id));
    const targetDirectory = characterBaseDirectoryPath(targetBasePath);

    await mkdir(targetDirectory, { recursive: true });
    await Bun.write(characterAvatarPath(targetBasePath, avatarType), bytes);

    return {
        type: avatarType,
        path: `/api/characters/${encodeURIComponent(character.id)}/avatar`,
    };
}

export async function serveCharacterAvatar(character: SmileyCharacter) {
    const path = await characterAvatarFilePath(character);

    if (!path) {
        return new Response("Not found", { status: 404 });
    }

    return new Response(Bun.file(path), {
        headers: {
            "Content-Type": contentTypeFor(path),
        },
    });
}

export function avatarTypeForContentType(contentType: string): AvatarType | "" {
    if (contentType === "image/png") {
        return "png";
    }

    if (contentType === "image/jpeg") {
        return "jpeg";
    }

    if (contentType === "image/webp") {
        return "webp";
    }

    return "";
}

export function detectImageType(bytes: Uint8Array): AvatarType | "" {
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return "png";
    }

    if (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
    ) {
        return "jpeg";
    }

    if (
        bytes.length >= 12 &&
        asciiBytes(bytes.slice(0, 4)) === "RIFF" &&
        asciiBytes(bytes.slice(8, 12)) === "WEBP"
    ) {
        return "webp";
    }

    return "";
}

function asciiBytes(bytes: Uint8Array) {
    return String.fromCharCode(...bytes);
}
