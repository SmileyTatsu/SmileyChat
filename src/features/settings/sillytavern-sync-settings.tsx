import { useState } from "preact/hooks";
import { AlertTriangle } from "lucide-preact";
import type { AppPreferences } from "#frontend/lib/preferences/types";
import { localApiFetch } from "#frontend/lib/api/client";

type Props = {
    preferences: AppPreferences;
    onPreferencesChange: (preferences: AppPreferences) => void;
    onSyncComplete: () => Promise<void>;
};
type Counts = {
    characters: number;
    chats: number;
    groupChats: number;
    personas: number;
    presets: number;
    lorebooks: number;
};
const labels: Record<keyof Counts, string> = {
    characters: "Characters",
    chats: "Character chats",
    groupChats: "Group chats",
    personas: "Personas",
    presets: "Presets",
    lorebooks: "Lorebooks / WorldInfo",
};

export function SillyTavernSyncSettings({
    preferences,
    onPreferencesChange,
    onSyncComplete,
}: Props) {
    const [availableUsers, setAvailableUsers] = useState<string[]>([]);
    const [counts, setCounts] = useState<Counts>();
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const config = preferences.sillytavern;
    const update = (patch: Partial<typeof config>) =>
        onPreferencesChange({ ...preferences, sillytavern: { ...config, ...patch } });

    async function request(path: string, body: unknown) {
        const response = await localApiFetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = (await response.json()) as any;
        if (!response.ok) throw new Error(data.error || "Request failed.");
        return data;
    }

    async function scan() {
        setBusy(true);
        setStatus("Scanning local SillyTavern files…");
        try {
            const result = await request("/api/sillytavern/scan", {
                stPath: config.basePath,
                userFolder: config.userFolder,
            });
            if (!result.valid)
                throw new Error("No SillyTavern user folder was found at this path.");
            setAvailableUsers(result.availableUsers);
            setCounts(result.counts);
            if (
                result.availableUsers.length &&
                !result.availableUsers.includes(config.userFolder)
            )
                update({ userFolder: result.availableUsers[0] });
            setStatus("Scan complete.");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Scan failed.");
        } finally {
            setBusy(false);
        }
    }

    async function sync() {
        setBusy(true);
        setStatus("Importing local SillyTavern data…");
        try {
            const result = await request("/api/sillytavern/sync", {
                stPath: config.basePath,
                userFolder: config.userFolder,
                syncTargets: config.syncTargets,
                overwriteExisting: false,
            });
            update({ lastSyncedAt: new Date().toISOString() });
            await onSyncComplete();
            const total = Object.values(result.imported).reduce(
                (sum: number, count: any) => sum + count,
                0,
            );
            setStatus(
                result.errors?.length
                    ? `Completed with errors: ${result.errors.join(" ")}`
                    : result.warnings?.length
                      ? `Imported ${total} items. ${result.warnings.length} empty or unsupported chat file(s) skipped.`
                      : `Imported ${total} items.`,
            );
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Sync failed.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="tool-window general-settings st-sync-settings">
            <header className="settings-section-heading">
                <div>
                    <h2>SillyTavern Sync</h2>
                    <p>
                        Import local SillyTavern data directly. SillyTavern does not need
                        to be running.
                    </p>
                </div>
            </header>
            <div className="st-sync-warning" role="note">
                <AlertTriangle size={18} aria-hidden="true" />
                <p>
                    <strong>Backup Recommended:</strong> Please create a backup of your
                    SmileyChat <code>userData</code> folder before syncing to safeguard
                    your current data.
                </p>
            </div>
            <div className="settings-card">
                <label className="settings-field">
                    <span>
                        <strong>SillyTavern base path</strong>
                        <small>Installation folder or a full data user folder.</small>
                    </span>
                    <input
                        className="settings-text-input"
                        value={config.basePath}
                        placeholder="E:\\SillyTavern"
                        onInput={(e) => update({ basePath: e.currentTarget.value })}
                    />
                </label>
                <label className="settings-field">
                    <span>
                        <strong>User profile</strong>
                        <small>Scan to discover available profiles.</small>
                    </span>
                    <select
                        className="settings-text-input"
                        value={config.userFolder}
                        onChange={(e) => update({ userFolder: e.currentTarget.value })}
                    >
                        {(availableUsers.length
                            ? availableUsers
                            : [config.userFolder]
                        ).map((user) => (
                            <option key={user} value={user}>
                                {user}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="st-sync-actions">
                    <button
                        type="button"
                        onClick={scan}
                        disabled={busy || !config.basePath.trim()}
                    >
                        Scan / Refresh
                    </button>
                    <button
                        type="button"
                        className="primary"
                        onClick={sync}
                        disabled={busy || !config.basePath.trim()}
                    >
                        Sync selected data
                    </button>
                </div>
                {counts && (
                    <div className="st-sync-counts">
                        {(Object.keys(labels) as Array<keyof Counts>).map((key) => (
                            <span key={key}>
                                {labels[key]} <strong>{counts[key]}</strong>
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <div className="settings-card">
                <header>
                    <div>
                        <h3>What to import</h3>
                        <p>Existing matching names are kept during this safe import.</p>
                    </div>
                </header>
                <div className="st-sync-targets">
                    {(Object.keys(labels) as Array<keyof Counts>).map((key) => (
                        <label key={key} className="st-sync-target-item">
                            <span>{labels[key]}</span>
                            <input
                                type="checkbox"
                                checked={config.syncTargets[key]}
                                onChange={(e) =>
                                    update({
                                        syncTargets: {
                                            ...config.syncTargets,
                                            [key]: e.currentTarget.checked,
                                        },
                                    })
                                }
                            />
                            <span className="st-sync-toggle-track" aria-hidden="true">
                                <span />
                            </span>
                        </label>
                    ))}
                </div>
            </div>
            {status && (
                <p className="st-sync-status" role="status">
                    {status}
                </p>
            )}
        </section>
    );
}
