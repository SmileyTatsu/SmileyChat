import { readdir, rm } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import defaultInstructTemplates from "#frontend/data/default-instruct-templates";
import { isRecord } from "#frontend/lib/common/guards";
import {
    isValidInstructTemplateId,
    normalizeCustomInstructTemplate,
    parseInstructTemplateJson,
    type CustomInstructTemplate,
} from "#frontend/lib/instruct";

import { writeJsonAtomic } from "./http";
import { instructDir, instructTemplatesPath } from "./paths";

export async function readInstructTemplates(): Promise<CustomInstructTemplate[]> {
    const templatesMap = new Map<string, CustomInstructTemplate>();

    // 1. Read user-saved templates collection
    if (await Bun.file(instructTemplatesPath).exists()) {
        try {
            const content = await Bun.file(instructTemplatesPath).json();
            const list = Array.isArray(content)
                ? content
                : isRecord(content) && Array.isArray(content.templates)
                  ? content.templates
                  : [];
            for (const item of list) {
                const normalized = normalizeCustomInstructTemplate(item);
                if (normalized.id) {
                    templatesMap.set(normalized.id, normalized);
                }
            }
        } catch {
            // Ignore corrupted collection file
        }
    }

    // 2. Read loose JSON files in userData/instruct
    try {
        const entries = await readdir(instructDir, { withFileTypes: true });
        for (const entry of entries) {
            if (
                entry.isFile() &&
                extname(entry.name).toLowerCase() === ".json" &&
                entry.name.toLowerCase() !== "templates.json"
            ) {
                const filePath = join(instructDir, entry.name);
                try {
                    const raw = await Bun.file(filePath).json();
                    const parsed = parseInstructTemplateJson(raw);
                    const fileId = basename(entry.name, extname(entry.name));
                    const template = normalizeCustomInstructTemplate({
                        ...parsed.template,
                        id: parsed.template.id || fileId,
                        name: parsed.template.name || fileId,
                    });
                    if (template.id) {
                        templatesMap.set(template.id, template);
                    }
                } catch {
                    // Ignore unparseable loose files
                }
            }
        }
    } catch {
        // Directory may not exist yet
    }

    return Array.from(templatesMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

export async function writeInstructTemplates(
    value: unknown,
): Promise<CustomInstructTemplate[]> {
    const list = Array.isArray(value)
        ? value
        : isRecord(value) && Array.isArray(value.templates)
          ? value.templates
          : [];
    const normalized = list.map(normalizeCustomInstructTemplate);
    await writeJsonAtomic(instructTemplatesPath, {
        version: 1,
        templates: normalized,
    });
    return normalized;
}

export async function saveInstructTemplate(value: unknown): Promise<{
    template: CustomInstructTemplate;
    templates: CustomInstructTemplate[];
}> {
    const record = isRecord(value) ? value : {};
    const parsed = isRecord(value) ? parseInstructTemplateJson(value) : null;
    const template = normalizeCustomInstructTemplate(
        parsed ? { ...parsed.template, ...record } : record,
    );

    if (!template.id) {
        throw new Error("Instruct template must have a valid identifier.");
    }

    const current = await readInstructTemplates();
    const existingIndex = current.findIndex((item) => item.id === template.id);

    let updatedList: CustomInstructTemplate[];
    if (existingIndex >= 0) {
        const existing = current[existingIndex];
        const merged: CustomInstructTemplate = {
            ...existing,
            ...template,
            id: existing.id,
            updatedAt: new Date().toISOString(),
        };
        updatedList = [
            ...current.slice(0, existingIndex),
            merged,
            ...current.slice(existingIndex + 1),
        ];
    } else {
        const created: CustomInstructTemplate = {
            ...template,
            createdAt: template.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        updatedList = [...current, created];
    }

    await writeInstructTemplates(updatedList);
    const saved = updatedList.find((item) => item.id === template.id) ?? template;
    return { template: saved, templates: updatedList };
}

export async function deleteInstructTemplate(
    templateId: string,
): Promise<CustomInstructTemplate[]> {
    if (!isValidInstructTemplateId(templateId)) {
        throw new Error("Instruct template ID is invalid.");
    }
    const current = await readInstructTemplates();
    const filtered = current.filter((item) => item.id !== templateId);
    await writeInstructTemplates(filtered);

    // Remove matching loose files by enumerating the trusted directory. Do not
    // construct a path from a client-controlled identifier.
    try {
        const entries = await readdir(instructDir, { withFileTypes: true });
        for (const entry of entries) {
            if (
                !entry.isFile() ||
                extname(entry.name).toLowerCase() !== ".json" ||
                entry.name.toLowerCase() === "templates.json"
            ) {
                continue;
            }
            const filePath = join(instructDir, entry.name);
            try {
                const parsed = parseInstructTemplateJson(await Bun.file(filePath).json());
                if (parsed.template.id === templateId) {
                    await rm(filePath, { force: true });
                }
            } catch {
                // Keep unparseable user files untouched.
            }
        }
    } catch {
        // Ignore deletion error
    }

    return filtered;
}
