/**
 * Minimal semver-style version comparison for plugin update checks.
 *
 * Versions are `major.minor.patch` with an optional prerelease tag and build
 * metadata, for example `1.2.0-beta.2+20260617`. A leading `v` is tolerated
 * because plugin manifests and Git tags commonly use it.
 *
 * Fallback for malformed input: an unparseable version ranks below every valid
 * version, and two unparseable versions compare as equal. Callers therefore
 * never see a malformed registry version treated as an update, and a malformed
 * installed version can still be replaced by a valid one.
 */

type ParsedVersion = {
    major: number;
    minor: number;
    patch: number;
    prerelease: string[];
};

function parseVersion(value: string): ParsedVersion | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    let text = value.trim();

    if (!text) {
        return undefined;
    }

    if (text[0] === "v" || text[0] === "V") {
        text = text.slice(1).trim();
    }

    if (!text) {
        return undefined;
    }

    // Build metadata never participates in precedence.
    const buildIndex = text.indexOf("+");

    if (buildIndex >= 0) {
        text = text.slice(0, buildIndex);
    }

    let prerelease: string[] = [];
    const prereleaseIndex = text.indexOf("-");

    if (prereleaseIndex >= 0) {
        const prereleaseText = text.slice(prereleaseIndex + 1);
        text = text.slice(0, prereleaseIndex);
        prerelease = prereleaseText.split(".");

        if (
            prerelease.length === 0 ||
            prerelease.some(
                (identifier) => !identifier || !/^[0-9A-Za-z-]+$/.test(identifier),
            )
        ) {
            return undefined;
        }
    }

    const coreParts = text.split(".");

    if (coreParts.length === 0 || coreParts.length > 3) {
        return undefined;
    }

    const core: number[] = [];

    for (const part of coreParts) {
        if (!/^\d+$/.test(part)) {
            return undefined;
        }

        const number = Number(part);

        if (!Number.isSafeInteger(number)) {
            return undefined;
        }

        core.push(number);
    }

    while (core.length < 3) {
        core.push(0);
    }

    return {
        major: core[0],
        minor: core[1],
        patch: core[2],
        prerelease,
    };
}

/** Compares two versions. Returns a negative number when `a` sorts first. */
export function compareVersions(a: string, b: string): number {
    const left = parseVersion(a);
    const right = parseVersion(b);

    if (!left && !right) {
        return 0;
    }

    if (!left) {
        return -1;
    }

    if (!right) {
        return 1;
    }

    const leftCore = [left.major, left.minor, left.patch];
    const rightCore = [right.major, right.minor, right.patch];

    for (let index = 0; index < leftCore.length; index += 1) {
        if (leftCore[index] !== rightCore[index]) {
            return leftCore[index] < rightCore[index] ? -1 : 1;
        }
    }

    return comparePrerelease(left.prerelease, right.prerelease);
}

/** True when `candidate` is a strictly newer version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
    return compareVersions(candidate, current) > 0;
}

function comparePrerelease(left: string[], right: string[]): number {
    // A release outranks any prerelease of the same core version.
    if (left.length === 0 && right.length === 0) {
        return 0;
    }

    if (left.length === 0) {
        return 1;
    }

    if (right.length === 0) {
        return -1;
    }

    const sharedLength = Math.min(left.length, right.length);

    for (let index = 0; index < sharedLength; index += 1) {
        const comparison = comparePrereleaseIdentifier(left[index], right[index]);

        if (comparison !== 0) {
            return comparison;
        }
    }

    if (left.length === right.length) {
        return 0;
    }

    return left.length < right.length ? -1 : 1;
}

function comparePrereleaseIdentifier(left: string, right: string): number {
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);

    if (leftNumeric && rightNumeric) {
        return Number(left) === Number(right) ? 0 : Number(left) < Number(right) ? -1 : 1;
    }

    if (leftNumeric) {
        return -1;
    }

    if (rightNumeric) {
        return 1;
    }

    if (left === right) {
        return 0;
    }

    return left < right ? -1 : 1;
}
