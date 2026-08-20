import { describe, expect, test } from "bun:test";
import { resolveEffectiveStopSequences } from "./generation-settings";

describe("effective generation stop sequences", () => {
    test("combines preset, formatting, names, and model stops for text completion", () => {
        const stops = resolveEffectiveStopSequences({
            generation: { stopSequences: ["END"] },
            formatting: {
                namesAsStopStrings: true,
                separatorsAsStopStrings: true,
                singleLineMode: true,
                exampleSeparator: "***",
                chatStartSeparator: "START",
                instructTemplate: "auto",
            },
            characterName: "Luna",
            personaName: "Anon",
            groupMemberNames: ["Mira"],
            modelId: "Llama-3.1",
            isTextCompletion: true,
        });
        expect(stops).toEqual(
            expect.arrayContaining([
                "END",
                "\n",
                "\n\n",
                "\nLuna:",
                "\nAnon:",
                "\nMira:",
                "***",
                "START",
                "<|eot_id|>",
            ]),
        );
    });

    test("does not include formatting stop sequences, names, or single line stops for chat completion", () => {
        const stops = resolveEffectiveStopSequences({
            generation: { stopSequences: ["END"] },
            formatting: {
                namesAsStopStrings: true,
                separatorsAsStopStrings: true,
                singleLineMode: true,
                exampleSeparator: "***",
                chatStartSeparator: "START",
                instructTemplate: "auto",
            },
            characterName: "Luna",
            personaName: "Anon",
            groupMemberNames: ["Mira"],
            modelId: "Llama-3.1",
            isTextCompletion: false,
        });
        expect(stops).toEqual(["END"]);
    });

    test("returns undefined when no stop sequences are defined for chat completion", () => {
        const stops = resolveEffectiveStopSequences({
            generation: {},
            formatting: {
                namesAsStopStrings: true,
                singleLineMode: true,
            },
            characterName: "Luna",
            personaName: "Anon",
            isTextCompletion: false,
        });
        expect(stops).toBeUndefined();
    });
});
