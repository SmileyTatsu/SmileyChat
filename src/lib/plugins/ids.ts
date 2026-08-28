export function pluginIdFromScopedId(id: string) {
    return id.split(":")[0] || id;
}
