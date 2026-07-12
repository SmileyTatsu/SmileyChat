import { describe, expect, test } from "bun:test";

import { defaultCharacter } from "./defaults";
import {
    getCharacterDialogueColor,
    normalizeTavernCardData,
    setCharacterDialogueColor,
} from "./normalize";

describe("character dialogue colors", () => {
    test("stores a normalized color in the SmileyChat card extension", () => {
        const character = {
            ...defaultCharacter,
            data: setCharacterDialogueColor(defaultCharacter.data, "#28A5D5"),
        };

        expect(getCharacterDialogueColor(character)).toBe("#28a5d5");
        expect(character.data.extensions.smileychat).toMatchObject({
            dialogueColor: "#28a5d5",
        });
    });

    test("clears invalid or removed colors without touching other extension data", () => {
        const dataWithColor = setCharacterDialogueColor(
            {
                ...defaultCharacter.data,
                extensions: {
                    smileychat: { tagline: "A quiet traveler", dialogueColor: "#abcdef" },
                    "example-plugin": { enabled: true },
                },
            },
            undefined,
        );

        expect(
            getCharacterDialogueColor({ ...defaultCharacter, data: dataWithColor }),
        ).toBe(undefined);
        expect(dataWithColor.extensions.smileychat).toEqual({
            tagline: "A quiet traveler",
        });
        expect(dataWithColor.extensions["example-plugin"]).toEqual({ enabled: true });
    });

    test("drops an invalid imported dialogue color from the SmileyChat namespace", () => {
        const data = normalizeTavernCardData({
            ...defaultCharacter.data,
            extensions: { smileychat: { dialogueColor: "orange" } },
        });

        expect(data.extensions.smileychat).toEqual({});
    });
});
