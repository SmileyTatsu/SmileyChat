# Security model

SmileyChat binds to **`0.0.0.0` by default** so LAN devices, Tailscale
peers, and Docker containers can reach it out of the box. The
**safe-by-default lockdown** keeps that safe: until you set up Basic
Auth or an IP allowlist, any non-loopback request gets a friendly "set
up access" page instead of your data. Loopback (`127.0.0.1`) is always
exempt, so local browser use needs no configuration at all.

If you'd rather not bind any interface but loopback, set
`SMILEYCHAT_HOST=127.0.0.1` in `.env`.

Every protection layer is configured through environment variables in
`.env`. The file is auto-created from `.env.example` on first boot, and
edits hot-reload within ~2 seconds, no restart needed for any setting
except port/host/CSRF secret.

## Layers, top to bottom

| Layer | Purpose | Default | Env vars |
|---|---|---|---|
| Server binding | What interfaces the OS can reach the server on | all interfaces (`0.0.0.0`) | `SMILEYCHAT_HOST`, `SMILEYCHAT_PORT` |
| IP allowlist | Network-level deny-by-default | no allowlist | `SMILEYCHAT_IP_ALLOWLIST`, `SMILEYCHAT_IP_ALLOWLIST_ENABLED` |
| Trusted-interface bypass | Skip allowlist & auth for known-safe networks | Tailscale + Docker on | `SMILEYCHAT_BYPASS_AUTH_TAILSCALE`, `SMILEYCHAT_BYPASS_AUTH_DOCKER` |
| Rate limit | Throttle abuse / accidental floods | 600 req/min/IP | `SMILEYCHAT_RATE_LIMIT_ENABLED`, `SMILEYCHAT_RATE_LIMIT_DEFAULT` |
| Basic Auth | Username/password gate | unset → lockdown for non-loopback | `SMILEYCHAT_BASIC_AUTH_USER/PASS/REALM` |
| Remote lockdown | Fail-closed when neither allowlist nor Basic Auth is set | enforced | `SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK`, `_REMOTE` |
| Trusted private nets | Which CIDRs count as "private" for the lockdown's purposes | RFC 1918 + CGNAT + link-local + IPv6 ULA | `SMILEYCHAT_TRUSTED_PRIVATE_NETWORKS` |
| CSRF | Origin/Referer + signed token + magic header on every write | on | `SMILEYCHAT_TRUSTED_ORIGINS`, `SMILEYCHAT_CSRF_SECRET` |
| Security headers | CSP, X-Frame-Options, Referrer-Policy, etc. on every response | on | _(none)_ |
| Privileged gate | Optional second-factor admin secret on destructive endpoints | not used by core today | `SMILEYCHAT_ADMIN_SECRET`, `SMILEYCHAT_REQUIRE_ADMIN_SECRET_ON_LOOPBACK` |
| SSRF guard | Block plugin outbound fetches to loopback / private / reserved IPs | on | `SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH` |

## What each layer actually does

### Server binding (`SMILEYCHAT_HOST`)

The Bun server calls `Bun.serve({ hostname, port })`. The default is
`0.0.0.0`, so every interface on the machine accepts connections. By
itself that would be alarming, but the lockdown below catches every
non-loopback request and refuses it unless you've opted into one of the
auth mechanisms. So the practical effect on a fresh install is:

- Loopback (`127.0.0.1`) → works, no auth needed.
- LAN / DNS-named host → access-setup page (HTML for browsers, JSON for
  API/curl) until you configure Basic Auth or the allowlist.
- Tailscale (`100.64.0.0/10`) → auto-passes (see "Trusted-interface
  bypass" below).
- Docker bridge (`172.16.0.0/12`) → auto-passes.

If you want to disable the "bound to all interfaces" behaviour entirely
(e.g. you're running a reverse proxy that's the only thing supposed to
reach SmileyChat), set `SMILEYCHAT_HOST=127.0.0.1` and only loopback
listens. With a reverse proxy in front, you'll typically also want to
add the public URL to `SMILEYCHAT_TRUSTED_ORIGINS` so the CSRF check
accepts browser-issued POSTs from that origin.

### IP allowlist (`SMILEYCHAT_IP_ALLOWLIST`)

A comma-separated list of single IPs or CIDR ranges. When set, every
request whose source IP isn't in the list is refused with `403`. Loopback
(`127.0.0.0/8`, `::1`) and "trusted interfaces" (Tailscale CGNAT, Docker
bridge, see below) are always allowed regardless of the list so you
can't accidentally lock yourself out.

Examples:

```
SMILEYCHAT_IP_ALLOWLIST=192.168.1.0/24,10.0.0.5
SMILEYCHAT_IP_ALLOWLIST=2001:db8::/32
SMILEYCHAT_IP_ALLOWLIST=100.92.13.7,100.92.13.8        # specific Tailscale peers
```

Set `SMILEYCHAT_IP_ALLOWLIST_ENABLED=false` to keep the list configured
but temporarily disable enforcement. Useful when you're debugging "why
can't I connect from my phone."

### Trusted-interface bypass (Tailscale & Docker)

Tailscale assigns peer IPs from `100.64.0.0/10` (CGNAT). Docker's default
bridge networks live in `172.16.0.0/12`. By default both ranges skip
both the allowlist and Basic Auth. The bypass logs a one-shot warning
the first time it fires so the operator has a paper trail.

Turn either off with:

```
SMILEYCHAT_BYPASS_AUTH_TAILSCALE=false
SMILEYCHAT_BYPASS_AUTH_DOCKER=false
```

### Rate limit

Fixed window, per-IP, per-route-class. The default bucket (`600/min`)
applies to every `/api/*` endpoint; tighter buckets are configured in
`server/security/rate-limit.ts` for:

- `/api/csrf`: 60/min (the token grab; cheap, but no reason to hammer)
- `/api/{characters,chats,personas}/import`: 20/min (file uploads)
- `/api/{characters,personas}/<id>/avatar`: 30/min
- `/api/characters/<id>/export.png`: 30/min
- `/api/connections/secrets`: 120/min (frontend reads this on every boot)

Every response carries `RateLimit-Limit`, `RateLimit-Remaining`, and
`RateLimit-Reset` headers. Over-limit requests get `429` with a
`Retry-After`. Disable entirely with `SMILEYCHAT_RATE_LIMIT_ENABLED=false`.

### Basic Auth

Set both `SMILEYCHAT_BASIC_AUTH_USER` and `SMILEYCHAT_BASIC_AUTH_PASS` to
require HTTP Basic Auth on every request from non-loopback, non-
allowlisted IPs. Browsers show the native password prompt; the
credentials are remembered for the session.

Implementation notes:

- The expected header bytes are pre-built once and cached; the per-
  request compare uses `crypto.timingSafeEqual` (after a length check)
  to avoid leaking the password length.
- The realm string shown in the prompt is configurable via
  `SMILEYCHAT_BASIC_AUTH_REALM`. Any embedded quotes are escaped before
  going into the `WWW-Authenticate` header.
- `/api/health` is exempt so external uptime probes don't trip on auth.
- `/api/csrf` is exempt so the frontend can grab a token before the
  browser surfaces a credential prompt (the token endpoint is itself
  origin-gated).

**Caveat: Basic Auth sends credentials on every request, only base64-
encoded.** Always pair with HTTPS in production. The easiest way:
reverse-proxy SmileyChat behind Caddy / Tailscale Serve, terminate TLS
there.

### Remote lockdown (fail-closed)

When **neither** Basic Auth nor a covering IP allowlist is configured,
SmileyChat refuses every non-loopback request rather than silently
accepting them. This is the safety net for users who flip
`SMILEYCHAT_HOST=0.0.0.0` without thinking about auth. The request
lands on a friendly HTML page (for browser navigations) or a JSON 403
(for API / `curl`) explaining what to set.

Opt-out switches (in order of decreasing strictness):

- `SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK=true`: let LAN,
  Docker, Tailscale, and IPv6 ULA clients in without auth. Reasonable on
  a trusted home network.
- `SMILEYCHAT_ALLOW_UNAUTHENTICATED_REMOTE=true`: let _everything_ in.
  Only safe behind a reverse proxy that does its own auth.

### CSRF (`SMILEYCHAT_TRUSTED_ORIGINS`)

The CSRF middleware (`server/csrf.ts`) runs only on unsafe HTTP methods
(`POST`/`PUT`/`PATCH`/`DELETE`). Each unsafe request must:

1. **Pass an Origin / Referer allowlist** that contains loopback, the configured
   `SMILEYCHAT_HOST` origin, auto-trusted private-network origins (when
   the request's `Host` header matches a private CIDR), and anything in
   `SMILEYCHAT_TRUSTED_ORIGINS`.
2. **Carry the magic header** `X-SmileyChat-CSRF-Magic: 1`. The frontend
   sets this automatically. Scripts that call the API must set it too.
3. **Carry a valid CSRF token** in `X-SmileyChat-CSRF`, fetched once
   from `GET /api/csrf` and signed with the per-install CSRF secret.

When you reverse-proxy SmileyChat under a public URL, add that URL to
`SMILEYCHAT_TRUSTED_ORIGINS` (no path, just `https://chat.example.com`)
or the browser-issued POSTs will start failing with `csrf_origin_untrusted`.

### Security headers

`server/security/security-headers.ts` adds these on every response:

```
Content-Security-Policy: ...locked to 'self' + blob: + provider URLs...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Permitted-Cross-Domain-Policies: none
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), xr-spatial-tracking=()
Cache-Control: no-store    # on /api/* only
```

CSP is the tricky one. SmileyChat's frontend loads plugins as ESM modules
via `URL.createObjectURL` (which CSP sees as `blob:`), and LLM provider
calls go browser→provider directly to whatever URL the user configured,
so `connect-src` is intentionally wide. Everything else is locked to
`'self'`. If you serve SmileyChat over HTTPS, manually add an HSTS
header at the reverse-proxy layer. It's not on by default because most
local installs are plain HTTP.

### Privileged gate (`requirePrivilegedAccess`)

`server/security/privileged-gate.ts` exports a helper that route
handlers can call inline when they need a second factor on top of Basic
Auth:

```ts
import { requirePrivilegedAccess } from "./security/privileged-gate";

GET: api(async (request, _server, context) => {
    const rejection = requirePrivilegedAccess(request, context.ip, {
        feature: "Wipe all user data",
    });
    if (rejection) return rejection;
    // ...do the privileged thing
}),
```

The gate refuses unless:

1. Basic Auth is satisfied (or the caller is loopback / allowlisted /
   on a trusted interface).
2. Optionally (if `loopbackOnly: true`) the caller is on loopback.
3. The caller sent `X-SmileyChat-Admin-Secret: <value>` matching
   `SMILEYCHAT_ADMIN_SECRET` (timing-safe compare).

Loopback callers skip step 3 by default for ergonomics; set
`SMILEYCHAT_REQUIRE_ADMIN_SECRET_ON_LOOPBACK=true` to require the secret
even from `127.0.0.1`. **Core SmileyChat doesn't ship any privileged
endpoints today.** The helper is available infrastructure for plugins
or future features (auto-update, "wipe all data," etc.).

### SSRF guard (`safeFetch`)

`server/security/safe-fetch.ts` is the outbound-fetch wrapper SmileyChat
hands plugins for the day they need server-side HTTP. It refuses to
fetch any URL whose hostname resolves (via `dns.lookup({all, verbatim})`)
to a loopback / RFC 1918 / link-local / CGNAT / metadata / reserved
IPv4 or IPv6 range, follows up to 5 redirects with the same gate re-
applied to each `Location` target, and respects an optional response-
size cap.

SmileyChat's own server makes **no outbound HTTP calls** of its own. All LLM
provider traffic goes browser→provider direct (see
[`docs/architecture.md`](architecture.md)). The wrapper is there
preemptively so a plugin author has a safe primitive when they need
one, with `SMILEYCHAT_PLUGINS_ALLOW_OUTBOUND_FETCH=false` as the global
master switch.

## Hot-reload

Settings live in `.env`. SmileyChat polls the file every 2 seconds
(`server/config/env-watcher.ts`) and re-applies any change in place:
adds / updates / removes propagate to `process.env`, masked values
(passwords, admin secret, CSRF secret) are obscured in the log line.

Restart-required keys are flagged with `[restart]` in `.env.example` and
trigger a `[env-watcher] … require a server restart to take effect`
warn if you change them at runtime:

- `SMILEYCHAT_HOST`
- `SMILEYCHAT_API_PORT`
- `SMILEYCHAT_FRONTEND_PORT`
- `SMILEYCHAT_CSRF_SECRET` (the secret is read once at process start)

Everything else (Basic Auth credentials, allowlist, trusted origins,
rate limits, bypass flags) takes effect on the next request after the
poll fires.

## Recommended setups

### Local only (default)

Do nothing. SmileyChat binds to every interface but the lockdown gates
everything except loopback. Browse to `http://127.0.0.1:4173` as usual.

### Tailscale (multi-device, no public exposure)

Do nothing. Tailscale's CGNAT range (`100.64.0.0/10`) is auto-trusted, so
your Tailnet peers reach SmileyChat without a password. Add Basic Auth
below if there are other people on your Tailnet who shouldn't have
access.

### LAN access from your phone (home network)

```
SMILEYCHAT_BASIC_AUTH_USER=youruser
SMILEYCHAT_BASIC_AUTH_PASS=a-long-random-password
```

Browser on phone → `http://<your-machine-ip>:4173` → password prompt
once, you're in. CSRF auto-trusts the private-LAN origin once the
request's `Host` header confirms the request came over the LAN.

If you fully trust everyone on the LAN, you can skip the password by
setting `SMILEYCHAT_ALLOW_UNAUTHENTICATED_PRIVATE_NETWORK=true` instead.

### Public-internet hosting

```
SMILEYCHAT_HOST=127.0.0.1                       # let the proxy talk to it
SMILEYCHAT_BASIC_AUTH_USER=youruser
SMILEYCHAT_BASIC_AUTH_PASS=a-long-random-password
SMILEYCHAT_TRUSTED_ORIGINS=https://chat.example.com
```

Then in Caddy / nginx / Tailscale Serve, terminate TLS and proxy to
`http://127.0.0.1:4173`. Forward `Host` and `X-Forwarded-Proto`.

## What's still not there

- **No encryption-at-rest for API keys.** `userData/settings/connection-secrets.json`
  is plain JSON. Same risk profile as a browser's saved passwords or
  any other local-first app's config file. Assume anyone with disk
  access can read them.
- **No audit log.** Auth failures and rate-limit rejections go to
  stdout; there's no structured event stream.
- **No CSRF on GETs.** That's intentional (GETs don't change state) but
  it means a same-origin `GET /api/connections/secrets` from any script
  loaded into the SmileyChat origin reads the API keys. The CSP
  restricts what scripts can load.

If you find a security issue, open an issue on the SmileyChat repo or
reach the maintainer via the address in the project's README.
