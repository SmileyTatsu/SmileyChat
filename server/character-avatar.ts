import { characterToSummary } from "#frontend/lib/characters/normalize";

import {
    avatarTypeForContentType,
    deleteCharacterAvatarAsset,
    detectImageType,
    writeAvatarAssetBytes,
} from "./character-images";
import {
    characterBasePathById,
    readCharacterById,
    readCharacterSummaryCollection,
    writeCharacterWithBasePath,
} from "./character-store";
import { BadRequestError, NotFoundError } from "./http";
import { maxAvatarBytes } from "./paths";

export async function writeCharacterAvatar(characterId: string, request: Request) {
    const contentType = request.headers.get("Content-Type")?.split(";")[0].trim() ?? "";
    const avatarType = avatarTypeForContentType(contentType);

    if (!avatarType) {
        throw new BadRequestError("Avatar must be a PNG, JPEG, or WebP image.");
    }

    const bytes = new Uint8Array(await request.arrayBuffer());

    if (bytes.byteLength === 0) {
        throw new BadRequestError("Avatar image is empty.");
    }

    if (bytes.byteLength > maxAvatarBytes) {
        throw new BadRequestError("Avatar image is too large. Use an image under 20 MB.");
    }

    const detectedType = detectImageType(bytes);

    if (detectedType !== avatarType) {
        throw new BadRequestError("Avatar file content does not match its image type.");
    }

    const character = await readCharacterById(characterId);

    if (!character) {
        throw new NotFoundError("Character not found.");
    }

    const basePath = await characterBasePathById(characterId);
    const avatar = await writeAvatarAssetBytes(character, bytes, avatarType, basePath);
    const updatedCharacter = {
        ...character,
        avatar,
        updatedAt: new Date().toISOString(),
    };

    await writeCharacterWithBasePath(updatedCharacter, basePath);

    if (character.avatar && character.avatar.type !== avatarType) {
        await deleteCharacterAvatarAsset(character);
    }

    return {
        avatar,
        character: updatedCharacter,
        summary: characterToSummary(updatedCharacter),
        characters: await readCharacterSummaryCollection(),
    };
}
