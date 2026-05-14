export function characterInitialAvatar(name: string) {
    const initial = (name.trim().charAt(0) || "?").toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="14" fill="#516179"/><text x="48" y="49" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="42" font-weight="800">${escapeSvgText(initial)}</text></svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeSvgText(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
