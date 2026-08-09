import type { ComponentChild } from "preact";

import type { FormatterApi } from "./nodes";
import { getFormatterSettings } from "./settings";

export function renderSpoiler(api: FormatterApi, children: ComponentChild) {
    if (!getFormatterSettings().spoilers) {
        return api.ui.h("span", null, children);
    }

    return api.ui.h(
        "span",
        {
            "aria-expanded": "false",
            className: "scf-spoiler",
            role: "button",
            tabIndex: 0,
            onClick: revealSpoiler,
            onKeyDown: (event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    revealSpoiler(event);
                }
            },
        },
        children,
    );
}

function revealSpoiler(event: Event) {
    const target = event.currentTarget;

    if (!(target instanceof HTMLElement)) {
        return;
    }

    target.classList.add("is-revealed");
    target.setAttribute("aria-expanded", "true");
}
