// IP allowlist + the CIDR/IP primitives every other security file uses.
//
// Set SMILEYCHAT_IP_ALLOWLIST to a comma-separated list of IPs or CIDR
// ranges. When set, only loopback + Tailscale/Docker (when their bypass
// flags are enabled) + the listed ranges may reach the server. When unset
// or empty, no allowlist-level restriction applies and the Basic Auth
// lockdown becomes the active gate.

import {
    getIpAllowlist,
    getTrustedPrivateNetworksOverride,
    isDockerBypassEnabled,
    isTailscaleBypassEnabled,
} from "../config/runtime-config";

export interface CidrEntry {
    bytes: number[];
    prefixLen: number;
}

export function ipToBytes(ip: string): number[] | null {
    let addr = ip.trim();
    if (!addr) return null;

    // Bracketed IPv6 literal
    if (addr.startsWith("[") && addr.endsWith("]")) {
        addr = addr.slice(1, -1);
    }

    // Strip IPv6 zone id (e.g. fe80::1%eth0)
    const zoneIdx = addr.indexOf("%");
    if (zoneIdx !== -1) addr = addr.slice(0, zoneIdx);

    // IPv4-mapped IPv6 (::ffff:a.b.c.d)
    if (addr.toLowerCase().startsWith("::ffff:") && addr.includes(".")) {
        return ipToBytes(addr.slice(7));
    }

    // IPv4
    const v4 = addr.split(".");
    if (v4.length === 4 && v4.every((part) => /^\d{1,3}$/.test(part))) {
        const nums = v4.map(Number);
        if (nums.every((n) => n >= 0 && n <= 255)) {
            return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...nums];
        }
    }

    // IPv6
    return expandIPv6(addr);
}

function expandIPv6(addr: string): number[] | null {
    const halves = addr.split("::");
    if (halves.length > 2) return null;

    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

    if (halves.length === 1 && left.length !== 8) return null;

    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;

    const groups = [...left, ...Array(missing).fill("0"), ...right];
    if (groups.length !== 8) return null;

    const bytes: number[] = [];
    for (const group of groups) {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
        const num = Number.parseInt(group, 16);
        bytes.push((num >> 8) & 0xff, num & 0xff);
    }
    return bytes;
}

export function parseCidr(entry: string): CidrEntry | null {
    const slashIdx = entry.indexOf("/");
    const ip = slashIdx === -1 ? entry : entry.slice(0, slashIdx);
    const bytes = ipToBytes(ip);
    if (!bytes) return null;

    if (slashIdx === -1) {
        return { bytes, prefixLen: 128 };
    }

    const rawPrefix = Number.parseInt(entry.slice(slashIdx + 1), 10);
    if (!Number.isFinite(rawPrefix) || rawPrefix < 0 || rawPrefix > 128) return null;

    const isV4 = ip.includes(".") && !ip.includes(":");
    const prefixLen = isV4 && rawPrefix <= 32 ? rawPrefix + 96 : rawPrefix;
    return { bytes, prefixLen };
}

export function matchesCidr(ipBytes: number[], cidr: CidrEntry): boolean {
    const fullBytes = Math.floor(cidr.prefixLen / 8);
    for (let i = 0; i < fullBytes; i += 1) {
        if (ipBytes[i] !== cidr.bytes[i]) return false;
    }

    const remainingBits = cidr.prefixLen % 8;
    if (remainingBits === 0 || fullBytes >= ipBytes.length) return true;

    const mask = (0xff << (8 - remainingBits)) & 0xff;
    return (ipBytes[fullBytes]! & mask) === (cidr.bytes[fullBytes]! & mask);
}

const LOOPBACK_CIDRS: CidrEntry[] = [
    parseCidr("127.0.0.0/8")!,
    parseCidr("::1/128")!,
];

const DEFAULT_PRIVATE_NETWORK_CIDRS: CidrEntry[] = [
    parseCidr("10.0.0.0/8")!,
    parseCidr("172.16.0.0/12")!,
    parseCidr("192.168.0.0/16")!,
    parseCidr("169.254.0.0/16")!,
    parseCidr("100.64.0.0/10")!,
    parseCidr("fc00::/7")!,
    parseCidr("fe80::/10")!,
];

const TAILSCALE_CIDR = parseCidr("100.64.0.0/10")!;
const DOCKER_CIDR = parseCidr("172.16.0.0/12")!;

let cachedAllowlist: { raw: string | null; entries: CidrEntry[] | null; announced: boolean } | null =
    null;

function buildAllowlist(raw: string | null): CidrEntry[] | null {
    if (!raw) return null;
    const entries: CidrEntry[] = [];
    for (const part of raw.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const cidr = parseCidr(trimmed);
        if (!cidr) {
            console.warn(`[ip-allowlist] Ignoring invalid entry: "${trimmed}"`);
            continue;
        }
        entries.push(cidr);
    }
    return entries.length === 0 ? null : entries;
}

function getAllowlist(): CidrEntry[] | null {
    const raw = getIpAllowlist();
    if (!cachedAllowlist || cachedAllowlist.raw !== raw) {
        cachedAllowlist = { raw, entries: buildAllowlist(raw), announced: false };
    }

    if (cachedAllowlist.entries && !cachedAllowlist.announced) {
        console.log(
            `[ip-allowlist] Restricting access to: ${cachedAllowlist.raw}  (+ loopback always allowed)`,
        );
        cachedAllowlist.announced = true;
    }

    return cachedAllowlist.entries;
}

let cachedPrivateNetworks: { raw: string | null; entries: CidrEntry[]; announced: boolean } | null =
    null;

function getPrivateNetworkCidrs(): CidrEntry[] {
    const raw = getTrustedPrivateNetworksOverride();
    if (!cachedPrivateNetworks || cachedPrivateNetworks.raw !== raw) {
        if (!raw) {
            cachedPrivateNetworks = {
                raw: null,
                entries: DEFAULT_PRIVATE_NETWORK_CIDRS,
                announced: true,
            };
        } else {
            const entries: CidrEntry[] = [];
            for (const part of raw.split(",")) {
                const trimmed = part.trim();
                if (!trimmed) continue;
                const cidr = parseCidr(trimmed);
                if (!cidr) {
                    console.warn(
                        `[trusted-private-networks] Ignoring invalid entry: "${trimmed}"`,
                    );
                    continue;
                }
                entries.push(cidr);
            }
            cachedPrivateNetworks = { raw, entries, announced: false };
        }
    }

    if (cachedPrivateNetworks.raw && !cachedPrivateNetworks.announced) {
        console.log(
            `[trusted-private-networks] Overriding default private-network list with: ${cachedPrivateNetworks.raw}`,
        );
        cachedPrivateNetworks.announced = true;
    }

    return cachedPrivateNetworks.entries;
}

export function isLoopbackIp(ip: string): boolean {
    const bytes = ipToBytes(ip);
    if (!bytes) return false;
    return LOOPBACK_CIDRS.some((entry) => matchesCidr(bytes, entry));
}

export function isInIpAllowlist(ip: string): boolean {
    const allowlist = getAllowlist();
    if (!allowlist) return false;
    const bytes = ipToBytes(ip);
    if (!bytes) return false;
    return allowlist.some((entry) => matchesCidr(bytes, entry));
}

export function isPrivateNetworkIp(ip: string): boolean {
    const bytes = ipToBytes(ip);
    if (!bytes) return false;
    return getPrivateNetworkCidrs().some((entry) => matchesCidr(bytes, entry));
}

export function isTailscaleIp(ip: string): boolean {
    const bytes = ipToBytes(ip);
    if (!bytes) return false;
    return matchesCidr(bytes, TAILSCALE_CIDR);
}

export function isDockerIp(ip: string): boolean {
    const bytes = ipToBytes(ip);
    if (!bytes) return false;
    return matchesCidr(bytes, DOCKER_CIDR);
}

const bypassAnnounced = { tailscale: false, docker: false };

export function isTrustedInterfaceIp(ip: string): boolean {
    const tailscaleOn = isTailscaleBypassEnabled();
    const dockerOn = isDockerBypassEnabled();
    if (!tailscaleOn && !dockerOn) return false;

    if (tailscaleOn && isTailscaleIp(ip)) {
        if (!bypassAnnounced.tailscale) {
            console.warn(
                "[auth-bypass] SMILEYCHAT_BYPASS_AUTH_TAILSCALE=true. Tailscale CGNAT clients (100.64.0.0/10) skip Basic Auth and IP allowlist.",
            );
            bypassAnnounced.tailscale = true;
        }
        return true;
    }

    if (dockerOn && isDockerIp(ip)) {
        if (!bypassAnnounced.docker) {
            console.warn(
                "[auth-bypass] SMILEYCHAT_BYPASS_AUTH_DOCKER=true. Docker bridge clients (172.16.0.0/12) skip Basic Auth and IP allowlist.",
            );
            bypassAnnounced.docker = true;
        }
        return true;
    }

    return false;
}

// Returns null when no allowlist is configured (the basic-auth lockdown
// becomes the active gate). Returns true/false otherwise.
export function checkIpAllowlist(ip: string): boolean | null {
    const allowlist = getAllowlist();
    if (!allowlist) return null;

    if (isLoopbackIp(ip)) return true;
    if (isTrustedInterfaceIp(ip)) return true;

    const bytes = ipToBytes(ip);
    if (!bytes) return false;
    return allowlist.some((entry) => matchesCidr(bytes, entry));
}
