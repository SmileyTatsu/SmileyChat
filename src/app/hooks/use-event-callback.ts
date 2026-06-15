import { useCallback, useLayoutEffect, useRef } from "preact/hooks";

export function useEventCallback<TArgs extends unknown[], TReturn>(
    callback: (...args: TArgs) => TReturn,
) {
    const callbackRef = useRef(callback);

    useLayoutEffect(() => {
        callbackRef.current = callback;
    });

    return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}
