import { type Dispatch, type StateUpdater, useState } from "preact/hooks";

export function useLocalStorageBoolean(
    key: string,
    defaultValue = false,
): [boolean, Dispatch<StateUpdater<boolean>>] {
    const [value, setValue] = useState(() => {
        const storedValue = localStorage.getItem(key);
        return storedValue === null ? defaultValue : storedValue === "true";
    });

    function setStoredValue(nextValue: boolean | ((value: boolean) => boolean)) {
        setValue((currentValue) => {
            const resolvedValue =
                typeof nextValue === "function" ? nextValue(currentValue) : nextValue;

            localStorage.setItem(key, String(resolvedValue));
            return resolvedValue;
        });
    }

    return [value, setStoredValue];
}
