import { HttpError } from "./http";

const entityIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function assertSafeEntityId(value: string, label: string) {
    if (!entityIdPattern.test(value)) {
        throw new HttpError(400, `Invalid ${label} id.`);
    }
}

export function safeEntityFileStem(value: string, label: string) {
    assertSafeEntityId(value, label);
    return value;
}
