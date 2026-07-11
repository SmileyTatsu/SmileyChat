import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { json } from "./http";
import { mcpSecretsPath, mcpSettingsPath } from "./paths";
import {
    defaultMcpSettings,
    exportOpenCodeMcp,
    importOpenCodeMcp,
    normalizeMcpSecrets,
    normalizeMcpSettings,
    toStandardMcpMap,
} from "#frontend/lib/mcp/config";
import type {
    McpSecrets,
    McpServerConfig,
    McpServerRecord,
    McpSettings,
    McpTool,
} from "#frontend/lib/mcp/types";

type Connection = {
    client: Client;
    transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
    tools: McpTool[];
    error?: string;
};

const connections = new Map<string, Connection>();

async function readSettings(): Promise<McpSettings> {
    try {
        return normalizeMcpSettings(JSON.parse(await readFile(mcpSettingsPath, "utf8")));
    } catch {
        return defaultMcpSettings();
    }
}

async function readSecrets(): Promise<McpSecrets> {
    try {
        return normalizeMcpSecrets(JSON.parse(await readFile(mcpSecretsPath, "utf8")));
    } catch {
        return { version: 1, servers: {} };
    }
}

async function writeData(settings: McpSettings, secrets: McpSecrets) {
    await mkdir(dirname(mcpSettingsPath), { recursive: true });
    await Promise.all([
        writeFile(mcpSettingsPath, JSON.stringify(toStandardMcpMap(settings), null, 2)),
        writeFile(mcpSecretsPath, JSON.stringify(secrets, null, 2)),
    ]);
}

export async function readMcpServers() {
    const settings = await readSettings();
    return json({ settings, servers: await records(settings) });
}

export async function writeMcpServers(body: unknown) {
    const imported = importOpenCodeMcp(body);
    const settings = normalizeMcpSettings(body);
    const current = await readSecrets();
    const supplied =
        body && typeof body === "object" && "secrets" in body
            ? normalizeMcpSecrets((body as { secrets: unknown }).secrets)
            : imported.settings.servers.length
              ? imported.secrets
              : current;

    await closeAll();
    await writeData(settings, supplied);

    return json({ settings, servers: await records(settings) });
}

export async function connectMcpServer(id: string) {
    const settings = await readSettings();
    const server = settings.servers.find((item) => item.id === id);
    if (!server) return json({ error: "MCP server not found." }, 404);

    await connect(server, (await readSecrets()).servers[id] ?? {});

    return json({ server: (await records(settings)).find((item) => item.id === id) });
}

export async function autoConnectMcpServers() {
    try {
        const settings = await readSettings();
        const secrets = await readSecrets();
        const enabledServers = settings.servers.filter((server) => server.enabled);

        for (const server of enabledServers) {
            connect(server, secrets.servers[server.id] ?? {}).catch((error) => {
                console.error(`[mcp] Failed to auto-connect to ${server.name}:`, error);
            });
        }
    } catch (error) {
        console.error("[mcp] Failed to auto-connect MCP servers on startup.", error);
    }
}

export async function disconnectMcpServer(id: string) {
    await close(id);
    return json({ ok: true });
}

export async function refreshMcpServer(id: string) {
    await close(id);
    return connectMcpServer(id);
}

export async function callMcpTool(serverId: string, toolName: string, args: unknown) {
    const settings = await readSettings();
    const server = settings.servers.find((item) => item.id === serverId && item.enabled);
    if (!server) return json({ error: "MCP server is unavailable." }, 404);

    const connection = await connect(
        server,
        (await readSecrets()).servers[serverId] ?? {},
    );

    const result = await connection.client.callTool(
        {
            name: toolName,
            arguments:
                args && typeof args === "object" ? (args as Record<string, unknown>) : {},
        },
        undefined,
        { timeout: 60_000 },
    );

    return json({
        content: resultToText(
            result as { content?: unknown[]; structuredContent?: unknown },
        ),
        isError: result.isError === true,
    });
}

async function records(settings: McpSettings): Promise<McpServerRecord[]> {
    return settings.servers.map((server) => {
        const connection = connections.get(server.id);
        return {
            ...server,
            connected: Boolean(connection),
            ...(connection?.error ? { error: connection.error } : {}),
            tools: connection?.tools ?? [],
        };
    });
}

async function connect(server: McpServerConfig, secrets: Record<string, string>) {
    const existing = connections.get(server.id);
    if (existing) return existing;

    validateServer(server);

    const env = Object.fromEntries(
        Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
    );
    const transport =
        server.transport === "stdio"
            ? new StdioClientTransport({
                  command: server.command![0]!,
                  args: server.command!.slice(1),
                  env: { ...env, ...secrets },
                  stderr: "pipe",
              })
            : createRemoteTransport(server.url!, secrets);

    const client = new Client(
        { name: "SmileyChat", version: "0.0.4" },
        { capabilities: {} },
    );

    const connection: Connection = { client, transport, tools: [] };
    connections.set(server.id, connection);

    try {
        await client.connect(transport);
        client.setNotificationHandler(
            ToolListChangedNotificationSchema,
            () => void discover(server, connection),
        );
        await discover(server, connection);
        return connection;
    } catch (error) {
        connection.error = error instanceof Error ? error.message : "Connection failed";
        await close(server.id);
        throw error;
    }
}

function createRemoteTransport(urlValue: string, secrets: Record<string, string>) {
    const url = new URL(urlValue);

    if (url.pathname.endsWith("/sse")) {
        return new SSEClientTransport(url, {
            eventSourceInit: {
                fetch: (input, init) =>
                    fetch(input, {
                        ...init,
                        headers: { ...init.headers, ...secrets },
                    }),
            },
            requestInit: { headers: secrets },
        });
    }

    return new StreamableHTTPClientTransport(url, {
        requestInit: { headers: secrets },
    });
}

async function discover(server: McpServerConfig, connection: Connection) {
    const result = await connection.client.listTools();
    connection.tools = result.tools.map((tool) => ({
        serverId: server.id,
        serverName: server.name,
        name: tool.name,
        ...(tool.title ? { title: tool.title } : {}),
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema as Record<string, unknown>,
        providerName: providerToolName(server.id, tool.name),
    }));
}

function providerToolName(serverId: string, toolName: string) {
    return `mcp_${serverId.replace(/[^a-zA-Z0-9]/g, "").slice(-10)}_${toolName.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 45)}`.slice(
        0,
        64,
    );
}

function resultToText(result: { content?: unknown[]; structuredContent?: unknown }) {
    const pieces = (result.content ?? []).map((item) =>
        item && typeof item === "object" && "text" in item
            ? String((item as { text: unknown }).text)
            : JSON.stringify(item),
    );
    if (result.structuredContent !== undefined)
        pieces.push(JSON.stringify(result.structuredContent));
    return pieces.join("\n") || "(MCP tool completed without text output)";
}

function validateServer(server: McpServerConfig) {
    if (server.transport === "stdio" && !server.command?.length)
        throw new Error("A local MCP server needs a command.");
    if (server.transport === "http") {
        const url = new URL(server.url!);
        if (
            url.protocol !== "https:" &&
            !(
                url.protocol === "http:" &&
                ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
            )
        )
            throw new Error("Remote MCP servers must use HTTPS (except loopback HTTP).");
    }
}

async function close(id: string) {
    const connection = connections.get(id);
    connections.delete(id);
    if (connection) await connection.transport.close();
}

export async function closeAll() {
    await Promise.all([...connections.keys()].map(close));
}
