import { Plug, RefreshCw } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { localApiFetch } from "#frontend/lib/api/client";
import { mcpManifest } from "./manifest";
import { exportOpenCodeMcp } from "#frontend/lib/mcp/config";
import type { McpServerRecord, McpSettings, McpTool } from "#frontend/lib/mcp/types";
import type {
    PluginChatDetailsSectionProps,
    PluginTool,
    SmileyPluginApi,
} from "#frontend/lib/plugins/types";
import styles from "./styles.css?raw";

export { mcpManifest };

type State = { settings: McpSettings; servers: McpServerRecord[] };

let latest: State | undefined;

let disposers: Array<() => void> = [];

export async function activate(api: SmileyPluginApi) {
    await refresh(api);
    api.ui.addStyles(styles);
    api.ui.registerSettingsPanel({
        id: "servers",
        label: "MCP Servers",
        render: () => <McpSettings api={api} />,
    });
    api.ui.registerChatDetailsSection({
        id: "picker",
        render: ({ snapshot, updateChatMetadata }) => (
            <McpPicker snapshot={snapshot} updateChatMetadata={updateChatMetadata} />
        ),
    });

    return () => {
        clearTools();
    };
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await localApiFetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
        ...init,
    });
    if (!response.ok)
        throw new Error(
            (await response.json().catch(() => undefined))?.error ??
                `MCP request failed (${response.status})`,
        );
    return response.json() as Promise<T>;
}

async function refresh(api: SmileyPluginApi) {
    latest = await request<State>("/api/mcp");
    await refreshTools(api);
}

async function refreshTools(api: SmileyPluginApi) {
    clearTools();
    for (const server of latest?.servers ?? [])
        for (const tool of server.tools)
            disposers.push(api.tools.registerTool(toPluginTool(tool)));
}

function clearTools() {
    for (const dispose of disposers.splice(0)) dispose();
}

function formatMcpToolName(serverName: string, toolName: string, title?: string) {
    if (title) {
        return `${serverName} (${title})`;
    }

    let cleanName = toolName;
    const prefix = `${serverName}_`;
    if (cleanName.startsWith(prefix)) {
        cleanName = cleanName.slice(prefix.length);
    }

    cleanName = cleanName.replace(/_/g, " ");
    return `${serverName} (${cleanName})`;
}

function toPluginTool(tool: McpTool): PluginTool {
    return {
        name: tool.providerName,
        displayName: formatMcpToolName(tool.serverName, tool.name, tool.title),
        description: `MCP · ${tool.serverName} · ${tool.description ?? tool.name}`,
        parameters: tool.inputSchema,
        isAvailable: (snapshot) =>
            Boolean(
                snapshot.activeChat?.metadata?.mcp?.serverIds.includes(tool.serverId),
            ),
        run: async (args, context) => {
            const result = await request<{ content: string; isError?: boolean }>(
                `/api/mcp/${encodeURIComponent(tool.serverId)}/tools/${encodeURIComponent(tool.name)}`,
                {
                    method: "POST",
                    body: JSON.stringify(args),
                    signal: context.signal,
                },
            );
            if (result.isError) throw new Error(result.content);
            return result.content;
        },
    };
}

function McpSettings({ api }: { api: SmileyPluginApi }) {
    const [state, setState] = useState(latest);
    const [error, setError] = useState("");
    const [processing, setProcessing] = useState(false);

    // Compute the standard format JSON dynamically
    const draftContent = state?.settings
        ? JSON.stringify(exportOpenCodeMcp(state.settings, undefined, false), null, 2)
        : '{\n  "mcpServers": {}\n}';
    const [draft, setDraft] = useState(draftContent);

    // Sync draft if state updates externally
    useEffect(() => {
        if (state?.settings) {
            setDraft(
                JSON.stringify(
                    exportOpenCodeMcp(state.settings, undefined, false),
                    null,
                    2,
                ),
            );
        }
    }, [state?.settings]);

    useEffect(() => {
        setState(latest);
    }, []);

    const reload = async () => {
        setProcessing(true);
        try {
            await refresh(api);
            setState(latest);
            setError("");
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : "Could not load MCP servers.",
            );
        } finally {
            setProcessing(false);
        }
    };

    const save = async () => {
        setProcessing(true);
        try {
            const next = JSON.parse(draft);
            await request("/api/mcp", { method: "PUT", body: JSON.stringify(next) });
            await reload();
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : "Invalid MCP configuration.",
            );
        } finally {
            setProcessing(false);
        }
    };

    const connectServer = async (id: string) => {
        setProcessing(true);
        try {
            await request(`/api/mcp/${encodeURIComponent(id)}/connect`, {
                method: "POST",
            });
            await reload();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Connection failed.");
            setProcessing(false);
        }
    };

    const disconnectServer = async (id: string) => {
        setProcessing(true);
        try {
            await request(`/api/mcp/${encodeURIComponent(id)}/disconnect`, {
                method: "POST",
            });
            await reload();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Disconnect failed.");
            setProcessing(false);
        }
    };

    const refreshServer = async (id: string) => {
        setProcessing(true);
        try {
            await request(`/api/mcp/${encodeURIComponent(id)}/refresh`, {
                method: "POST",
            });
            await reload();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Refresh failed.");
            setProcessing(false);
        }
    };

    return (
        <section className="mcp-settings">
            <div className="mcp-note">
                Local stdio commands and remote Streamable HTTP tools. Header and
                environment values are stored separately as secrets.
            </div>

            <section className="mcp-settings-group">
                <h5>Configuration</h5>
                <label className="mcp-field">
                    <span>MCP configuration JSON</span>
                    <textarea
                        value={draft}
                        onInput={(event) =>
                            setDraft((event.currentTarget as HTMLTextAreaElement).value)
                        }
                        onKeyDown={indentJsonOnEnter}
                        aria-label="MCP configuration JSON"
                        autoComplete="off"
                        spellcheck={false}
                        disabled={processing}
                    />
                </label>
                <div className="mcp-button-row">
                    <button
                        type="button"
                        onClick={() => void reload()}
                        disabled={processing}
                    >
                        <RefreshCw size={15} /> Refresh
                    </button>
                    <button
                        type="button"
                        className="primary"
                        onClick={() => void save()}
                        disabled={processing}
                    >
                        Save configuration
                    </button>
                </div>
            </section>

            <section className="mcp-settings-group">
                <h5>Servers</h5>
                {state?.servers.length === 0 && (
                    <p className="spp-muted">No servers configured.</p>
                )}
                {state?.servers.map((server) => {
                    const statusColor = server.connected
                        ? "#52b69a"
                        : server.error
                          ? "#eb5757"
                          : "#9da3b4";

                    return (
                        <article className="mcp-server-row" key={server.id}>
                            <span>
                                <strong>
                                    <span
                                        style={{
                                            color: statusColor,
                                            marginRight: "6px",
                                            fontSize: "1.2em",
                                        }}
                                    >
                                        &bull;
                                    </span>
                                    {server.name}
                                </strong>
                                <small>
                                    {server.connected
                                        ? `${server.tools.length} tools`
                                        : (server.error ?? "Disconnected")}
                                </small>
                            </span>
                            <div>
                                {server.connected ? (
                                    <button
                                        type="button"
                                        disabled={processing}
                                        onClick={() => void disconnectServer(server.id)}
                                    >
                                        Disconnect
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        disabled={processing || !server.enabled}
                                        onClick={() => void connectServer(server.id)}
                                    >
                                        Connect
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={processing || !server.enabled}
                                    onClick={() => void refreshServer(server.id)}
                                >
                                    Refresh
                                </button>
                            </div>
                        </article>
                    );
                })}
            </section>

            {error && <p className="chat-error">{error}</p>}
        </section>
    );
}

function McpPicker({
    snapshot,
    updateChatMetadata,
}: {
    snapshot: PluginChatDetailsSectionProps["snapshot"];
    updateChatMetadata: PluginChatDetailsSectionProps["updateChatMetadata"];
}) {
    const selected = new Set(snapshot?.activeChat?.metadata?.mcp?.serverIds ?? []);
    const [ids, setIds] = useState(selected);

    // Keep local selection state in sync if chat changes externally
    useEffect(() => {
        setIds(new Set(snapshot?.activeChat?.metadata?.mcp?.serverIds ?? []));
    }, [snapshot?.activeChat?.metadata?.mcp?.serverIds]);

    const chat = snapshot?.activeChat;
    if (!chat) return <p>No active chat.</p>;

    const toggleServer = (serverId: string) => {
        const next = new Set(ids);
        if (next.has(serverId)) {
            next.delete(serverId);
        } else {
            next.add(serverId);
        }
        setIds(next);
        updateChatMetadata({
            mcp: { serverIds: [...next] },
        });
    };

    return (
        <div className="mcp-picker">
            <div className="mcp-picker-header">
                <h3>
                    <Plug size={16} aria-hidden="true" />
                    MCP Servers
                </h3>
                <p>Provide additional tools to the AI for this chat.</p>
            </div>
            <div className="mcp-picker-list">
                {latest === undefined ? (
                    <p className="spp-muted" role="status">
                        Loading MCP servers…
                    </p>
                ) : latest.servers.length === 0 ? (
                    <p className="spp-muted">No servers configured.</p>
                ) : (
                    latest?.servers.map((server) => (
                        <label className="mcp-check" key={server.id}>
                            <input
                                type="checkbox"
                                checked={ids.has(server.id)}
                                disabled={!server.enabled || !server.connected}
                                onChange={() => toggleServer(server.id)}
                            />
                            <span>
                                <span>{server.name}</span>
                                <small>
                                    {server.connected
                                        ? `${server.tools.length} available tools`
                                        : "Not connected"}
                                </small>
                            </span>
                        </label>
                    ))
                )}
            </div>
        </div>
    );
}

export const mcpPlugin = { manifest: mcpManifest, module: { activate } };

function indentJsonOnEnter(event: KeyboardEvent) {
    if (event.key !== "Enter") return;

    const input = event.currentTarget as HTMLTextAreaElement;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const currentLine = before.slice(before.lastIndexOf("\n") + 1);
    const baseIndent = currentLine.match(/^\s*/)?.[0] ?? "";
    const nextIndent = /[\[{][ \t]*$/.test(currentLine) ? `${baseIndent}  ` : baseIndent;

    event.preventDefault();
    input.setRangeText(`\n${nextIndent}`, start, end, "end");
    input.dispatchEvent(new Event("input", { bubbles: true }));
}
