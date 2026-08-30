import { useEffect, useRef, useState } from "preact/hooks";

import { savePresetCollection } from "#frontend/lib/api/client";
import { messageFromError } from "#frontend/lib/common/errors";
import { normalizePresetCollection } from "#frontend/lib/presets/normalize";
import type { PresetCollection } from "#frontend/lib/presets/types";

export type RequestState = "idle" | "loading" | "success" | "error";

type UsePresetAutosaveOptions = {
    collection: PresetCollection;
    loadError?: string;
    onCollectionChange: (collection: PresetCollection) => void;
};

type QueuedPresetSave = {
    source: PresetCollection;
    normalized: PresetCollection;
};

export function usePresetAutosave({
    collection,
    loadError,
    onCollectionChange,
}: UsePresetAutosaveOptions) {
    const autosaveTimerRef = useRef<number | undefined>(undefined);
    const successTimerRef = useRef<number | undefined>(undefined);
    const lastSavedCollectionRef = useRef(collection);
    const latestCollectionRef = useRef(collection);
    const mountedRef = useRef(true);
    const onCollectionChangeRef = useRef(onCollectionChange);
    const queuedSaveRef = useRef<QueuedPresetSave | undefined>(undefined);
    const saveInFlightRef = useRef(false);
    const [requestState, setRequestState] = useState<RequestState>("idle");
    const [statusMessage, setStatusMessage] = useState("");

    useEffect(() => {
        onCollectionChangeRef.current = onCollectionChange;
    }, [onCollectionChange]);

    useEffect(() => {
        if (loadError) {
            setStatusMessage(loadError);
            setRequestState("error");
        }
    }, [loadError]);

    useEffect(() => {
        latestCollectionRef.current = collection;
    }, [collection]);

    useEffect(() => {
        if (requestState !== "success") {
            return;
        }

        successTimerRef.current = window.setTimeout(() => {
            setRequestState("idle");
            setStatusMessage("");
        }, 2500);

        return () => {
            if (successTimerRef.current) {
                window.clearTimeout(successTimerRef.current);
            }
        };
    }, [requestState, statusMessage]);

    useEffect(
        () => () => {
            mountedRef.current = false;

            if (autosaveTimerRef.current) {
                window.clearTimeout(autosaveTimerRef.current);
            }

            if (successTimerRef.current) {
                window.clearTimeout(successTimerRef.current);
            }

            const latestCollection = latestCollectionRef.current;

            if (latestCollection !== lastSavedCollectionRef.current) {
                void saveCollection(latestCollection, false);
            }
        },
        [],
    );

    useEffect(() => {
        if (collection === lastSavedCollectionRef.current) {
            return;
        }

        setRequestState("loading");
        setStatusMessage("Autosaving preset changes...");

        if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
        }

        autosaveTimerRef.current = window.setTimeout(() => {
            void saveCollection(collection);
        }, 700);

        return () => {
            if (autosaveTimerRef.current) {
                window.clearTimeout(autosaveTimerRef.current);
            }
        };
    }, [collection]);

    async function saveCollection(
        nextCollection = latestCollectionRef.current,
        updateUi = true,
    ) {
        queuedSaveRef.current = {
            source: nextCollection,
            normalized: normalizePresetCollection(nextCollection),
        };

        if (saveInFlightRef.current) {
            if (updateUi && mountedRef.current) {
                setRequestState("loading");
                setStatusMessage("Autosaving preset changes...");
            }

            return;
        }

        saveInFlightRef.current = true;

        if (updateUi && mountedRef.current) {
            setRequestState("loading");
        }

        let queuedSaveAfterFailure: QueuedPresetSave | undefined;

        try {
            while (queuedSaveRef.current) {
                const { source, normalized: collectionToSave } = queuedSaveRef.current;
                queuedSaveRef.current = undefined;
                const result = await savePresetCollection(collectionToSave);
                const savedCollection = normalizePresetCollection(result.presets);

                lastSavedCollectionRef.current = source;

                if (
                    updateUi &&
                    mountedRef.current &&
                    latestCollectionRef.current === source
                ) {
                    latestCollectionRef.current = savedCollection;
                    lastSavedCollectionRef.current = savedCollection;
                    onCollectionChangeRef.current(savedCollection);
                }
            }

            if (
                updateUi &&
                mountedRef.current &&
                latestCollectionRef.current === lastSavedCollectionRef.current
            ) {
                setStatusMessage("Preset changes saved.");
                setRequestState("success");
            }
        } catch (error) {
            queuedSaveAfterFailure = queuedSaveRef.current;

            if (mountedRef.current) {
                setStatusMessage(messageFromError(error, "Unexpected preset error."));
                setRequestState("error");
            }
        } finally {
            saveInFlightRef.current = false;

            if (queuedSaveAfterFailure) {
                void saveCollection(queuedSaveAfterFailure.source, updateUi);
            }
        }
    }

    return {
        requestState,
        saveCollection,
        setRequestState,
        setStatusMessage,
        statusMessage,
    };
}
