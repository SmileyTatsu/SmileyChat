import { Plug, RefreshCw } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { mcpManifest } from "./manifest";
import type { McpServerRecord, McpSettings, McpTool } from "#frontend/lib/mcp/types";
import type {
    PluginAppSnapshot,
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
    api.ui.registerHeaderAction({
        id: "servers",
        label: "Choose MCP servers",
        renderIcon: () => <Plug size={17} />,
        run: () => {
            api.ui.openModal({
                id: "picker",
                title: "MCP servers for this chat",
                render: ({ close, snapshot }) => (
                    <McpPicker api={api} close={close} snapshot={snapshot} />
                ),
            });
        },
    });
    const unsubscribe = api.state.subscribe(() => void refreshTools(api));
    return () => {
        unsubscribe();
        clearTools();
    };
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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

function toPluginTool(tool: McpTool): PluginTool {
    return {
        name: tool.providerName,
        description: `MCP · ${tool.serverName} · ${tool.description ?? tool.name}`,
        parameters: tool.inputSchema,
        isAvailable: (snapshot) =>
            Boolean(
                snapshot.activeChat?.metadata?.mcp?.serverIds.includes(tool.serverId),
            ),
        run: async (args) => {
            const result = await request<{ content: string; isError?: boolean }>(
                `/api/mcp/${encodeURIComponent(tool.serverId)}/tools/${encodeURIComponent(tool.name)}`,
                { method: "POST", body: JSON.stringify(args) },
            );
            if (result.isError) throw new Error(result.content);
            return result.content;
        },
    };
}

function McpSettings({ api }: { api: SmileyPluginApi }) {
    const [state, setState] = useState(latest);
    const [error, setError] = useState("");
    const [draft, setDraft] = useState('{\n  "servers": []\n}');
    useEffect(() => {
        setState(latest);
    }, []);

    const reload = async () => {
        try {
            await refresh(api);
            setState(latest);
            setError("");
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : "Could not load MCP servers.",
            );
        }
    };

    const save = async () => {
        try {
            const next = JSON.parse(draft);
            await request("/api/mcp", { method: "PUT", body: JSON.stringify(next) });
            await reload();
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : "Invalid MCP configuration.",
            );
        }
    };

    return (
        <section className="mcp-settings">
            <p>
                Local stdio commands and remote Streamable HTTP tools. Header and
                environment values are stored separately as secrets.
            </p>
            <div className="mcp-toolbar">
                <button type="button" onClick={() => void reload()}>
                    <RefreshCw size={15} /> Refresh
                </button>
                <button
                    type="button"
                    onClick={() =>
                        void request("/api/mcp/export", {
                            method: "POST",
                            body: JSON.stringify({ includeSecrets: false }),
                        }).then((value) => setDraft(JSON.stringify(value, null, 2)))
                    }
                >
                    Export OpenCode
                </button>
            </div>
            <textarea
                value={draft}
                onInput={(event) =>
                    setDraft((event.currentTarget as HTMLTextAreaElement).value)
                }
                aria-label="MCP configuration JSON"
            />
            <div className="mcp-toolbar">
                <button
                    type="button"
                    onClick={() =>
                        void request("/api/mcp/import", { method: "POST", body: draft })
                            .then(reload)
                            .catch((cause) => setError(cause.message))
                    }
                >
                    Import OpenCode
                </button>
                <button type="button" onClick={() => void save()}>
                    Save configuration
                </button>
            </div>
            {state?.servers.map((server) => (
                <div className="mcp-server-row" key={server.id}>
                    <strong>{server.name}</strong>
                    <span>
                        {server.connected
                            ? `${server.tools.length} tools`
                            : (server.error ?? "Disconnected")}
                    </span>
                    <button
                        type="button"
                        onClick={() =>
                            void request(`/api/mcp/${server.id}/connect`, {
                                method: "POST",
                            }).then(reload)
                        }
                    >
                        Connect
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            void request(`/api/mcp/${server.id}/refresh`, {
                                method: "POST",
                            }).then(reload)
                        }
                    >
                        Refresh tools
                    </button>
                </div>
            ))}
            {error && <p className="chat-error">{error}</p>}
        </section>
    );
}

function McpPicker({
    api,
    close,
    snapshot,
}: {
    api: SmileyPluginApi;
    close: () => void;
    snapshot: PluginAppSnapshot | undefined;
}) {
    const selected = new Set(snapshot?.activeChat?.metadata?.mcp?.serverIds ?? []);
    const [ids, setIds] = useState(selected);
    const chat = snapshot?.activeChat;
    if (!chat) return <p>No active chat.</p>;

    const apply = async () => {
        const nextChat = {
            ...chat,
            metadata: { ...chat.metadata, mcp: { serverIds: [...ids] } },
        };
        await fetch(`/api/chats/${encodeURIComponent(nextChat.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nextChat),
        });
        close();
        window.location.reload();
    };

    return (
        <div className="mcp-picker">
            {latest?.servers.map((server) => (
                <label key={server.id}>
                    <input
                        type="checkbox"
                        checked={ids.has(server.id)}
                        disabled={!server.enabled || !server.connected}
                        onChange={() =>
                            setIds((current) => {
                                const next = new Set(current);
                                next.has(server.id)
                                    ? next.delete(server.id)
                                    : next.add(server.id);
                                return next;
                            })
                        }
                    />
                    <span>
                        <strong>{server.name}</strong>
                        <small>
                            {server.connected
                                ? `${server.tools.length} available tools`
                                : "Not connected"}
                        </small>
                    </span>
                </label>
            ))}
            <button type="button" onClick={() => void apply()}>
                Use selected servers
            </button>
        </div>
    );
}

export const mcpPlugin = { manifest: mcpManifest, module: { activate } };
