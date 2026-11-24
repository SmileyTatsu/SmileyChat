import { expect, test } from "bun:test";

import { contentSecurityPolicy, inlineScriptHashesFor } from "./security-headers";

const PAGE = `<!doctype html><html><head>
<script type="importmap">{"imports":{"preact":"/plugin-sdk/preact.js"}}</script>
<script type="module" src="/assets/index-abc123.js"></script>
</head><body></body></html>`;

test("hashes the inline import map so CSP lets it run", () => {
    const hashes = inlineScriptHashesFor(PAGE);

    // The plugin loader resolves bare `preact` through this map; without a hash
    // CSP blocks the inline script and every plugin fails to import.
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toStartWith("'sha256-");
    expect(hashes[0]).toEndWith("'");
});

test("the same map always hashes to the same value", () => {
    expect(inlineScriptHashesFor(PAGE)).toEqual(inlineScriptHashesFor(PAGE));
    expect(inlineScriptHashesFor(PAGE)).not.toEqual(
        inlineScriptHashesFor(PAGE.replace("/plugin-sdk/preact.js", "/other.js")),
    );
});

test("a page without an import map contributes no hashes", () => {
    expect(inlineScriptHashesFor("<html><head></head><body></body></html>")).toEqual([]);
});

test("the policy lists the hashes next to self and blob", () => {
    const policy = contentSecurityPolicy(["'sha256-abc123='"]);

    expect(policy).toContain("script-src 'self' blob: 'sha256-abc123='");
    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toContain("'unsafe-inline' 'self'");
});
