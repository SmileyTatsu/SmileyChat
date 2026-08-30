import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render } from "preact";
import { ConfirmDialog } from "./confirm-dialog";
import {
    getActiveDialogStack,
    pushDialog,
    resetDialogStackForTesting,
} from "./dialog-manager";

class MockDOMElement {
    nodeType = 1;
    tagName: string;
    attributes: Record<string, string> = {};
    childNodes: (MockDOMElement | MockTextNode)[] = [];
    parentNode: MockDOMElement | null = null;
    style: Record<string, string> = {};
    listeners: Record<string, ((e: any) => void)[]> = {};
    disabled = false;
    tabIndex = 0;
    offsetParent: any = {};

    constructor(tagName: string) {
        this.tagName = tagName.toUpperCase();
    }

    get className(): string {
        return this.attributes["class"] || "";
    }

    set className(val: string) {
        this.attributes["class"] = val;
    }

    get classList() {
        return {
            contains: (c: string) => this.className.split(/\s+/).includes(c),
            add: (c: string) => {
                const list = this.className.split(/\s+/).filter(Boolean);
                if (!list.includes(c)) list.push(c);
                this.className = list.join(" ");
            },
            remove: (c: string) => {
                this.className = this.className
                    .split(/\s+/)
                    .filter((cls) => cls !== c)
                    .join(" ");
            },
        };
    }

    setAttribute(k: string, v: string) {
        this.attributes[k] = String(v);
    }

    getAttribute(k: string) {
        return this.attributes[k] ?? null;
    }

    removeAttribute(k: string) {
        delete this.attributes[k];
    }

    appendChild(child: MockDOMElement | MockTextNode) {
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }

    removeChild(child: MockDOMElement | MockTextNode) {
        const i = this.childNodes.indexOf(child);
        if (i > -1) {
            this.childNodes.splice(i, 1);
            child.parentNode = null;
        }
        return child;
    }

    insertBefore(
        newNode: MockDOMElement | MockTextNode,
        refNode: MockDOMElement | MockTextNode | null,
    ) {
        if (!refNode) return this.appendChild(newNode);
        const i = this.childNodes.indexOf(refNode);
        if (i > -1) {
            this.childNodes.splice(i, 0, newNode);
            newNode.parentNode = this;
        } else {
            this.appendChild(newNode);
        }
        return newNode;
    }

    addEventListener(type: string, fn: (e: any) => void) {
        (this.listeners[type] ??= []).push(fn);
    }

    removeEventListener(type: string, fn: (e: any) => void) {
        if (this.listeners[type]) {
            this.listeners[type] = this.listeners[type].filter((cb) => cb !== fn);
        }
    }

    dispatchEvent(event: any): boolean {
        const type = event.type;
        const list = this.listeners[type] || [];
        for (const handler of list) {
            handler.call(this, event);
        }
        return true;
    }

    get textContent(): string {
        return this.childNodes.map((c) => c.textContent).join("");
    }

    set textContent(v: string) {
        this.childNodes = [new MockTextNode(v)];
    }

    getClientRects() {
        return [{ width: 10, height: 10 }];
    }

    focus() {
        if (typeof document !== "undefined") {
            (document as any).activeElement = this;
        }
    }

    querySelectorAll(selector: string): MockDOMElement[] {
        const results: MockDOMElement[] = [];
        const match = (el: MockDOMElement) => {
            if (selector.includes("button") && el.tagName === "BUTTON") return true;
            if (selector.includes("p") && el.tagName === "P") return true;
            if (selector.includes("h2") && el.tagName === "H2") return true;
            if (selector.includes("section") && el.tagName === "SECTION") return true;
            if (
                selector.includes(".confirm-dialog-error") &&
                el.classList.contains("confirm-dialog-error")
            )
                return true;
            return false;
        };
        const traverse = (node: MockDOMElement) => {
            for (const child of node.childNodes) {
                if (child instanceof MockDOMElement) {
                    if (match(child)) results.push(child);
                    traverse(child);
                }
            }
        };
        traverse(this);
        return results;
    }

    querySelector(selector: string): MockDOMElement | null {
        return this.querySelectorAll(selector)[0] ?? null;
    }

    contains(other: any): boolean {
        if (!other) return false;
        if (other === this) return true;
        let curr = other.parentNode;
        while (curr) {
            if (curr === this) return true;
            curr = curr.parentNode;
        }
        return false;
    }
}

class MockTextNode {
    nodeType = 3;
    nodeValue: string;
    parentNode: MockDOMElement | null = null;

    constructor(text: string) {
        this.nodeValue = text;
    }

    get textContent(): string {
        return this.nodeValue;
    }

    set textContent(v: string) {
        this.nodeValue = v;
    }
}

describe("ConfirmDialog", () => {
    let origDoc: any;
    let origWin: any;
    let mountedRoots: MockDOMElement[] = [];

    beforeEach(() => {
        resetDialogStackForTesting();
        origDoc = (globalThis as any).document;
        origWin = (globalThis as any).window;
        mountedRoots = [];

        const bodyElement = new MockDOMElement("body");

        (globalThis as any).document = {
            createElement: (tag: string) => new MockDOMElement(tag),
            createElementNS: (_ns: string, tag: string) => new MockDOMElement(tag),
            createTextNode: (text: string) => new MockTextNode(text),
            activeElement: null,
            body: bodyElement,
        };

        (globalThis as any).window = {
            addEventListener: () => {},
            removeEventListener: () => {},
            setTimeout: (fn: Function, delay?: number) => {
                return setTimeout(fn, delay ?? 0);
            },
            clearTimeout: (id: any) => {
                clearTimeout(id);
            },
        };
    });

    afterEach(() => {
        for (const root of mountedRoots) {
            render(null, root as any);
        }
        (globalThis as any).document = origDoc;
        (globalThis as any).window = origWin;
        resetDialogStackForTesting();
    });

    test("renders default variant with accessible dialog role, title, and buttons", () => {
        const root = new MockDOMElement("div");
        mountedRoots.push(root);
        const handleConfirm = mock(() => {});
        const handleClose = mock(() => {});

        render(
            <ConfirmDialog
                title="Save Changes?"
                message="Are you sure you want to save?"
                confirmLabel="Save"
                onConfirm={handleConfirm}
                onClose={handleClose}
            />,
            root as any,
        );

        expect(root.textContent).toContain("Save Changes?");
        expect(root.textContent).toContain("Are you sure you want to save?");
        expect(root.textContent).toContain("Cancel");
        expect(root.textContent).toContain("Save");

        const section = root.querySelector("section");
        expect(section?.getAttribute("role")).toBe("dialog");
        expect(section?.classList.contains("variant-default")).toBe(true);
        expect(section?.getAttribute("aria-modal")).toBe("true");
        expect(section?.getAttribute("aria-labelledby")).not.toBeNull();
        expect(section?.getAttribute("aria-describedby")).not.toBeNull();
    });

    test("renders danger variant with alertdialog role and Delete button", () => {
        const root = new MockDOMElement("div");
        mountedRoots.push(root);
        const handleClose = mock(() => {});

        render(
            <ConfirmDialog
                title="Delete Character?"
                message="This cannot be undone."
                variant="danger"
                onConfirm={() => {}}
                onClose={handleClose}
            />,
            root as any,
        );

        const section = root.querySelector("section");
        expect(section?.getAttribute("role")).toBe("alertdialog");
        expect(section?.classList.contains("variant-danger")).toBe(true);
        expect(root.textContent).toContain("Delete");
    });

    test("renders details warning list", () => {
        const root = new MockDOMElement("div");
        mountedRoots.push(root);

        render(
            <ConfirmDialog
                title="Preset Warning"
                details={["Sampler modified", "Template missing"]}
                onClose={() => {}}
            />,
            root as any,
        );

        expect(root.textContent).toContain("Sampler modified");
        expect(root.textContent).toContain("Template missing");
    });

    test("renders custom children in actions", () => {
        const root = new MockDOMElement("div");
        mountedRoots.push(root);

        render(
            <ConfirmDialog title="Delete Character?" variant="danger" onClose={() => {}}>
                <button type="button">Keep chats</button>
                <button type="button">Delete all</button>
            </ConfirmDialog>,
            root as any,
        );

        expect(root.textContent).toContain("Keep chats");
        expect(root.textContent).toContain("Delete all");
        expect(root.textContent).toContain("Cancel");
    });

    test("renders busy state and disables buttons", () => {
        const root = new MockDOMElement("div");
        mountedRoots.push(root);

        render(
            <ConfirmDialog
                title="Processing..."
                isBusy={true}
                onConfirm={() => {}}
                onClose={() => {}}
            />,
            root as any,
        );

        const buttons = root.querySelectorAll("button");
        expect(buttons[0].disabled).toBe(true);
        expect(buttons[1].disabled).toBe(true);
    });

    test("handles focus and tab navigation references", () => {
        const root = new MockDOMElement("div");
        mountedRoots.push(root);

        render(
            <ConfirmDialog
                title="Tab Trap Test"
                onConfirm={() => {}}
                onClose={() => {}}
            />,
            root as any,
        );

        const section = root.querySelector("section");
        expect(section).not.toBeNull();
        const buttons = root.querySelectorAll("button");
        expect(buttons.length).toBe(2);
    });
});
