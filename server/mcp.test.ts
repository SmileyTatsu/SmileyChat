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

    test("resolves npx command and handles bunx fallback", () => {
        const result = resolveStdioCommand([
            "npx",
            "-y",
            "@modelcontextprotocol/server-memory",
        ]);
        const hasNpx = Boolean(Bun.which("npx"));
        if (hasNpx) {
            expect(result).toEqual({
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-memory"],
            });
        } else {
            expect(result).toEqual({
                command: "bunx",
                args: ["@modelcontextprotocol/server-memory"],
            });
        }
    });

    test("strips -y and --yes when bunx is specified", () => {
        const result = resolveStdioCommand([
            "bunx",
            "-y",
            "--yes",
            "@modelcontextprotocol/server-memory",
        ]);
        expect(result).toEqual({
            command: "bunx",
            args: ["@modelcontextprotocol/server-memory"],
        });
    });

    test("resolves node command and handles bun fallback", () => {
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
