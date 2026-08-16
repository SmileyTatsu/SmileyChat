import type { CustomInstructTemplate } from "#frontend/lib/instruct";

const templateModules = import.meta.glob("./*.json", {
    eager: true,
    import: "default",
}) as Record<string, CustomInstructTemplate>;

export const defaultInstructTemplates: CustomInstructTemplate[] = Object.values(
    templateModules,
).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

export default defaultInstructTemplates;
