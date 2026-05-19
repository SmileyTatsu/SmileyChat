import type { LorebookSettings } from "./types";

export const defaultLorebookSettings: LorebookSettings = {
    scanDepth: 4,
    tokenBudget: {
        mode: "percent",
        value: 25,
    },
    includeNames: true,
    recursive: false,
    maxRecursionSteps: 2,
    minActivations: 0,
    minActivationsMaxDepth: 0,
    caseSensitive: false,
    matchWholeWords: false,
    useGroupScoring: false,
    insertionStrategy: "sorted-evenly",
    overflowAlert: true,
};
