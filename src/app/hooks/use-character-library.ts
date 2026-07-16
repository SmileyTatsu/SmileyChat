import { useEffect, useRef, useState } from "preact/hooks";

import {
    createCharacter as createCharacterRequest,
    deleteCharacter as deleteCharacterRequest,
    loadCharacter,
    loadCharacterSummaries,
    patchCharacter as patchCharacterRequest,
    saveCharacter,
    saveCharacterIndex,
} from "#frontend/lib/api/client";
import { defaultCharacter } from "#frontend/lib/characters/defaults";
import {
    characterToSummary,
    createBlankCharacter,
    normalizeCharacter,
    normalizeCharacterSummaryCollection,
} from "#frontend/lib/characters/normalize";
import { normalizeChatSummaryCollection } from "#frontend/lib/chats/normalize";
import { messageFromError } from "#frontend/lib/common/errors";
import type {
    CharacterSummary,
    CharacterSummaryCollection,
    ChatSummaryCollection,
    SmileyCharacter,
} from "#frontend/types";
import type { TavernCardDataV2 } from "#frontend/lib/characters/types";

export function useCharacterLibrary() {
    const [characterSummaries, setCharacterSummariesState] =
        useState<CharacterSummaryCollection>({
            version: 1,
            activeCharacterId: "",
            characters: [],
        });
    const [character, setCharacterState] = useState<SmileyCharacter>(defaultCharacter);
    const [characterLoadError, setCharacterLoadError] = useState("");
    const latestCharacterRef = useRef(character);
    const latestCharacterSummariesRef = useRef(characterSummaries);
    const characterAutosaveTimerRef = useRef<number | undefined>(undefined);
    const characterSaveRequestIdRef = useRef(0);
    const characterCacheRef = useRef(new Map<string, SmileyCharacter>());
    const activeSelectionSaveInFlightRef = useRef(false);
    const queuedActiveSelectionIdRef = useRef<string | undefined>();

    latestCharacterRef.current = character;
    latestCharacterSummariesRef.current = characterSummaries;

    useEffect(
        () => () => {
            clearPendingCharacterAutosave();
        },
        [],
    );

    function setCharacter(nextCharacter: SmileyCharacter) {
        setCharacterState(nextCharacter);
        latestCharacterRef.current = nextCharacter;
        characterCacheRef.current.set(nextCharacter.id, nextCharacter);
    }

    function setCharacterSummaries(nextSummaries: CharacterSummaryCollection) {
        const safeSummaries = normalizeCharacterSummaryCollection(nextSummaries);
        setCharacterSummariesState(safeSummaries);
        latestCharacterSummariesRef.current = safeSummaries;
    }

    async function loadCharacterCollectionStrict() {
        const summaries = normalizeCharacterSummaryCollection(
            await loadCharacterSummaries(),
        );

        setCharacterSummaries(summaries);

        if (summaries.characters.length === 0) {
            setCharacter(defaultCharacter);
            setCharacterLoadError("");
            return { summaries, character: defaultCharacter };
        }

        const activeCharacter = await fetchCharacterById(summaries.activeCharacterId);
        setCharacter(activeCharacter);
        setCharacterLoadError("");
        return { summaries, character: activeCharacter };
    }

    async function loadCharacterCollection() {
        try {
            return await loadCharacterCollectionStrict();
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
            return undefined;
        }
    }

    async function fetchCharacterById(characterId: string) {
        const cachedCharacter = characterCacheRef.current.get(characterId);
        const cachedSummary = latestCharacterSummariesRef.current.characters.find(
            (item) => item.id === characterId,
        );

        if (
            cachedCharacter &&
            (!cachedSummary || cachedSummary.updatedAt === cachedCharacter.updatedAt)
        ) {
            return cachedCharacter;
        }

        const loadedCharacter =
            normalizeCharacter(await loadCharacter(characterId)) ?? defaultCharacter;
        characterCacheRef.current.set(loadedCharacter.id, loadedCharacter);
        return loadedCharacter;
    }

    function queueCharacterSave(nextCharacter: SmileyCharacter) {
        const safeCharacter = normalizeCharacter(nextCharacter) ?? defaultCharacter;
        setCharacter(safeCharacter);
        updateCharacterSummary(characterToSummary(safeCharacter));
        setCharacterLoadError("");
        characterSaveRequestIdRef.current += 1;

        clearPendingCharacterAutosave();
        characterAutosaveTimerRef.current = window.setTimeout(() => {
            characterAutosaveTimerRef.current = undefined;
            void persistCharacter(safeCharacter, false);
        }, 700);
    }

    function clearPendingCharacterAutosave() {
        if (characterAutosaveTimerRef.current) {
            window.clearTimeout(characterAutosaveTimerRef.current);
            characterAutosaveTimerRef.current = undefined;
        }
    }

    async function flushPendingCharacterAutosaveWithoutStateUpdate() {
        if (!characterAutosaveTimerRef.current) {
            return;
        }

        const pendingCharacter = latestCharacterRef.current;
        clearPendingCharacterAutosave();
        await persistCharacter(pendingCharacter, false);
    }

    async function persistCharacter(nextCharacter: SmileyCharacter, updateState = true) {
        const safeCharacter = normalizeCharacter(nextCharacter) ?? defaultCharacter;
        const requestId = characterSaveRequestIdRef.current + 1;
        characterSaveRequestIdRef.current = requestId;

        if (updateState) {
            setCharacter(safeCharacter);
            updateCharacterSummary(characterToSummary(safeCharacter));
        }

        try {
            const result = (await saveCharacter(safeCharacter)) as {
                character: SmileyCharacter;
                characters?: CharacterSummaryCollection;
            };
            const savedCharacter = normalizeCharacter(result.character) ?? safeCharacter;

            if (requestId === characterSaveRequestIdRef.current) {
                setCharacter(savedCharacter);
                if (result.characters) {
                    setCharacterSummaries(result.characters);
                } else {
                    updateCharacterSummary(characterToSummary(savedCharacter));
                }
                setCharacterLoadError("");
            }
        } catch (error) {
            if (requestId === characterSaveRequestIdRef.current) {
                setCharacterLoadError(messageFromError(error));
            }
        }
    }

    function updateActiveCharacter(nextCharacter: SmileyCharacter) {
        queueCharacterSave({
            ...nextCharacter,
            updatedAt: new Date().toISOString(),
        });
    }

    async function selectCharacter(characterId: string) {
        await flushPendingCharacterAutosaveWithoutStateUpdate();

        try {
            const [indexResponse, nextCharacter] = await Promise.all([
                saveCharacterIndex({
                    ...latestCharacterSummariesRef.current,
                    activeCharacterId: characterId,
                }),
                fetchCharacterById(characterId),
            ]);
            setCharacter(nextCharacter);
            const result = indexResponse as { characters?: CharacterSummaryCollection };
            if (result.characters) {
                setCharacterSummaries(result.characters);
            } else {
                setCharacterSummaries({
                    ...latestCharacterSummariesRef.current,
                    activeCharacterId: characterId,
                });
            }
            setCharacterLoadError("");
            return nextCharacter;
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
            return undefined;
        }
    }

    function commitSelectedCharacter(nextCharacter: SmileyCharacter) {
        setCharacter(nextCharacter);
        setCharacterSummaries({
            ...latestCharacterSummariesRef.current,
            activeCharacterId: nextCharacter.id,
        });
        setCharacterLoadError("");
    }

    function saveActiveCharacterSelection(characterId: string) {
        queuedActiveSelectionIdRef.current = characterId;
        void flushActiveCharacterSelectionSave();
    }

    async function flushActiveCharacterSelectionSave() {
        if (activeSelectionSaveInFlightRef.current) {
            return;
        }

        activeSelectionSaveInFlightRef.current = true;

        try {
            while (queuedActiveSelectionIdRef.current) {
                const activeCharacterId = queuedActiveSelectionIdRef.current;
                queuedActiveSelectionIdRef.current = undefined;

                await saveCharacterIndex({
                    ...latestCharacterSummariesRef.current,
                    activeCharacterId,
                });
            }
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        } finally {
            activeSelectionSaveInFlightRef.current = false;

            if (queuedActiveSelectionIdRef.current) {
                void flushActiveCharacterSelectionSave();
            }
        }
    }

    async function createCharacter() {
        await flushPendingCharacterAutosaveWithoutStateUpdate();

        const summaries = latestCharacterSummariesRef.current;
        const nextCharacter = createBlankCharacter(
            `New character ${summaries.characters.length + 1}`,
        );

        try {
            const result = (await createCharacterRequest(nextCharacter)) as {
                character: SmileyCharacter;
                characters?: CharacterSummaryCollection;
            };
            const createdCharacter =
                normalizeCharacter(result.character) ?? nextCharacter;
            const nextSummaries = result.characters
                ? normalizeCharacterSummaryCollection(result.characters)
                : normalizeCharacterSummaryCollection({
                      ...summaries,
                      activeCharacterId: createdCharacter.id,
                      characters: [
                          ...summaries.characters,
                          characterToSummary(createdCharacter),
                      ],
                  });

            setCharacterSummaries(nextSummaries);
            setCharacter(createdCharacter);
            setCharacterLoadError("");
            return createdCharacter;
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
            return undefined;
        }
    }

    async function patchCharacter(characterId: string, patch: Partial<TavernCardDataV2>) {
        await flushPendingCharacterAutosaveWithoutStateUpdate();
        try {
            const result = await patchCharacterRequest(characterId, patch);
            const saved = normalizeCharacter(result.character) ?? defaultCharacter;
            characterCacheRef.current.set(saved.id, saved);
            if (saved.id === latestCharacterRef.current.id) setCharacter(saved);
            if (result.characters) setCharacterSummaries(result.characters);
            else updateCharacterSummary(characterToSummary(saved));
            setCharacterLoadError("");
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
            throw error;
        }
    }

    async function removeCharacterAvatar(characterId: string) {
        await flushPendingCharacterAutosaveWithoutStateUpdate();

        try {
            if (characterId === latestCharacterRef.current.id) {
                const nextCharacter = {
                    ...latestCharacterRef.current,
                    updatedAt: new Date().toISOString(),
                };
                delete nextCharacter.avatar;
                await persistCharacter(nextCharacter, true);
                return;
            }

            const targetCharacter = await fetchCharacterById(characterId);
            const nextCharacter = { ...targetCharacter };
            delete nextCharacter.avatar;

            const result = (await saveCharacter({
                ...nextCharacter,
                updatedAt: new Date().toISOString(),
            })) as {
                characters?: CharacterSummaryCollection;
            };
            characterCacheRef.current.delete(characterId);

            if (result.characters) {
                setCharacterSummaries(result.characters);
            } else {
                updateCharacterSummary(characterToSummary(nextCharacter));
            }
            setCharacterLoadError("");
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        }
    }

    async function deleteCharacter(
        characterId: string,
        options: { deleteChats?: boolean } = {},
    ) {
        await flushPendingCharacterAutosaveWithoutStateUpdate();

        try {
            const wasActiveCharacter = characterId === latestCharacterRef.current.id;
            const result = (await deleteCharacterRequest(characterId, options)) as {
                characters?: CharacterSummaryCollection;
                chats?: ChatSummaryCollection;
            };
            const summaries = normalizeCharacterSummaryCollection(result.characters);
            characterCacheRef.current.delete(characterId);
            const nextCharacter =
                wasActiveCharacter && summaries.characters.length > 0
                    ? await fetchCharacterById(summaries.activeCharacterId)
                    : wasActiveCharacter
                      ? defaultCharacter
                      : latestCharacterRef.current;

            setCharacterSummaries(summaries);
            setCharacter(nextCharacter);
            setCharacterLoadError("");

            return {
                character: nextCharacter,
                chats: result.chats
                    ? normalizeChatSummaryCollection(result.chats)
                    : undefined,
                summaries,
                wasActiveCharacter,
            };
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
            return undefined;
        }
    }

    async function prepareCharacterAvatarUpload() {
        await flushPendingCharacterAutosaveWithoutStateUpdate();
    }

    function updateCharacterSummary(
        summary: CharacterSummaryCollection["characters"][number],
    ) {
        setCharacterSummariesState((current) => {
            const summaries = normalizeCharacterSummaryCollection({
                ...current,
                characters: current.characters.some((item) => item.id === summary.id)
                    ? current.characters.map((item) =>
                          item.id === summary.id ? summary : item,
                      )
                    : [...current.characters, summary],
            });

            latestCharacterSummariesRef.current = summaries;
            return summaries;
        });
    }

    function applySavedCharacter(
        savedCharacter: SmileyCharacter,
        summaries?: CharacterSummaryCollection,
    ) {
        const safeCharacter = normalizeCharacter(savedCharacter) ?? defaultCharacter;
        setCharacter(safeCharacter);

        if (summaries) {
            setCharacterSummaries(summaries);
        } else {
            updateCharacterSummary(characterToSummary(safeCharacter));
        }

        setCharacterLoadError("");
    }

    async function reorderCharacters(newCharacters: CharacterSummary[]) {
        const nextSummaries: CharacterSummaryCollection = {
            ...latestCharacterSummariesRef.current,
            characters: newCharacters,
        };
        setCharacterSummaries(nextSummaries);
        try {
            await saveCharacterIndex(nextSummaries);
        } catch (error) {
            setCharacterLoadError(messageFromError(error));
        }
    }

    return {
        applySavedCharacter,
        character,
        characterLoadError,
        characterSummaries,
        commitSelectedCharacter,
        createCharacter,
        deleteCharacter,
        fetchCharacterById,
        flushPendingCharacterAutosaveWithoutStateUpdate,
        latestCharacterRef,
        latestCharacterSummariesRef,
        loadCharacterCollection,
        loadCharacterCollectionStrict,
        prepareCharacterAvatarUpload,
        patchCharacter,
        removeCharacterAvatar,
        reorderCharacters,
        saveActiveCharacterSelection,
        selectCharacter,
        setCharacter,
        setCharacterLoadError,
        setCharacterSummaries,
        updateActiveCharacter,
        updateCharacterSummary,
    };
}
