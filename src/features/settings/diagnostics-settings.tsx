import {
    Activity,
    AlertCircle,
    Check,
    Copy,
    Download,
    Eye,
    EyeOff,
    FileText,
    Filter,
    FolderOpen,
    HardDrive,
    Pause,
    Play,
    RefreshCw,
    Search,
    Shield,
    Sliders,
    Trash2,
} from "lucide-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { localApiFetch, localApiPath } from "#frontend/lib/api/client";
import type { AppPreferences, LogLevel } from "#frontend/lib/preferences/types";
import {
    NumberInput,
    SegmentedControl,
    SettingField,
    ToggleRow as SharedToggleRow,
} from "./settings-controls";

type DiagnosticsSettingsProps = {
    loadError?: string;
    preferences: AppPreferences;
    saveStatus?: string;
    onPreferencesChange: (preferences: AppPreferences) => void;
};

type LogSubsystem = "generate" | "http" | "plugins" | "mcp" | "server" | "security";

type LogEntry = {
    id: number;
    timestamp: string;
    subsystem: LogSubsystem;
    level: LogLevel;
    message: string;
    detail?: Record<string, unknown>;
    formatted: string;
};

type LogStats = {
    path: string;
    fileCount: number;
    totalSizeBytes: number;
    oldestDate?: string;
    newestDate?: string;
};

const subsystemsMeta: Array<{ id: LogSubsystem; label: string; color: string }> = [
    { id: "generate", label: "Generate", color: "#38bdf8" },
    { id: "http", label: "HTTP", color: "#60a5fa" },
    { id: "plugins", label: "Plugins", color: "#c084fc" },
    { id: "mcp", label: "MCP", color: "#4ade80" },
    { id: "server", label: "Server", color: "#94a3b8" },
    { id: "security", label: "Security", color: "#facc15" },
];

const levelsMeta: Array<{ id: LogLevel; label: string; color: string }> = [
    { id: "trace", label: "Trace", color: "#64748b" },
    { id: "debug", label: "Debug", color: "#38bdf8" },
    { id: "info", label: "Info", color: "#94a3b8" },
    { id: "warn", label: "Warn", color: "#fde047" },
    { id: "error", label: "Error", color: "#f87171" },
];

export function DiagnosticsSettings({
    loadError,
    preferences,
    saveStatus,
    onPreferencesChange,
}: DiagnosticsSettingsProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isPaused, setIsPaused] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [copied, setCopied] = useState(false);
    const [stats, setStats] = useState<LogStats | null>(null);
    const [clearing, setClearing] = useState(false);
    const [connected, setConnected] = useState(false);

    // Set of HIDDEN subsystems and levels. By default, hides levels below the configured log level.
    const [hiddenSubsystems, setHiddenSubsystems] = useState<Set<LogSubsystem>>(
        () => new Set(),
    );
    const [hiddenLevels, setHiddenLevels] = useState<Set<LogLevel>>(() => {
        const set = new Set<LogLevel>();
        if (preferences.logging.level === "info") {
            set.add("debug");
            set.add("trace");
        } else if (preferences.logging.level === "warn") {
            set.add("info");
            set.add("debug");
            set.add("trace");
        } else if (preferences.logging.level === "error") {
            set.add("warn");
            set.add("info");
            set.add("debug");
            set.add("trace");
        } else if (preferences.logging.level === "debug") {
            set.add("trace");
        }
        return set;
    });

    const logContainerRef = useRef<HTMLDivElement>(null);
    const isUserScrolledUp = useRef(false);
    const isPausedRef = useRef(isPaused);
    isPausedRef.current = isPaused;

    function updateLogging(nextLogging: Partial<AppPreferences["logging"]>) {
        if (nextLogging.level) {
            const level = nextLogging.level;
            setHiddenLevels(() => {
                const set = new Set<LogLevel>();
                if (level === "info") {
                    set.add("debug");
                    set.add("trace");
                } else if (level === "warn") {
                    set.add("info");
                    set.add("debug");
                    set.add("trace");
                } else if (level === "error") {
                    set.add("warn");
                    set.add("info");
                    set.add("debug");
                    set.add("trace");
                } else if (level === "debug") {
                    set.add("trace");
                }
                return set;
            });
        }
        onPreferencesChange({
            ...preferences,
            logging: {
                ...preferences.logging,
                ...nextLogging,
            },
        });
    }

    function updateSubsystems(
        nextSubsystems: Partial<AppPreferences["logging"]["subsystems"]>,
    ) {
        onPreferencesChange({
            ...preferences,
            logging: {
                ...preferences.logging,
                subsystems: {
                    ...preferences.logging.subsystems,
                    ...nextSubsystems,
                },
            },
        });
    }

    function updateFileLogging(
        nextFileLogging: Partial<AppPreferences["logging"]["fileLogging"]>,
    ) {
        onPreferencesChange({
            ...preferences,
            logging: {
                ...preferences.logging,
                fileLogging: {
                    ...preferences.logging.fileLogging,
                    ...nextFileLogging,
                },
            },
        });
    }

    // Toggle specific subsystem visibility
    const toggleSubsystem = (id: LogSubsystem) => {
        setHiddenSubsystems((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Toggle specific level visibility
    const toggleLevel = (id: LogLevel) => {
        setHiddenLevels((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Load initial recent logs and disk stats
    useEffect(() => {
        let mounted = true;
        void localApiFetch("/api/logs/recent")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!mounted || !data) return;
                if (Array.isArray(data.logs)) {
                    setLogs(data.logs);
                }
                if (data.stats) {
                    setStats(data.stats);
                }
            })
            .catch(() => undefined);

        return () => {
            mounted = false;
        };
    }, []);

    // Connect to SSE stream
    useEffect(() => {
        const url = localApiPath("/api/logs/stream");
        const eventSource = new EventSource(url);

        eventSource.onopen = () => {
            setConnected(true);
        };

        eventSource.onerror = () => {
            setConnected(false);
        };

        eventSource.onmessage = (event) => {
            try {
                const entry = JSON.parse(event.data) as LogEntry;
                if (!isPausedRef.current) {
                    setLogs((prev) => {
                        const next = [...prev, entry];
                        if (next.length > 1000) next.shift();
                        return next;
                    });
                }
            } catch {
                // Ignore parse failures
            }
        };

        return () => {
            eventSource.close();
            setConnected(false);
        };
    }, []);

    // Handle auto-scrolling
    useEffect(() => {
        if (!autoScroll || isUserScrolledUp.current) return;
        const container = logContainerRef.current;
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, [logs, autoScroll]);

    const handleScroll = () => {
        const container = logContainerRef.current;
        if (!container) return;
        const isAtBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight < 30;
        isUserScrolledUp.current = !isAtBottom;
    };

    // Filtered logs calculation
    const filteredLogs = useMemo(() => {
        return logs.filter((log) => {
            if (hiddenSubsystems.has(log.subsystem)) {
                return false;
            }
            if (hiddenLevels.has(log.level)) {
                return false;
            }
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matchFormatted = log.formatted.toLowerCase().includes(query);
                const matchMsg = log.message.toLowerCase().includes(query);
                if (!matchFormatted && !matchMsg) return false;
            }
            return true;
        });
    }, [logs, hiddenSubsystems, hiddenLevels, searchQuery]);

    const handleCopy = () => {
        const text = filteredLogs.map((item) => item.formatted).join("\n");
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleExport = () => {
        const text = filteredLogs
            .map((item) => `[${item.timestamp}] ${item.formatted}`)
            .join("\n");
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `smileychat-logs-${new Date().toISOString().slice(0, 10)}.log`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleClearLogs = async () => {
        if (!window.confirm("Delete all saved SmileyChat log files in userData/logs?"))
            return;
        setClearing(true);
        try {
            const res = await localApiFetch("/api/logs", { method: "DELETE" });
            if (res.ok) {
                const data = await res.json();
                if (data.stats) setStats(data.stats);
            }
        } finally {
            setClearing(false);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <section className="tool-window diagnostics-settings">
            <header className="settings-section-heading">
                <div>
                    <h2>Diagnostics</h2>
                    <p>
                        Live terminal logs, request latencies, MCP events, and telemetry
                        controls.
                    </p>
                </div>
                {saveStatus && <span className="settings-save-state">{saveStatus}</span>}
            </header>

            {loadError && <p className="connection-status error">{loadError}</p>}

            {/* LIVE LOG VIEWER */}
            <section className="settings-card diagnostics-viewer-card">
                <header className="diagnostics-viewer-header">
                    <div className="diagnostics-header-title">
                        <Activity size={18} />
                        <div>
                            <h3>Live Application Log</h3>
                            <p>
                                Real-time server events, generation progress, and plugin
                                diagnostics.
                            </p>
                        </div>
                    </div>
                    <div className="diagnostics-connection-badge">
                        <span
                            className={`status-dot ${connected ? "online" : "offline"}`}
                        />
                        <small>
                            {connected ? (isPaused ? "Paused" : "Live") : "Connecting..."}
                        </small>
                    </div>
                </header>

                {/* Filter Toolbar with individual toggle pills */}
                <div className="diagnostics-toolbar">
                    <div className="diagnostics-search-box">
                        <Search size={14} />
                        <input
                            type="text"
                            placeholder="Filter log messages..."
                            value={searchQuery}
                            onInput={(e) =>
                                setSearchQuery((e.target as HTMLInputElement).value)
                            }
                        />
                        {searchQuery && (
                            <button
                                className="search-clear-btn"
                                type="button"
                                title="Clear search"
                                onClick={() => setSearchQuery("")}
                            >
                                ×
                            </button>
                        )}
                    </div>

                    {/* Subsystem Filters */}
                    <div
                        className="diagnostics-filter-group"
                        title="Click to hide/show specific subsystems"
                    >
                        <span className="diagnostics-filter-label">Subsystems:</span>
                        {subsystemsMeta.map((sub) => {
                            const isHidden = hiddenSubsystems.has(sub.id);
                            return (
                                <button
                                    key={sub.id}
                                    type="button"
                                    className={`diagnostics-filter-pill ${isHidden ? "hidden" : "active"}`}
                                    onClick={() => toggleSubsystem(sub.id)}
                                    title={
                                        isHidden
                                            ? `Show ${sub.label} logs`
                                            : `Hide ${sub.label} logs`
                                    }
                                >
                                    <span
                                        className="pill-dot"
                                        style={{
                                            backgroundColor: isHidden
                                                ? "#555"
                                                : sub.color,
                                        }}
                                    />
                                    <span>{sub.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Level Filters */}
                    <div
                        className="diagnostics-filter-group"
                        title="Click to hide/show specific log levels"
                    >
                        <span className="diagnostics-filter-label">Levels:</span>
                        {levelsMeta.map((lvl) => {
                            const isHidden = hiddenLevels.has(lvl.id);
                            return (
                                <button
                                    key={lvl.id}
                                    type="button"
                                    className={`diagnostics-filter-pill ${isHidden ? "hidden" : "active"}`}
                                    onClick={() => toggleLevel(lvl.id)}
                                    title={
                                        isHidden
                                            ? `Show ${lvl.label} logs`
                                            : `Hide ${lvl.label} logs`
                                    }
                                >
                                    <span>{lvl.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="diagnostics-toolbar-actions">
                        <button
                            className={`tool-icon-btn ${isPaused ? "active" : ""}`}
                            type="button"
                            title={isPaused ? "Resume Live Stream" : "Pause Live Stream"}
                            onClick={() => setIsPaused(!isPaused)}
                        >
                            {isPaused ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                        <button
                            className={`tool-icon-btn ${autoScroll ? "active" : ""}`}
                            type="button"
                            title={autoScroll ? "Auto-scroll: ON" : "Auto-scroll: OFF"}
                            onClick={() => {
                                setAutoScroll(!autoScroll);
                                isUserScrolledUp.current = false;
                            }}
                        >
                            <span style={{ fontSize: "11px", fontWeight: "bold" }}>
                                ↓
                            </span>
                        </button>
                        <button
                            className="tool-icon-btn"
                            type="button"
                            title="Copy Filtered Logs"
                            onClick={handleCopy}
                        >
                            {copied ? (
                                <Check size={14} color="#4ade80" />
                            ) : (
                                <Copy size={14} />
                            )}
                        </button>
                        <button
                            className="tool-icon-btn"
                            type="button"
                            title="Export Logs as File"
                            onClick={handleExport}
                        >
                            <Download size={14} />
                        </button>
                        <button
                            className="tool-icon-btn danger"
                            type="button"
                            title="Clear View (in-memory)"
                            onClick={() => setLogs([])}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>

                {/* Log Terminal Screen */}
                <div
                    className="diagnostics-terminal"
                    ref={logContainerRef}
                    onScroll={handleScroll}
                >
                    {filteredLogs.length === 0 ? (
                        <div className="diagnostics-empty">
                            <small>
                                {logs.length === 0
                                    ? "Waiting for incoming logs..."
                                    : "No log entries match the active filter criteria."}
                            </small>
                        </div>
                    ) : (
                        filteredLogs.map((entry) => {
                            const subColor =
                                subsystemsMeta.find((s) => s.id === entry.subsystem)
                                    ?.color || "#94a3b8";
                            return (
                                <div
                                    key={entry.id}
                                    className={`log-line level-${entry.level}`}
                                >
                                    <span className="log-time">
                                        {entry.timestamp.slice(11, 23)}
                                    </span>
                                    <span
                                        className="log-subsystem"
                                        style={{ color: subColor }}
                                    >
                                        [{entry.subsystem}]
                                    </span>
                                    {entry.level !== "info" && (
                                        <span
                                            className={`log-level-badge level-${entry.level}`}
                                        >
                                            {entry.level.toUpperCase()}
                                        </span>
                                    )}
                                    <span className="log-message">{entry.message}</span>
                                    {entry.detail && (
                                        <span className="log-detail">
                                            {Object.entries(entry.detail).map(
                                                ([k, v]) => (
                                                    <span key={k} className="log-kv">
                                                        {" "}
                                                        {k}=
                                                        <em>
                                                            {typeof v === "string"
                                                                ? v
                                                                : JSON.stringify(v)}
                                                        </em>
                                                    </span>
                                                ),
                                            )}
                                        </span>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            {/* LOGGING CONFIGURATION */}
            <section className="settings-card">
                <header>
                    <Sliders size={18} />
                    <div>
                        <h3>Logging Configuration</h3>
                        <p>
                            Customize which diagnostics output to the terminal and log
                            files.
                        </p>
                    </div>
                </header>

                <SettingField
                    label="Minimum log level"
                    description="Global severity threshold for terminal output and storage."
                >
                    <SegmentedControl<LogLevel>
                        value={preferences.logging.level}
                        options={[
                            { value: "info", label: "Info" },
                            { value: "debug", label: "Debug" },
                            { value: "trace", label: "Trace" },
                            { value: "warn", label: "Warn" },
                            { value: "error", label: "Error" },
                        ]}
                        onChange={(level) => updateLogging({ level })}
                    />
                </SettingField>

                <div className="diagnostics-subsystems-layout">
                    {/* Column 1 */}
                    <div className="diagnostics-group-column">
                        <div className="diagnostics-subsystem-group">
                            <h4>LLM Generation</h4>
                            <ToggleRow
                                checked={preferences.logging.subsystems.generation}
                                label="Generation lifecycle"
                                description="Log start, stream progress, TTFT, done stats, and token speed."
                                onChange={(generation) =>
                                    updateSubsystems({ generation })
                                }
                            />
                            <ToggleRow
                                checked={
                                    preferences.logging.subsystems.generationPromptDetails
                                }
                                label="Prompt diagnostics"
                                description="Log message roles breakdown, image/file counts, and estimated prompt tokens."
                                onChange={(generationPromptDetails) =>
                                    updateSubsystems({ generationPromptDetails })
                                }
                            />
                            <ToggleRow
                                checked={
                                    preferences.logging.subsystems
                                        .generationSamplingDetails
                                }
                                label="Sampling parameter diagnostics"
                                description="Log active temperature, top_p, penalties, and reasoning effort (debug level)."
                                onChange={(generationSamplingDetails) =>
                                    updateSubsystems({ generationSamplingDetails })
                                }
                            />
                        </div>

                        <div className="diagnostics-subsystem-group">
                            <h4>HTTP API Requests</h4>
                            <ToggleRow
                                checked={preferences.logging.subsystems.http}
                                label="API route requests"
                                description="Log incoming /api/* calls with response status codes and elapsed time."
                                onChange={(http) => updateSubsystems({ http })}
                            />
                            <ToggleRow
                                checked={preferences.logging.subsystems.httpAssetRequests}
                                label="Asset & avatar requests"
                                description="Log avatar and chat attachment image fetches (hidden by default to avoid noise)."
                                onChange={(httpAssetRequests) =>
                                    updateSubsystems({ httpAssetRequests })
                                }
                            />
                        </div>
                    </div>

                    {/* Column 2 */}
                    <div className="diagnostics-group-column">
                        <div className="diagnostics-subsystem-group">
                            <h4>Plugins & Extensions</h4>
                            <ToggleRow
                                checked={preferences.logging.subsystems.plugins}
                                label="Plugin discovery & manifest scans"
                                description="Log discovered core extensions and user plugin manifests on startup."
                                onChange={(plugins) => updateSubsystems({ plugins })}
                            />
                            <ToggleRow
                                checked={
                                    preferences.logging.subsystems.pluginsClientTelemetry
                                }
                                label="Frontend activation timings"
                                description="Log client-side plugin module activation durations and plugin logger messages."
                                onChange={(pluginsClientTelemetry) =>
                                    updateSubsystems({ pluginsClientTelemetry })
                                }
                            />
                        </div>

                        <div className="diagnostics-subsystem-group">
                            <h4>MCP Servers</h4>
                            <ToggleRow
                                checked={preferences.logging.subsystems.mcp}
                                label="Auto-connect & tool discovery"
                                description="Log MCP server connections, transport types, and registered tools."
                                onChange={(mcp) => updateSubsystems({ mcp })}
                            />
                            <ToggleRow
                                checked={preferences.logging.subsystems.mcpToolCalls}
                                label="Tool call executions"
                                description="Log executed tool calls, execution times, and return status."
                                onChange={(mcpToolCalls) =>
                                    updateSubsystems({ mcpToolCalls })
                                }
                            />
                        </div>

                        <div className="diagnostics-subsystem-group">
                            <h4>Server Lifecycle</h4>
                            <ToggleRow
                                checked={preferences.logging.subsystems.server}
                                label="Server & port management"
                                description="Log server startup, port reclamation, dropped card imports, and env reloads."
                                onChange={(server) => updateSubsystems({ server })}
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* FILE STORAGE & RETENTION */}
            <section className="settings-card">
                <header>
                    <HardDrive size={18} />
                    <div>
                        <h3>File Logging &amp; Retention</h3>
                        <p>
                            Automatically save rotating diagnostic files in userData/logs
                            with automatic cleanup.
                        </p>
                    </div>
                </header>

                <ToggleRow
                    checked={preferences.logging.fileLogging.enabled}
                    label="Save logs to disk (userData/logs)"
                    description="Persist daily rotating logs for offline troubleshooting."
                    onChange={(enabled) => updateFileLogging({ enabled })}
                />

                <SettingField
                    label="Retention period (days)"
                    description="Automatically delete log files older than this limit."
                >
                    <NumberInput
                        min={1}
                        max={90}
                        step={1}
                        value={preferences.logging.fileLogging.maxDays}
                        onChange={(maxDays) => updateFileLogging({ maxDays })}
                    />
                </SettingField>

                <SettingField
                    label="Maximum logs folder size (MB)"
                    description="Prune oldest log files if total log directory exceeds this threshold."
                >
                    <NumberInput
                        min={5}
                        max={1000}
                        step={1}
                        value={preferences.logging.fileLogging.maxTotalSizeMb}
                        onChange={(maxTotalSizeMb) =>
                            updateFileLogging({ maxTotalSizeMb })
                        }
                    />
                </SettingField>

                {stats && (
                    <div className="diagnostics-storage-summary">
                        <span>
                            <strong>Storage used:</strong>{" "}
                            {formatBytes(stats.totalSizeBytes)} across {stats.fileCount}{" "}
                            log file(s)
                        </span>
                        <small>Location: {stats.path}</small>
                    </div>
                )}

                <div className="settings-card-actions">
                    <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                            window.alert(
                                `Logs directory:\n${stats?.path || "userData/logs"}\n\nAccess this folder inside your SmileyChat installation.`,
                            )
                        }
                    >
                        <FolderOpen size={14} style={{ marginRight: 6 }} />
                        Open logs folder
                    </button>
                    <button
                        className="secondary-button danger"
                        type="button"
                        disabled={clearing}
                        onClick={handleClearLogs}
                    >
                        <Trash2 size={14} style={{ marginRight: 6 }} />
                        {clearing ? "Clearing..." : "Clear all log files"}
                    </button>
                </div>
            </section>

            {/* PRIVACY & SECURITY BANNER */}
            <section className="settings-card diagnostics-privacy-card">
                <header>
                    <Shield size={18} />
                    <div>
                        <h3>Privacy &amp; Security Guarantee</h3>
                        <p>
                            SmileyChat strictly protects sensitive credentials and prompt
                            privacy.
                        </p>
                    </div>
                </header>
                <div className="diagnostics-privacy-content">
                    <p>
                        <strong>Secrets Redaction:</strong> API keys, authorization
                        tokens, session passwords, and CSRF secrets are permanently
                        redacted (e.g. <code>sk-ant-***</code> or <code>[REDACTED]</code>)
                        before writing to logs.
                    </p>
                    <p>
                        <strong>Prompt Content:</strong> Full raw character prompts,
                        system messages, and chat history text are never recorded unless
                        explicitly enabled via the host environment variable (
                        <code>SMILEYCHAT_LOG_SENSITIVE_PAYLOADS=true</code> in{" "}
                        <code>.env</code>).
                    </p>
                </div>
            </section>
        </section>
    );
}

function ToggleRow({
    checked,
    description,
    label,
    onChange,
}: {
    checked: boolean;
    description?: string;
    label: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <SharedToggleRow
            checked={checked}
            className="diagnostics-toggle-row"
            description={description}
            label={label}
            labelClassName="toggle-label-wrap"
            onChange={onChange}
        />
    );
}
