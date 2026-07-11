export type McpTransport = "stdio" | "http";

export type McpServerConfig = {
    id: string;
    name: string;
    enabled: boolean;
    transport: McpTransport;
    command?: string[];
    url?: string;
    secretKeys: string[];
};

export type McpSecrets = {
    version: 1;
    servers: Record<string, Record<string, string>>;
};

export type McpSettings = {
    version: 1;
    confirmationMode: "never-confirm" | "confirm-every-turn" | "per-server-trust";
    trustedServerIds: string[];
    servers: McpServerConfig[];
};

export type McpTool = {
    serverId: string;
    serverName: string;
    name: string;
    title?: string;
    description?: string;
    inputSchema: Record<string, unknown>;
    providerName: string;
};

export type McpServerStatus = {
    id: string;
    connected: boolean;
    error?: string;
    tools: McpTool[];
};

export type McpServerRecord = McpServerConfig & McpServerStatus;

export type McpChatSelection = {
    serverIds: string[];
};
