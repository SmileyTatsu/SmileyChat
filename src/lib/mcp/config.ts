import { createId } from "#frontend/lib/common/ids";
import { isRecord } from "#frontend/lib/common/guards";
import type { McpSecrets, McpServerConfig, McpSettings, McpTransport } from "./types";

export const defaultMcpSettings = (): McpSettings => ({
    version: 1,
    confirmationMode: "never-confirm",
    trustedServerIds: [],
    servers: [],
});

export function normalizeMcpSettings(value: unknown): McpSettings {
    if (!isRecord(value)) return defaultMcpSettings();

    if (!Array.isArray(value.servers)) {
        return importOpenCodeMcp(value).settings;
    }

    const servers = Array.isArray(value.servers)
        ? value.servers
              .map(normalizeServer)
              .filter((item): item is McpServerConfig => Boolean(item))
        : [];

    return {
        version: 1,
        confirmationMode:
            value.confirmationMode === "confirm-every-turn" ||
            value.confirmationMode === "per-server-trust"
                ? value.confirmationMode
                : "never-confirm",
        trustedServerIds: uniqueStrings(value.trustedServerIds),
        servers,
    };
}

export function normalizeMcpSecrets(value: unknown): McpSecrets {
    if (!isRecord(value) || !isRecord(value.servers)) return { version: 1, servers: {} };

    return {
        version: 1,
        servers: Object.fromEntries(
            Object.entries(value.servers).map(([id, secrets]) => [
                id,
                isRecord(secrets)
                    ? (Object.fromEntries(
                          Object.entries(secrets).filter(
                              ([, value]) => typeof value === "string",
                          ),
                      ) as Record<string, string>)
                    : {},
            ]),
        ),
    };
}

export function normalizeMcpSelection(value: unknown) {
    if (!isRecord(value)) return undefined;

    const serverIds = uniqueStrings(value.serverIds);

    return serverIds.length ? { serverIds } : undefined;
}

export function importOpenCodeMcp(value: unknown) {
    const source =
        isRecord(value) && isRecord(value.mcpServers)
            ? value.mcpServers
            : isRecord(value) && isRecord(value.mcp)
              ? value.mcp
              : isRecord(value)
                ? value
                : {};
    const secrets: McpSecrets = { version: 1, servers: {} };
    const servers: McpServerConfig[] = [];

    for (const [name, item] of Object.entries(source)) {
        if (!isRecord(item)) continue;

        let type = item.type;
        if (!type) {
            if (typeof item.command === "string" || Array.isArray(item.command)) {
                type = "local";
            } else if (typeof item.url === "string") {
                type = "remote";
            }
        }

        if (type !== "local" && type !== "remote") continue;

        const id = stableMcpServerId(name);
        const values = isRecord(item.env)
            ? item.env
            : isRecord(item.environment)
              ? item.environment
              : isRecord(item.headers)
                ? item.headers
                : {};
        const serverSecrets = Object.fromEntries(
            Object.entries(values).filter(([, value]) => typeof value === "string"),
        ) as Record<string, string>;

        let command: string[] | undefined = undefined;
        if (type === "local") {
            if (Array.isArray(item.command)) {
                command = item.command.filter(
                    (part): part is string => typeof part === "string",
                );
            } else if (typeof item.command === "string") {
                const args = Array.isArray(item.args)
                    ? item.args.filter((part): part is string => typeof part === "string")
                    : [];
                command = [item.command, ...args];
            }
        }

        secrets.servers[id] = serverSecrets;
        servers.push({
            id,
            name: name.trim() || "MCP server",
            enabled: item.enabled !== false,
            transport: type === "local" ? "stdio" : "http",
            ...(command ? { command } : {}),
            ...(type === "remote" && typeof item.url === "string"
                ? { url: item.url }
                : {}),
            secretKeys: Object.keys(serverSecrets),
        });
    }

    return { settings: { ...defaultMcpSettings(), servers }, secrets };
}

export function exportOpenCodeMcp(
    settings: McpSettings,
    secrets?: McpSecrets,
    includeSecrets = false,
) {
    return {
        mcpServers: Object.fromEntries(
            settings.servers.map((server) => {
                const values = includeSecrets ? (secrets?.servers[server.id] ?? {}) : {};
                return [
                    server.name,
                    server.transport === "stdio"
                        ? {
                              command: server.command?.[0] ?? "",
                              args: server.command?.slice(1) ?? [],
                              enabled: server.enabled,
                              ...(includeSecrets && Object.keys(values).length
                                  ? { env: values }
                                  : {}),
                          }
                        : {
                              type: "remote",
                              url: server.url ?? "",
                              enabled: server.enabled,
                              ...(includeSecrets && Object.keys(values).length
                                  ? { headers: values }
                                  : {}),
                          },
                ];
            }),
        ),
    };
}

/** The direct, standard MCP map persisted in `mcp.json`. */
export function toStandardMcpMap(settings: McpSettings) {
    return exportOpenCodeMcp(settings).mcpServers;
}

function normalizeServer(value: unknown): McpServerConfig | undefined {
    if (!isRecord(value)) return undefined;

    const transport: McpTransport | undefined =
        value.transport === "stdio" || value.transport === "http"
            ? value.transport
            : undefined;
    const id =
        typeof value.id === "string" && Boolean(value.id) ? value.id : createId("mcp");

    if (!transport) return undefined;

    const command = Array.isArray(value.command)
        ? value.command
              .filter(
                  (item): item is string =>
                      typeof item === "string" && Boolean(item.trim()),
              )
              .map((item) => item.trim())
        : [];
    const url = typeof value.url === "string" ? value.url.trim() : "";

    if ((transport === "stdio" && !command.length) || (transport === "http" && !url))
        return undefined;

    return {
        id,
        name:
            typeof value.name === "string" && Boolean(value.name.trim())
                ? value.name.trim()
                : "MCP server",
        enabled: value.enabled !== false,
        transport,
        ...(command.length ? { command } : {}),
        ...(url ? { url } : {}),
        secretKeys: uniqueStrings(value.secretKeys),
    };
}

function uniqueStrings(value: unknown) {
    return Array.from(
        new Set(
            Array.isArray(value)
                ? value
                      .filter(
                          (item): item is string =>
                              typeof item === "string" && Boolean(item.trim()),
                      )
                      .map((item) => item.trim())
                : [],
        ),
    );
}

/**
 * Standard MCP maps use their object key as the server identity. Derive the
 * internal route/tool ID from that key so reads never invalidate UI state.
 */
function stableMcpServerId(name: string) {
    let hash = 2166136261;

    for (const character of name.trim().toLowerCase()) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }

    return `mcp-${(hash >>> 0).toString(36)}`;
}
