# SmileyChat TODO

Product backlog, ordered by value per unit of risk. Each entry says what it
buys, roughly what it costs, and where it lands in the code.

## Done (QoL pass)

- Autosave status in the composer (`src/features/chat/composer-status.tsx`).
- Context meter against the active profile's input budget
  (`src/features/chat/context-meter.tsx`, `src/app/hooks/use-context-usage.ts`).
- Command palette on `Ctrl K` (`src/features/command-palette/`).
- Deleted chats go to `userData/chats/trash` with a ten second Undo
  (`server/chat-store.ts`, `POST /api/chats/:id/restore`).
- Touch targets and safe-area pass for phones (`chat.css`, `App.css`).

## Level 2 — deepen the product

### 1. Full-text search inside messages

Search only matches chat titles today, so "where did that scene happen?" is
unanswerable. Add a message index with `bun:sqlite` + FTS5, built incrementally
when a chat is saved, and show results with a jump to the message.

- Why it matters: this is the feature that makes a 300-message roleplay
  navigable, and it is the honest reason to adopt SQLite.
- Cost: medium. New server module, an index rebuild path, a results panel, and
  a scroll-to-message API the virtualized list can honour.
- Watch out: keep JSON as the source of truth; the index must be disposable and
  rebuildable from `userData/chats/sessions`.

### 2. Quick model / connection switcher

Changing model today means Options → Connections → dropdown → save. Users
switch models per scene. Put the active profile in the chat header (or a
`Ctrl+Shift+M` palette command) with a one-click list of profiles.

- Cost: small. Reuses `connectionSettings` and the existing save path.
- Watch out: changing the active profile mid-chat changes the context budget,
  so the composer meter and trimming must react immediately.

### 3. Import a character from a URL

Local import (drag and drop, PNG cards, dedupe) is solid; what stops people
coming from SillyTavern is having to download the card first. Add
`POST /api/characters/import-url` that fetches a JSON or PNG card.

- Cost: small server route plus a dialog.
- Watch out: this is SSRF surface. Reuse the guard already written for
  `POST /api/plugins/fetch` and cap the response size.

### 4. Per-message QoL

Pin or bookmark a message, copy it as Markdown, and jump to a search hit. These
are small, used constantly, and share the same message-actions menu.

- Cost: small each. Pinning needs a place in `ChatSession.metadata`.

### 5. First-run onboarding

A new user opens the app and sees an empty rail plus "No connection profile is
configured". A three-step flow (connection → character → first chat) turns the
empty state into a guided start.

- Cost: medium UI work, no new data model.
- Watch out: it must be skippable and never block a returning user; gate it on
  "no connections and no characters".

### 6. One-click backup and restore

Local-first app with no accounts: the backup story is the trust story. Zip
`userData` (or the selected folders) and let the user restore it.

- Cost: small. `adm-zip` is already a server dependency.
- Watch out: never overwrite silently; restore into a new folder and report what
  was replaced.

## Level 3 — bets

### 7. i18n, Spanish first

The whole UI is English-only. Extract strings into a catalogue and ship Spanish
as the first locale.

- Cost: large and mechanical, spread over many components. Do it as its own
  series of commits, never mixed with features.

### 8. Authoring tools for storytelling

Scene and chapter markers, per-scene notes, and an export that includes the
Chat Summarizer output. The summarizer already exists; the export does not use
it.

### 9. Group turn-taking controls

Group chats exist, but who speaks next is implicit. Add ordering, muting, and
an explicit "ask this member to reply".

## Decide first

- **Theme vs mode.** `chatTheme` defaults to `"chat"`, so the Chatting / RP mode
  chosen when creating a chat is never visible and the header toggle is a dead
  prop. Either a chat remembers its mode and the global theme is only an
  override, or `mode` disappears and everything is a theme. This blocks the
  product's identity and should be settled before any theme work.
- **Character favorites.** The menu entry renders disabled. Either ship real
  favorites (characters and chats, with a filter) or remove the entry.

## Not doing yet, and why

- **Migrating all five JSON stores to SQLite.** Incremental JSONL writes come
  first; the real trigger for SQLite is item 1 (FTS). Migrating five stores at
  once is risk without a user-visible payoff.
- **More providers.** Seven already. Breadth is not the bottleneck; the session
  experience is.
- **Theme marketplace or custom CSS.** Premature while theme and mode still
  conflict.
- **A landing page.** Against the project direction: this is an app, not a
  marketing site.
