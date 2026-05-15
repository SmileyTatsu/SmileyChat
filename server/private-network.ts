// CIDR membership checks for the IPv4 / IPv6 ranges SmileyChat auto-trusts as
// CSRF origins when the request's Host header matches. Kept narrow so the
// auto-trust applies to genuinely private network deployments (LAN, Tailscale,
// Docker bridge, IPv6 ULA / link-local) and nothing else. Loopback is handled
// upstream by the existing request-URL-origin trust path.

type CidrRange = {
    bytes: number[];
    prefixLen: number;
};

// All ranges are stored in 16-byte form; IPv4 entries occupy the IPv4-mapped
// IPv6 segment (::ffff:0:0/96), and their prefix lengths are offset by 96.
const trustedPrivateRanges: CidrRange[] = [
    parseCidr("10.0.0.0/8"), // RFC 1918
    parseCidr("172.16.0.0/12"), // RFC 1918 (covers Docker default bridge 172.17.0.0/16)
    parseCidr("192.168.0.0/16"), // RFC 1918
    parseCidr("169.254.0.0/16"), // RFC 3927 IPv4 link-local
    parseCidr("100.64.0.0/10"), // RFC 6598 (Tailscale CGNAT, carrier NAT)
    parseCidr("fc00::/7"), // RFC 4193 IPv6 unique local (covers Tailscale IPv6 fd7a:.../48)
    parseCidr("fe80::/10"), // RFC 4291 IPv6 link-local
].filter((range): range is CidrRange => range !== null);

export function isPrivateNetworkHostname(hostname: string): boolean {
    const bytes = parseIpAddress(unbracket(hostname));
    if (!bytes) {
        return false;
    }
    return trustedPrivateRanges.some((range) => bytesMatchCidr(bytes, range));
}

function unbracket(host: string): string {
    return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function parseIpAddress(value: string): number[] | null {
    const stripped = value.split("%")[0] ?? value;

    if (stripped.toLowerCase().startsWith("::ffff:") && stripped.includes(".")) {
        return parseIpv4(stripped.slice(7));
    }

    const ipv4Bytes = parseIpv4(stripped);
    if (ipv4Bytes) {
        return ipv4Bytes;
    }

    return parseIpv6(stripped);
}

function parseIpv4(value: string): number[] | null {
    const parts = value.split(".");
    if (parts.length !== 4) {
        return null;
    }

    const octets: number[] = [];
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) {
            return null;
        }
        const num = Number.parseInt(part, 10);
        if (num < 0 || num > 255) {
            return null;
        }
        octets.push(num);
    }

    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...octets];
}

function parseIpv6(value: string): number[] | null {
    const halves = value.split("::");
    if (halves.length > 2) {
        return null;
    }

    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

    if (halves.length === 1 && left.length !== 8) {
        return null;
    }

    const missing = 8 - left.length - right.length;
    if (missing < 0) {
        return null;
    }

    const groups = [...left, ...Array(missing).fill("0"), ...right];
    if (groups.length !== 8) {
        return null;
    }

    const bytes: number[] = [];
    for (const group of groups) {
        if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
            return null;
        }
        const num = Number.parseInt(group, 16);
        bytes.push((num >> 8) & 0xff, num & 0xff);
    }

    return bytes;
}

function parseCidr(input: string): CidrRange | null {
    const slashIndex = input.indexOf("/");
    const ip = slashIndex === -1 ? input : input.slice(0, slashIndex);
    const bytes = parseIpAddress(ip);
    if (!bytes) {
        return null;
    }

    if (slashIndex === -1) {
        return { bytes, prefixLen: 128 };
    }

    const rawPrefix = Number.parseInt(input.slice(slashIndex + 1), 10);
    if (!Number.isFinite(rawPrefix) || rawPrefix < 0 || rawPrefix > 128) {
        return null;
    }

    const isIpv4 = ip.includes(".") && !ip.includes(":");
    const prefixLen = isIpv4 && rawPrefix <= 32 ? rawPrefix + 96 : rawPrefix;
    return { bytes, prefixLen };
}

function bytesMatchCidr(address: number[], cidr: CidrRange): boolean {
    const fullBytes = Math.floor(cidr.prefixLen / 8);
    for (let i = 0; i < fullBytes; i += 1) {
        if (address[i] !== cidr.bytes[i]) {
            return false;
        }
    }

    const remainingBits = cidr.prefixLen % 8;
    if (remainingBits === 0 || fullBytes >= address.length) {
        return true;
    }

    const mask = (0xff << (8 - remainingBits)) & 0xff;
    return (address[fullBytes]! & mask) === (cidr.bytes[fullBytes]! & mask);
}
