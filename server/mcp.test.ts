import { describe, expect, test } from "bun:test";
import { resolveStdioCommand } from "./mcp";

describe("MCP stdio command resolution", () => {
    test("preserves non-node/npx commands", () => {
        const result = resolveStdioCommand(["python", "-m", "mcp_server_time"]);
        expect(result).toEqual({
            command: "python",
            args: ["-m", "mcp_server_time"],
        });
    });

    test("resolves npx to bunx when running in Bun if npx is unavailable", () => {
        const result = resolveStdioCommand([
            "npx",
            "-y",
            "@modelcontextprotocol/server-memory",
        ]);
        const hasNpx = Boolean(Bun.which("npx"));
        const expectedCommand = hasNpx ? "npx" : "bunx";
        expect(result).toEqual({
            command: expectedCommand,
            args: ["-y", "@modelcontextprotocol/server-memory"],
        });
    });

    test("resolves node to bun when running in Bun if node is unavailable", () => {
        const result = resolveStdioCommand(["node", "./mcp-server.js"]);
        const hasNode = Boolean(Bun.which("node"));
        const expectedCommand = hasNode ? "node" : "bun";
        expect(result).toEqual({
            command: expectedCommand,
            args: ["./mcp-server.js"],
        });
    });

    test("handles empty command array gracefully", () => {
        expect(resolveStdioCommand([])).toEqual({ command: "", args: [] });
    });
});
