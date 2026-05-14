import { useEffect, useRef, useState } from "preact/hooks";
import { savePresetCollection } from "../../../lib/api/client";
import { messageFromError } from "../../../lib/common/errors";
import { normalizePresetCollection } from "../../../lib/presets/normalize";
import type { PresetCollection } from "../../../lib/presets/types";

export type RequestState = "idle" | "loading" | "success" | "error";

type UsePresetAutosaveOptions = {
    collection: PresetCollection;
    loadError?: string;
    onCollectionChange: (collection: PresetCollection) => void;
};

export function usePresetAutosave({
    collection,
    loadError,
    onCollectionChange,
}: UsePresetAutosaveOptions) {
    const autosaveTimerRef = useRef<number | undefined>(undefined);
    const lastSavedSnapshotRef = useRef(
        JSON.stringify(normalizePresetCollection(collection)),
    );
    const latestCollectionRef = useRef(collection);
    const mountedRef = useRef(true);
    const onCollectionChangeRef = useRef(onCollectionChange);
    const queuedSaveRef = useRef<PresetCollection | undefined>(undefined);
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

    useEffect(
        () => () => {
            mountedRef.current = false;

            if (autosaveTimerRef.current) {
                window.clearTimeout(autosaveTimerRef.current);
            }

            const latestCollection = normalizePresetCollection(
                latestCollectionRef.current,
            );

            if (JSON.stringify(latestCollection) !== lastSavedSnapshotRef.current) {
                void saveCollection(latestCollection, false);
            }
        },
        [],
    );

    useEffect(() => {
        const snapshot = JSON.stringify(normalizePresetCollection(collection));

        if (snapshot === lastSavedSnapshotRef.current) {
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
        queuedSaveRef.current = normalizePresetCollection(nextCollection);

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

        try {
            while (queuedSaveRef.current) {
                const collectionToSave = queuedSaveRef.current;
                queuedSaveRef.current = undefined;
                const result = await savePresetCollection(collectionToSave);
                const savedCollection = normalizePresetCollection(result.presets);
                const savedSnapshot = JSON.stringify(savedCollection);

                lastSavedSnapshotRef.current = savedSnapshot;

                if (
                    updateUi &&
                    mountedRef.current &&
                    savedSnapshot ===
                        JSON.stringify(
                            normalizePresetCollection(latestCollectionRef.current),
                        )
                ) {
                    latestCollectionRef.current = savedCollection;
                    onCollectionChangeRef.current(savedCollection);
                }
            }

            if (updateUi && mountedRef.current) {
                setStatusMessage("Preset changes saved.");
                setRequestState("success");
            }
        } catch (error) {
            if (mountedRef.current) {
                setStatusMessage(messageFromError(error, "Unexpected preset error."));
                setRequestState("error");
            }
        } finally {
            saveInFlightRef.current = false;
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
