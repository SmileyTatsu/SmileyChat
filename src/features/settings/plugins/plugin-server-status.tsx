import { Terminal } from "lucide-preact";

import type { PluginServerStatusLine } from "./plugin-settings-helpers";

/**
 * The server part still belongs to the Approvals block: one short line above
 * the switches, not a second banner. Tones reuse the palette the grant rows
 * already use (amber while waiting, green once granted, the card's error red).
 */
export function PluginServerStatus({
    line,
}: {
    line: PluginServerStatusLine | undefined;
}) {
    if (!line) {
        return null;
    }

    return (
        <p className={`plugin-grant-server ${line.tone}`} role="status">
            <Terminal size={11} aria-hidden="true" />
            <span>{line.text}</span>
            {line.detail && <small>{line.detail}</small>}
        </p>
    );
}
