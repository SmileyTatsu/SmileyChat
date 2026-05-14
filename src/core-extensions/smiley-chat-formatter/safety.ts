const colorNames = new Set([
    "black",
    "white",
    "gray",
    "grey",
    "red",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "pink",
    "cyan",
    "magenta",
    "silver",
    "gold",
]);

export function safeColor(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    const color = value.trim().toLowerCase();

    if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(color)) {
        return color;
    }

    if (/^[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(color)) {
        return `#${color}`;
    }

    if (colorNames.has(color)) {
        return color;
    }

    return "";
}

export function safeSize(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    const size = value.trim().toLowerCase();

    if (["small", "normal", "large"].includes(size)) {
        return size === "normal" ? "" : size;
    }

    if (["1", "2"].includes(size)) {
        return "small";
    }

    if (["4", "5", "6", "7"].includes(size)) {
        return "large";
    }

    return "";
}

export function safeImageUrl(value: unknown) {
    const href = safeUrl(value);

    if (!href) {
        return "";
    }

    try {
        const url = new URL(href, window.location.href);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
}

export function safeUrl(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    try {
        const url = new URL(value, window.location.href);
        return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
}
