# Formatting and Instruct Templates (Beta)

> **Beta:** Formatting and custom Instruct Templates are usable, stored locally, and covered by automated tests, but their controls and SillyTavern compatibility are still evolving. Check the generated prompt preview before relying on a template for an important long-running chat.

The **Options > Instruct Templates (Beta)** tab configures how SmileyChat turns an assembled chat into a text-completion prompt. It is a provider-neutral formatting layer for text-completion backends. KoboldCPP is the currently integrated text-completion provider; additional text-completion adapters can use the same assembled formatting contract in the future. It does not replace Presets: Presets control prompt content, order, and generation settings; Formatting wraps that assembled content in model-specific tokens.

## Choosing a template

SmileyChat ships with a comprehensive built-in catalog of **over 35 standard templates** ready to use out-of-the-box (including Llama 2/3/4, ChatML, Mistral v1–v7/Tekken, Gemma 2/4, Command R, DeepSeek-V2.5/R1, GLM-4, Alpaca, KoboldAI, OpenAI Harmony, Vicuna, WizardLM, and more).

The template dropdown organizes formats into:

- **Auto (detect from model)**: Selects the most specific valid matching activation regex from the bundled and saved template catalog, then falls back to SmileyChat's legacy model-family formatter when no specific template matches. Manual selections always take precedence.
- **Raw text / None**: Sends the assembled text without instruction wrapper tokens (ideal for base story continuation models).
- **Standard Built-in Templates**: The bundled catalog of predefined model templates that you can select directly or customize.
- **Custom Templates**: Templates you create, import, or customize yourself.

### Two-role canonicalization in built-in templates

Most modern instruct formats (like Llama 3, ChatML, and DeepSeek) have native system role tags (`<system>`, `<|im_start|>system`). However, strict two-role template families (**Mistral**, **Gemma 2**, **Alpaca**) only understand `User` and `Assistant` turns. For these templates, SmileyChat:

1. Deterministically canonicalizes system prompt runs and mid-history injections without creating invalid system tags: Gemma 2 and Alpaca fold system text into the following user turn, while Mistral preserves initial system text inside `<<SYS>>...<</SYS>>` within the first `[INST]` block.
2. Automatically generates a user alignment turn when chatting with a character whose first message is a greeting, preventing strict models (like Gemma 2) from rejecting model-first turn sequences.
3. Omits duplicate leading `<s>` tags so local backends (like KoboldCPP or Ollama) don't duplicate BOS tokens.

Custom templates are stored locally in `userData/instruct/templates.json`. Compatible loose JSON files in `userData/instruct/` are also discovered. Template IDs are stable, validated identifiers; editable names are not used as file paths or IDs.

## Custom-template behavior

Custom templates can define system, user, assistant, first/last-turn, and Story String wrappers. The resulting order for text-completion prompts is:

1. Story String and its wrapper.
2. Example dialogue, unless it is disabled or already rendered by the Story String.
3. Chat Start.
4. The budget-selected chat history.
5. The final assistant prefix when the last turn is from the user.

When examples are emitted as their own block, they resolve supported macros before their `<START>` markers are replaced by the configured example separator. Chat Start and separately emitted examples are raw template-owned blocks, rather than being assigned a fake chat role.

The **Include names** setting controls name prefixes in text completion:

- **Never**: do not add names automatically.
- **Groups & past personas**: add names for group-character turns and messages from a persona other than the active one.
- **Always**: add names to every chat turn.

When **Replace macros in sequences** is enabled, normal supported macros in sequence fields are resolved before generation. The special `{{name}}` macro is resolved per message while the sequence is applied; it uses that message's author and falls back to `System` for non-chat blocks. Leaving the toggle off preserves literal sequence text, which is important for older templates that use braces literally.

**Wrap sequences with newlines** adds a newline before and after each non-empty sequence. **Collapse consecutive newlines** (enabled by default) normalizes sequence seams where wrapping would otherwise introduce three or more consecutive newlines (`\n\n\n\n`). For custom templates, this collapsing is seam-aware and preserves message-internal paragraphs; built-in template formatters apply a final `\n{3,}` to `\n\n` collapse across the assembled output.

**Single-line mode** registers both `\n` and `\n\n` as stop sequences. **Sequences as stop strings** and **Names as stop strings** contribute stop strings to a text-completion request. Custom templates use their own stop strings; SmileyChat does not also inject auto-detected built-in stops.

## Story Strings and macros

Story Strings use Handlebars-style conditionals such as `{{#if description}}...{{/if}}` and can use the usual SmileyChat macros. For text completion, these additional values are available:

- `{{wiBefore}}` / `{{loreBefore}}`: matching lore injected before character context.
- `{{wiAfter}}` / `{{loreAfter}}`: matching lore injected after character context.
- `{{mesExamples}}`: formatted example dialogue.
- `{{mesExamplesRaw}}`: the character card's unformatted example dialogue.

Use `{{trim}}` to remove final leading/trailing whitespace. See [Preset Macros](../reference/macros.md) for the shared macro list.

## Imported SillyTavern templates

SmileyChat accepts common SillyTavern Instruct Template JSON and combo-preset fields, including sequence fields, Story String, system-as-user, wrapping, stops, name behavior, macro replacement, skip examples, and activation regex. An import that also contains preset prompts or sampler settings offers to import those as a separate SmileyChat preset.

Imported context-limit and maximum-token settings are not adopted: SmileyChat uses the active connection's local context-token budget to trim requests safely. Provider credentials, URLs, and models remain Connection settings.

For the remaining compatibility differences, see [SillyTavern Compatibility](../reference/sillytavern-compatibility.md).

---

## Message Composer Formatting & Hotkeys

When typing in the chat composer or editing an existing message swipe, SmileyChat supports standard formatting shortcuts and inline markdown tags:

| Shortcut                                 | Format          | Output Syntax      |
| ---------------------------------------- | --------------- | ------------------ | --- | ---- | --- | --- |
| `Ctrl + B` (or `Cmd + B`)                | Bold            | `**text**`         |
| `Ctrl + I` (or `Cmd + I`)                | Italic          | `*text*`           |
| `Ctrl + U` (or `Cmd + U`)                | Underline       | `<u>text</u>`      |
| `Ctrl + Shift + X`                       | Strikethrough   | `~~text~~`         |
| `Ctrl + Shift + C`                       | Inline Code     | `` `text` ``       |
| `Ctrl + Shift + K`                       | Code Block      | ` ```\ntext\n``` ` |
| `Ctrl + Shift + M`                       | Message Bubble  | `<msg>text</msg>`  |
| `Ctrl + Shift + P`                       | Spoiler         | `                  |     | text |     | `   |
| `Ctrl + Shift + 9` or `Alt + Q`          | Blockquote      | `> text`           |
| `Ctrl + Shift + 2` or `Ctrl + Shift + '` | Dialogue Quotes | `"text"`           |

---

## Multi-Bubble Chatting with `<msg>` Tags

In modern messaging apps (such as Discord, WhatsApp, or iMessage), people often send rapid-fire thoughts across multiple separate bubbles rather than a single large paragraph. SmileyChat supports this through the `<msg>` tag format.

A single message turn can contain multiple `<msg>` tags, which the UI renders as distinct, cleanly stacked visual bubbles without splitting the underlying data model or disrupting API turn alternation.

### Basic Syntax

```html
<msg>Hey!</msg>
<msg>Did you see the announcement earlier?</msg>
<msg>I can't believe it's actually happening!</msg>
```

### Simulated Typing Latency with `delay`

You can add an optional `delay` attribute to simulate real-time typing cadence:

```html
<msg>Hey!</msg>
<msg delay="1.5s">Wait, look at this.</msg>
<msg delay="500ms">Pretty cool, right?</msg>
```

Supported delay formats:

- **Seconds:** `delay="1s"`, `delay="1.5s"`, `delay="2"`
- **Milliseconds:** `delay="500ms"`, `delay="800ms"`

**Live vs. Historical Display:**

- During live conversation turns (newly sent user messages or streaming AI responses), bubbles with delays show an animated typing indicator for the specified duration before revealing with a smooth entrance animation.
- When opening or scrolling through older chat history, delays are skipped automatically so the entire conversation loads instantly without pauses.

### Using `<msg>` as a User

You can type `<msg>` tags directly into the message composer or edit an existing message swipe:

```text
<msg>First thought</msg><msg delay="1s">Second thought</msg>
```

Select text and press `Ctrl + Shift + M` (`Cmd + Shift + M` on macOS) to wrap it in `<msg>` tags. With no selection, the shortcut inserts an empty `<msg></msg>` pair and places the cursor between the tags.

When sent, your message appears as stacked outgoing bubbles with matching user theme styling.

### Prompting AI Characters to use `<msg>`

To have your AI characters speak in natural, segmented chat bubbles when using the **Chatting** or **Bubbles** visual themes, include an instruction in the character's scenario, system prompt, or your active preset:

> _"When replying, simulate real-time messaging by dividing your thoughts into short `<msg>` blocks. For natural pacing between rapid thoughts, you may include an optional delay (e.g. `<msg delay=\"1s\">text</msg>`)."_

### Theme Behavior

- **Chatting (`chat`):** Renders each `<msg>` as a compact, vertically stacked message line under the author header.
- **Bubbles (`bubbles`):** Renders each `<msg>` as an independent WhatsApp-style speech bubble with directional tail corners for the first bubble and rounded continuation corners for subsequent bubbles.
- **Roleplaying (`rp`):** Renders `<msg>` blocks as clean, book-styled prose paragraphs without chat bubbles, keeping long-form storytelling immersive.

## Positioning attached photos

Image attachments normally appear in the attachment gallery beneath a message. Photo placeholders let a message place them at an exact point in its text or inside and between `<msg>` bubbles.

```text
<msg>Here is the wide shot.</msg>
{{photo[0]}}
<msg delay="1s">And these are the remaining photos: {{photo}}</msg>
```

Supported forms:

- `{{photo[0]}}` places one image by its zero-based position among image attachments. File attachments do not affect the number.
- `{{photo}}` places every image not already reserved by an explicit photo reference.
- `{{photo:id=…}}` is SmileyChat's stable stored form. Numeric references are converted to attachment IDs when a chat is normalized or saved so later attachment reordering does not silently point at a different image.

A positioned image is removed from the bottom gallery without deleting its file. Removing that attachment leaves a small missing-photo marker in the displayed message; the unresolved marker is omitted from model prompts. Repeating an explicit reference intentionally displays the same image more than once.

Multimodal providers receive text and image parts in placeholder order. Providers without image input receive a compact marker such as `[attached image 2 appears here]`; its number continues to identify the original image attachment. Normal attachment URL validation still applies.

Photo placeholders are message-formatting syntax, not preset macros. Use them in chat messages rather than preset prompt fields.
