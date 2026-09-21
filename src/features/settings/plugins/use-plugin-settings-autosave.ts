import { useEffect, useRef, useState } from "preact/hooks";

import { messageFromError } from "#frontend/lib/common/errors";
import {
    getPluginSettingsDefinition,
    subscribeToPluginSettings,
    updatePluginSettingsValue,
} from "#frontend/lib/plugins/registry";
import type { PluginStorageApi } from "#frontend/lib/plugins/types";

export type RequestState = "idle" | "loading" | "success" | "error";

export type UsePluginSettingsAutosaveOptions<T = any> = {
    pluginId: string;
    key?: string;
    settings: T;
    onSettingsChange?: (settings: T) => void;
    storage?: PluginStorageApi;
    validate?: (settings: T) => void | string | Promise<void | string>;
};

export function arePluginSettingsEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
        return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return false;
        }
        return a.every((item, index) => arePluginSettingsEqual(item, b[index]));
    }
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord);
    const bKeys = Object.keys(bRecord);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    for (const key of aKeys) {
        if (!Object.prototype.hasOwnProperty.call(bRecord, key)) {
            return false;
        }
        if (!arePluginSettingsEqual(aRecord[key], bRecord[key])) {
            return false;
        }
    }
    return true;
}

export function usePluginSettingsAutosave<T = any>({
    pluginId,
    key = "settings",
    settings,
    onSettingsChange,
    storage,
    validate,
}: UsePluginSettingsAutosaveOptions<T>) {
    const autosaveTimerRef = useRef<number | undefined>(undefined);
    const successTimerRef = useRef<number | undefined>(undefined);
    const lastSavedSettingsRef = useRef<T>(settings);
    const latestSettingsRef = useRef<T>(settings);
    const mountedRef = useRef(true);
    const onSettingsChangeRef = useRef(onSettingsChange);
    const queuedSaveRef = useRef<T | undefined>(undefined);
    const saveInFlightRef = useRef(false);
    const [requestState, setRequestState] = useState<RequestState>("idle");
    const [statusMessage, setStatusMessage] = useState("");

    useEffect(() => {
        onSettingsChangeRef.current = onSettingsChange;
    }, [onSettingsChange]);

    useEffect(() => {
        latestSettingsRef.current = settings;
    }, [settings]);

    // Registry-originated changes are already persisted. Treat them as the new
    // baseline so programmatic updates do not bounce through the UI autosaver.
    useEffect(
        () =>
            subscribeToPluginSettings(pluginId, key, (savedSettings) => {
                lastSavedSettingsRef.current = savedSettings as T;
            }),
        [pluginId, key],
    );

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
    }, [requestState]);

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

            if (!arePluginSettingsEqual(latestSettings, lastSavedSettingsRef.current)) {
                void saveSettings(latestSettings, false);
            }
        },
        [],
    );

    useEffect(() => {
        if (arePluginSettingsEqual(settings, lastSavedSettingsRef.current)) {
            return;
        }

        setRequestState("loading");
        setStatusMessage("Saving settings...");

        if (autosaveTimerRef.current) {
            window.clearTimeout(autosaveTimerRef.current);
        }

        let active = true;
        const effectiveValidator =
            validate ?? getPluginSettingsDefinition(pluginId, key)?.validate;

        void Promise.resolve()
            .then(() => effectiveValidator?.(settings as any))
            .then((validationError) => {
                if (!active) return;
                if (typeof validationError === "string" && validationError.trim()) {
                    setRequestState("error");
                    setStatusMessage(validationError);
                    return;
                }
                autosaveTimerRef.current = window.setTimeout(() => {
                    void saveSettings(settings);
                }, 700);
            })
            .catch((error) => {
                if (!active) return;
                setRequestState("error");
                setStatusMessage(messageFromError(error, "Invalid settings value."));
            });

        return () => {
            active = false;
            if (autosaveTimerRef.current) {
                window.clearTimeout(autosaveTimerRef.current);
            }
        };
    }, [settings, pluginId, key, validate]);

    async function saveSettings(
        nextSettings = latestSettingsRef.current,
        updateUi = true,
    ) {
        queuedSaveRef.current = nextSettings;

        if (saveInFlightRef.current) {
            if (updateUi && mountedRef.current) {
                setRequestState("loading");
                setStatusMessage("Saving settings...");
            }
            return;
        }

        saveInFlightRef.current = true;

        if (updateUi && mountedRef.current) {
            setRequestState("loading");
        }

        let queuedSaveAfterFailure: T | undefined;

        try {
            while (queuedSaveRef.current !== undefined) {
                const settingsToSave = queuedSaveRef.current;
                queuedSaveRef.current = undefined;

                const effectiveValidator =
                    validate ?? getPluginSettingsDefinition(pluginId, key)?.validate;

                if (effectiveValidator) {
                    const validationError = await effectiveValidator(
                        settingsToSave as any,
                    );
                    if (typeof validationError === "string" && validationError.trim()) {
                        throw new Error(validationError);
                    }
                }

                const savedSettings = await updatePluginSettingsValue<T>(
                    pluginId,
                    key,
                    settingsToSave,
                    storage,
                );

                lastSavedSettingsRef.current = settingsToSave;

                if (
                    updateUi &&
                    mountedRef.current &&
                    arePluginSettingsEqual(latestSettingsRef.current, settingsToSave)
                ) {
                    latestSettingsRef.current = savedSettings;
                    lastSavedSettingsRef.current = savedSettings;
                    onSettingsChangeRef.current?.(savedSettings);
                }
            }

            if (
                updateUi &&
                mountedRef.current &&
                arePluginSettingsEqual(
                    latestSettingsRef.current,
                    lastSavedSettingsRef.current,
                )
            ) {
                setStatusMessage("Settings saved.");
                setRequestState("success");
            }
        } catch (error) {
            queuedSaveAfterFailure = queuedSaveRef.current;

            if (mountedRef.current) {
                setStatusMessage(messageFromError(error, "Failed to save settings."));
                setRequestState("error");
            }
        } finally {
            saveInFlightRef.current = false;

            if (queuedSaveAfterFailure !== undefined) {
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
