// Single source of truth for environment-driven settings. Every security
// middleware reads through one of the getters below so a hot-reloaded .env
// takes effect on the next request without restarting the server.
//
// Naming convention: every SmileyChat-owned variable carries the
// `SMILEYCHAT_` prefix so it can sit next to a user's other env vars
// without ambiguity.

// Bind to all interfaces by default so Tailscale / LAN access works
// out of the box. The safe-by-default lockdown in basic-auth.ts refuses
// non-loopback connections until the user sets up Basic Auth, an IP
// allowlist, or explicitly opts into unauthenticated remote access, so
// "0.0.0.0 by default" doesn't expose chats or API keys to the network
// in a fresh install. Override with SMILEYCHAT_HOST=127.0.0.1 to bind
// loopback only.
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 4173;
const DEFAULT_FRONTEND_PORT = 5173;
const DEFAULT_BASIC_AUTH_REALM = "SmileyChat";
const DEFAULT_RATE_LIMIT_PER_MINUTE = 600;

function normalizeEnvValue(value: string | undefined | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
}

function parseCsv(value: string | undefined | null): string[] {
    return (value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function isEnabledFlag(value: string | undefined | null) {
    return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function isDisabledFlag(value: string | undefined | null) {
    return ["0", "false", "no", "off"].includes((value ?? "").trim().toLowerCase());
}

function parsePort(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const num = Number.parseInt(value, 10);
    if (Number.isInteger(num) && num >= 1 && num <= 65535) return num;
    console.warn(`[runtime-config] Invalid port "${value}"; falling back to ${fallback}.`);
    return fallback;
}

export function getHost() {
    return normalizeEnvValue(process.env.SMILEYCHAT_HOST) ?? DEFAULT_HOST;
}

export function getPort() {
    return parsePort(
        process.env.SMILEYCHAT_PORT ?? process.env.SMILEYCHAT_API_PORT,
        DEFAULT_PORT,
    );
}

export function getFrontendPort() {
    return parsePort(process.env.SMILEYCHAT_FRONTEND_PORT, DEFAULT_FRONTEND_PORT);
}

export function getCsrfTrustedOrigins() {
    return parseCsv(process.env.SMILEYCHAT_TRUSTED_ORIGINS);
}

export function getIpAllowlist() {
    if (isDisabledFlag(process.env.SMILEYCHAT_IP_ALLOWLIST_ENABLED)) return null;
    return normalizeEnvValue(process.env.SMILEYCHAT_IP_ALLOWLIST);
}

export function getTrustedPrivateNetworksOverride() {
    return normalizeEnvValue(process.env.SMILEYCHAT_TRUSTED_PRIVATE_NETWORKS);
}

export function getBasicAuthConfig() {
    return {
        user: normalizeEnvValue(process.env.SMILEYCHAT_BASIC_AUTH_USER),
        pass: normalizeEnvValue(process.env.SMILEYCHAT_BASIC_AUTH_PASS),
        realm:
            normalizeEnvValue(process.env.SMILEYCHAT_BASIC_AUTH_REALM) ??
            DEFAULT_BASIC_AUTH_REALM,
    };
}

export function isUnauthenticatedPrivateNetworkAllowed() {
    return isEnabledFlag(process.env.SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK);
}

export function isUnauthenticatedRemoteAllowed() {
    return isEnabledFlag(process.env.SMILEYCHAT_ALLOW_UNAUTHENTICATED_REMOTE);
}

// Default-on: Tailscale CGNAT traffic skips both the IP allowlist and
// Basic Auth, the same way loopback does. Set the env var to false/0/no/off
// to require auth from your Tailnet as well.
export function isTailscaleBypassEnabled() {
    return !isDisabledFlag(process.env.SMILEYCHAT_BYPASS_AUTH_TAILSCALE);
}

// Default-on: Docker bridge IPs are unreachable from outside the host.
// External traffic is NAT'd through the bridge gateway, so bypassing auth
// for containers is generally safe.
export function isDockerBypassEnabled() {
    return !isDisabledFlag(process.env.SMILEYCHAT_BYPASS_AUTH_DOCKER);
}

export function isRateLimitEnabled() {
    return !isDisabledFlag(process.env.SMILEYCHAT_RATE_LIMIT_ENABLED);
}

export function getDefaultRateLimit() {
    return parsePort(process.env.SMILEYCHAT_RATE_LIMIT_DEFAULT, DEFAULT_RATE_LIMIT_PER_MINUTE);
}

export function getAdminSecret() {
    return normalizeEnvValue(process.env.SMILEYCHAT_ADMIN_SECRET);
}

export function isAdminSecretRequiredOnLoopback() {
    return isEnabledFlag(process.env.SMILEYCHAT_REQUIRE_ADMIN_SECRET_ON_LOOPBACK);
}

export function isPluginsOutboundFetchAllowed() {
    return isEnabledFlag(process.env.SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH);
}

export function getLogLevel() {
    return normalizeEnvValue(process.env.SMILEYCHAT_LOG_LEVEL) ?? "info";
}

export { isEnabledFlag, isDisabledFlag };
