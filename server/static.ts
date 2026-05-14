import { extname, isAbsolute, join, normalize, relative } from "node:path";
import { distDir } from "./paths";

export async function serveStatic(url: URL) {
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const requestedPath = normalize(join(distDir, pathname));
    const safeDistDir = normalize(distDir);
    const relativePath = relative(safeDistDir, requestedPath);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
        return new Response("Not found", { status: 404 });
    }

    const file = Bun.file(requestedPath);

    if (await file.exists()) {
        return new Response(file);
    }

    if (extname(pathname)) {
        return new Response("Not found", { status: 404 });
    }

    const indexFile = Bun.file(join(distDir, "index.html"));

    if (!(await indexFile.exists())) {
        return new Response("SmileyChat build not found. Run bun run build first.", {
            status: 500,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
            },
        });
    }

    return new Response(indexFile);
}
