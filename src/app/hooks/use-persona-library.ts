import { useEffect, useRef, useState } from "preact/hooks";

import {
    createPersona as createPersonaRequest,
    deletePersona as deletePersonaRequest,
    loadPersona,
    loadPersonaSummaries,
    savePersona,
    savePersonaIndex,
} from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import {
    createBlankPersona,
    defaultPersona,
    personaToSummary,
} from "#frontend/lib/personas/defaults";
import {
    normalizePersona,
    normalizePersonaSummaryCollection,
} from "#frontend/lib/personas/normalize";
import type { PersonaSummaryCollection, SmileyPersona } from "#frontend/types";

export function usePersonaLibrary() {
    const [personaSummaries, setPersonaSummaries] = useState<PersonaSummaryCollection>({
        version: 1,
        activePersonaId: defaultPersona.id,
        personas: [personaToSummary(defaultPersona)],
    });
    const [persona, setPersona] = useState<SmileyPersona>(defaultPersona);
    const [personaEditorPersona, setPersonaEditorPersona] =
        useState<SmileyPersona>(defaultPersona);
    const [personaLoadError, setPersonaLoadError] = useState("");
    const latestPersonaRef = useRef(persona);
    const latestPersonaEditorRef = useRef(personaEditorPersona);
    const latestPersonaSummariesRef = useRef(personaSummaries);
    const personaAutosaveTimerRef = useRef<number | undefined>(undefined);
    const personaSaveRequestIdRef = useRef(0);

    useEffect(() => {
        latestPersonaRef.current = persona;
    }, [persona]);

    useEffect(() => {
        latestPersonaEditorRef.current = personaEditorPersona;
    }, [personaEditorPersona]);

    useEffect(() => {
        latestPersonaSummariesRef.current = personaSummaries;
    }, [personaSummaries]);

    useEffect(
        () => () => {
            if (personaAutosaveTimerRef.current) {
                window.clearTimeout(personaAutosaveTimerRef.current);
            }
        },
        [],
    );

    async function loadPersonaCollection() {
        try {
            const summaries = normalizePersonaSummaryCollection(
                await loadPersonaSummaries(),
            );
            const activePersona = await fetchPersonaById(summaries.activePersonaId);

            setPersonaSummaries(summaries);
            latestPersonaSummariesRef.current = summaries;
            setPersona(activePersona);
            latestPersonaRef.current = activePersona;
            setPersonaEditorPersona(activePersona);
            latestPersonaEditorRef.current = activePersona;
            setPersonaLoadError("");
        } catch (error) {
            setPersonaLoadError(messageFromError(error));
        }
    }

    async function fetchPersonaById(personaId: string) {
        return normalizePersona(await loadPersona(personaId)) ?? defaultPersona;
    }

    function queuePersonaSave(nextPersona: SmileyPersona) {
        const safePersona =
            normalizePersona({
                ...nextPersona,
                updatedAt: new Date().toISOString(),
            }) ?? defaultPersona;

        setPersonaEditorPersona(safePersona);
        latestPersonaEditorRef.current = safePersona;
        if (safePersona.id === latestPersonaRef.current.id) {
            setPersona(safePersona);
            latestPersonaRef.current = safePersona;
        }
        updatePersonaSummary(personaToSummary(safePersona));
        setPersonaLoadError("");
        personaSaveRequestIdRef.current += 1;

        clearPendingPersonaAutosave();
        personaAutosaveTimerRef.current = window.setTimeout(() => {
            personaAutosaveTimerRef.current = undefined;
            void persistPersona(safePersona, false);
        }, 700);
    }

    function clearPendingPersonaAutosave() {
        if (personaAutosaveTimerRef.current) {
            window.clearTimeout(personaAutosaveTimerRef.current);
            personaAutosaveTimerRef.current = undefined;
        }
    }

    async function flushPendingPersonaAutosaveWithoutStateUpdate() {
        if (!personaAutosaveTimerRef.current) {
            return;
        }

        const pendingPersona = latestPersonaEditorRef.current;
        clearPendingPersonaAutosave();
        await persistPersona(pendingPersona, false);
    }

    function ignorePendingPersonaSaveResponses() {
        personaSaveRequestIdRef.current += 1;
    }

    async function persistPersona(nextPersona: SmileyPersona, updateState = true) {
        const safePersona = normalizePersona(nextPersona) ?? defaultPersona;
        const requestId = personaSaveRequestIdRef.current + 1;
        personaSaveRequestIdRef.current = requestId;

        if (updateState) {
            setPersonaEditorPersona(safePersona);
            latestPersonaEditorRef.current = safePersona;
            if (safePersona.id === latestPersonaRef.current.id) {
                setPersona(safePersona);
                latestPersonaRef.current = safePersona;
            }
            updatePersonaSummary(personaToSummary(safePersona));
        }

        try {
            const result = (await savePersona(safePersona)) as {
                persona: SmileyPersona;
                personas?: PersonaSummaryCollection;
            };
            const savedPersona = normalizePersona(result.persona) ?? safePersona;

            if (requestId === personaSaveRequestIdRef.current) {
                setPersonaEditorPersona(savedPersona);
                latestPersonaEditorRef.current = savedPersona;
                if (savedPersona.id === latestPersonaRef.current.id) {
                    setPersona(savedPersona);
                    latestPersonaRef.current = savedPersona;
                }

                if (result.personas) {
                    const summaries = normalizePersonaSummaryCollection(result.personas);
                    setPersonaSummaries(summaries);
                    latestPersonaSummariesRef.current = summaries;
                } else {
                    updatePersonaSummary(personaToSummary(savedPersona), savedPersona.id);
                }

                setPersonaLoadError("");
            }
        } catch (error) {
            if (requestId === personaSaveRequestIdRef.current) {
                setPersonaLoadError(messageFromError(error));
            }
        }
    }

    async function selectPersona(personaId: string) {
        await flushPendingPersonaAutosaveWithoutStateUpdate();
        ignorePendingPersonaSaveResponses();

        try {
            const [indexResponse, nextPersona] = await Promise.all([
                savePersonaIndex({
                    ...latestPersonaSummariesRef.current,
                    activePersonaId: personaId,
                }),
                fetchPersonaById(personaId),
            ]);

            setPersona(nextPersona);
            latestPersonaRef.current = nextPersona;
            setPersonaEditorPersona(nextPersona);
            latestPersonaEditorRef.current = nextPersona;

            const result = indexResponse as { personas?: PersonaSummaryCollection };
            if (result.personas) {
                const summaries = normalizePersonaSummaryCollection(result.personas);
                setPersonaSummaries(summaries);
                latestPersonaSummariesRef.current = summaries;
            } else {
                setPersonaSummaries((current) => ({
                    ...current,
                    activePersonaId: personaId,
                }));
            }

            setPersonaLoadError("");
        } catch (error) {
            setPersonaLoadError(messageFromError(error));
        }
    }

    async function createPersona() {
        await flushPendingPersonaAutosaveWithoutStateUpdate();
        ignorePendingPersonaSaveResponses();

        const nextPersona = createBlankPersona(
            `Persona ${latestPersonaSummariesRef.current.personas.length + 1}`,
        );

        try {
            const result = (await createPersonaRequest(nextPersona)) as {
                persona: SmileyPersona;
                personas?: PersonaSummaryCollection;
            };
            const createdPersona = normalizePersona(result.persona) ?? nextPersona;

            setPersonaEditorPersona(createdPersona);
            latestPersonaEditorRef.current = createdPersona;

            if (result.personas) {
                const summaries = normalizePersonaSummaryCollection(result.personas);
                setPersonaSummaries(summaries);
                latestPersonaSummariesRef.current = summaries;
            } else {
                updatePersonaSummary(personaToSummary(createdPersona));
            }

            setPersonaLoadError("");
        } catch (error) {
            setPersonaLoadError(messageFromError(error));
        }
    }

    function updatePersona(nextPersona: SmileyPersona) {
        queuePersonaSave(nextPersona);
    }

    function applySavedPersona(
        savedPersona: SmileyPersona,
        summaries?: PersonaSummaryCollection,
    ) {
        const safePersona = normalizePersona(savedPersona) ?? defaultPersona;

        setPersonaEditorPersona(safePersona);
        latestPersonaEditorRef.current = safePersona;
        if (safePersona.id === latestPersonaRef.current.id) {
            setPersona(safePersona);
            latestPersonaRef.current = safePersona;
        }

        if (summaries) {
            const safeSummaries = normalizePersonaSummaryCollection(summaries);
            setPersonaSummaries(safeSummaries);
            latestPersonaSummariesRef.current = safeSummaries;
        } else {
            updatePersonaSummary(personaToSummary(safePersona), safePersona.id);
        }

        setPersonaLoadError("");
    }

    async function deletePersona(personaId: string) {
        await flushPendingPersonaAutosaveWithoutStateUpdate();
        ignorePendingPersonaSaveResponses();

        try {
            const wasActivePersona = personaId === latestPersonaRef.current.id;
            const result = (await deletePersonaRequest(personaId)) as {
                personas?: PersonaSummaryCollection;
            };
            const summaries = normalizePersonaSummaryCollection(result.personas);
            const nextPersona = wasActivePersona
                ? await fetchPersonaById(summaries.activePersonaId)
                : latestPersonaRef.current;

            setPersonaSummaries(summaries);
            latestPersonaSummariesRef.current = summaries;
            setPersona(nextPersona);
            latestPersonaRef.current = nextPersona;
            if (personaId === latestPersonaEditorRef.current.id) {
                setPersonaEditorPersona(nextPersona);
                latestPersonaEditorRef.current = nextPersona;
            }
            setPersonaLoadError("");
        } catch (error) {
            setPersonaLoadError(messageFromError(error));
        }
    }

    async function selectPersonaForEditing(personaId: string) {
        await flushPendingPersonaAutosaveWithoutStateUpdate();
        ignorePendingPersonaSaveResponses();

        try {
            const nextPersona = await fetchPersonaById(personaId);

            setPersonaEditorPersona(nextPersona);
            latestPersonaEditorRef.current = nextPersona;
            setPersonaLoadError("");
        } catch (error) {
            setPersonaLoadError(messageFromError(error));
        }
    }

    function updatePersonaSummary(
        summary: PersonaSummaryCollection["personas"][number],
        activePersonaId = latestPersonaSummariesRef.current.activePersonaId,
    ) {
        setPersonaSummaries((current) => {
            const summaries = normalizePersonaSummaryCollection({
                ...current,
                activePersonaId,
                personas: current.personas.some((item) => item.id === summary.id)
                    ? current.personas.map((item) =>
                          item.id === summary.id ? summary : item,
                      )
                    : [...current.personas, summary],
            });

            latestPersonaSummariesRef.current = summaries;
            return summaries;
        });
    }

    return {
        applySavedPersona,
        createPersona,
        deletePersona,
        latestPersonaRef,
        loadPersonaCollection,
        persona,
        personaEditorPersona,
        personaLoadError,
        personaSummaries,
        selectPersona,
        selectPersonaForEditing,
        updatePersona,
    };
}
