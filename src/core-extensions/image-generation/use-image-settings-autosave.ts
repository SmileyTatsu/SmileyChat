import { useEffect, useRef, useState } from "preact/hooks";

import { messageFromError } from "#frontend/lib/common/errors";
import type { SmileyPluginApi } from "#frontend/lib/plugins/types";

import { splitMasterPrompt } from "./master-prompt";
import { saveImageGenerationSettings, type ImageGenerationSettings } from "./settings";

export type RequestState = "idle" | "loading" | "success" | "error";

export type UseImageSettingsAutosaveOptions = {
    api: SmileyPluginApi;
    settings: ImageGenerationSettings;
    onSettingsChange?: (settings: ImageGenerationSettings) => void;
};

export function areImageSettingsEqual(
    a: ImageGenerationSettings,
    b: ImageGenerationSettings,
): boolean {
    if (a === b) {
        return true;
    }
    const keys = Object.keys(a) as Array<keyof ImageGenerationSettings>;
    if (keys.length !== Object.keys(b).length) {
        return false;
    }
    for (const key of keys) {
        if (a[key] !== b[key]) {
            return false;
        }
    }
    return true;
}

export function useImageSettingsAutosave({
    api,
    settings,
    onSettingsChange,
}: UseImageSettingsAutosaveOptions) {
    const autosaveTimerRef = useRef<number | undefined>(undefined);
    const successTimerRef = useRef<number | undefined>(undefined);
    const lastSavedSettingsRef = useRef(settings);
    const latestSettingsRef = useRef(settings);
    const mountedRef = useRef(true);
    const onSettingsChangeRef = useRef(onSettingsChange);
    const queuedSaveRef = useRef<ImageGenerationSettings | undefined>(undefined);
    const saveInFlightRef = useRef(false);
    const [requestState, setRequestState] = useState<RequestState>("idle");
    const [statusMessage, setStatusMessage] = useState("");

    useEffect(() => {
        onSettingsChangeRef.current = onSettingsChange;
    }, [onSettingsChange]);

    useEffect(() => {
        latestSettingsRef.current = settings;
    }, [settings]);

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

            const latestSettings = latestSettingsRef.current;

            if (!areImageSettingsEqual(latestSettings, lastSavedSettingsRef.current)) {
                void saveSettings(latestSettings, false);
            }
        },
        [],
    );

    useEffect(() => {
        if (areImageSettingsEqual(settings, lastSavedSettingsRef.current)) {
            return;
        }

        try {
            splitMasterPrompt(settings.masterPrompt);
        } catch (error) {
            if (autosaveTimerRef.current) {
                window.clearTimeout(autosaveTimerRef.current);
            }
            setRequestState("error");
            setStatusMessage(messageFromError(error, "Invalid master prompt."));
            return;
        }

        setRequestState("loading");
        setStatusMessage("Autosaving image settings...");

        if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
        }

        autosaveTimerRef.current = window.setTimeout(() => {
            void saveSettings(settings);
        }, 700);

        return () => {
            if (autosaveTimerRef.current) {
                window.clearTimeout(autosaveTimerRef.current);
            }
        };
    }, [settings]);

    async function saveSettings(
        nextSettings = latestSettingsRef.current,
        updateUi = true,
    ) {
        queuedSaveRef.current = nextSettings;

        if (saveInFlightRef.current) {
            if (updateUi && mountedRef.current) {
                setRequestState("loading");
                setStatusMessage("Autosaving image settings...");
            }
            return;
        }

        saveInFlightRef.current = true;

        if (updateUi && mountedRef.current) {
            setRequestState("loading");
        }

        let queuedSaveAfterFailure: ImageGenerationSettings | undefined;

        try {
            while (queuedSaveRef.current) {
                const settingsToSave = queuedSaveRef.current;
                queuedSaveRef.current = undefined;

                splitMasterPrompt(settingsToSave.masterPrompt);

                const savedSettings = await saveImageGenerationSettings(
                    api,
                    settingsToSave,
                );

                lastSavedSettingsRef.current = settingsToSave;

                if (
                    updateUi &&
                    mountedRef.current &&
                    areImageSettingsEqual(latestSettingsRef.current, settingsToSave)
                ) {
                    latestSettingsRef.current = savedSettings;
                    lastSavedSettingsRef.current = savedSettings;
                    onSettingsChangeRef.current?.(savedSettings);
                }
            }

            if (
                updateUi &&
                mountedRef.current &&
                areImageSettingsEqual(
                    latestSettingsRef.current,
                    lastSavedSettingsRef.current,
                )
            ) {
                setStatusMessage("Image settings saved.");
                setRequestState("success");
            }
        } catch (error) {
            queuedSaveAfterFailure = queuedSaveRef.current;

            if (mountedRef.current) {
                setStatusMessage(
                    messageFromError(error, "Failed to save image settings."),
                );
                setRequestState("error");
            }
        } finally {
            saveInFlightRef.current = false;

            if (queuedSaveAfterFailure) {
                void saveSettings(queuedSaveAfterFailure, updateUi);
            }
        }
    }

    return {
        requestState,
        saveSettings,
        setRequestState,
        setStatusMessage,
        statusMessage,
    };
}
