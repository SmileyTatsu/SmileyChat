// Friendly HTML page shown to browser navigations that hit the Basic Auth
// lockdown. Programmatic clients (curl, /api/*, fetch) still get JSON.

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function renderLockdownPage(clientIp: string): string {
    const safeIp = escapeHtml(clientIp);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>SmileyChat: Set up access</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0e1320;
    --panel: #161c2c;
    --panel-2: #1d2438;
    --border: #2a3350;
    --text: #e8ecf6;
    --muted: #9aa3bd;
    --accent: #f4a35d;
    --accent-soft: rgba(244, 163, 93, 0.12);
    --code-bg: #0a0f1c;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: radial-gradient(1200px 800px at 80% -10%, #1a223a 0%, var(--bg) 60%) fixed;
    color: var(--text);
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 32px 16px 64px;
  }
  main { width: 100%; max-width: 720px; }
  header { margin-bottom: 24px; }
  .badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  h1 { font-size: 26px; line-height: 1.25; margin: 12px 0 8px; font-weight: 600; }
  p.lede { color: var(--muted); margin: 0; }
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px 22px;
    margin-top: 16px;
  }
  .panel h2 { font-size: 17px; margin: 0 0 6px; font-weight: 600; }
  .panel .hint { color: var(--muted); font-size: 14px; margin: 0 0 12px; }
  ol { margin: 0; padding-left: 20px; }
  ol li { margin: 6px 0; }
  code, pre {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
  }
  code {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
  }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    overflow-x: auto;
    margin: 8px 0 0;
  }
  .ip-pill {
    display: inline-block;
    background: var(--accent-soft);
    color: var(--accent);
    border-radius: 6px;
    padding: 1px 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
  }
  footer {
    margin-top: 20px;
    padding: 16px 22px;
    background: var(--panel-2);
    border: 1px dashed var(--border);
    border-radius: 12px;
    color: var(--muted);
    font-size: 13px;
  }
  footer strong { color: var(--text); }
  a { color: var(--accent); text-decoration: none; border-bottom: 1px dotted rgba(244,163,93,0.4); }
  a:hover { border-bottom-color: var(--accent); }
</style>
</head>
<body>
  <main>
    <header>
      <span class="badge">Access blocked</span>
      <h1>This SmileyChat install needs access control before remote devices can connect.</h1>
      <p class="lede">You're connecting from <span class="ip-pill">${safeIp}</span>, which isn't loopback. To protect your data, the server refuses non-local traffic until you choose how this device should authenticate. Pick one of the options below, save your <code>.env</code>, then refresh this page. No restart needed; settings take effect within ~2 seconds.</p>
    </header>

    <section class="panel">
      <h2>Option 1: Basic Auth (recommended)</h2>
      <p class="hint">Best for shared networks, Tailscale, or any device you don't fully control. The browser will prompt for the username and password once, then remember it.</p>
      <ol>
        <li>Open <code>.env</code> in the SmileyChat folder.</li>
        <li>Add (or edit) these lines, picking your own values:
          <pre>SMILEYCHAT_BASIC_AUTH_USER=yourname
SMILEYCHAT_BASIC_AUTH_PASS=a-long-random-password</pre>
        </li>
        <li>Save the file and refresh this page. The browser will prompt for credentials.</li>
      </ol>
    </section>

    <section class="panel">
      <h2>Option 2: IP allowlist</h2>
      <p class="hint">Best when only a few known devices need to connect (your phone on a home Wi-Fi, specific Tailscale peers, etc.).</p>
      <ol>
        <li>Open <code>.env</code>.</li>
        <li>Add this line. Your current IP is filled in; comma-separate additional entries (CIDR allowed):
          <pre>SMILEYCHAT_IP_ALLOWLIST=${safeIp}</pre>
        </li>
        <li>Save and refresh.</li>
      </ol>
    </section>

    <footer>
      <strong>On a fully trusted private network?</strong> You can restore passwordless LAN access with <code>SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK=true</code> in <code>.env</code>. Only do this when you trust every device that can reach this server, because anyone on the network will have full access without a password.
    </footer>
  </main>
</body>
</html>`;
}
