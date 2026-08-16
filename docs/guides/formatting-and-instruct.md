# Formatting and Instruct Templates (Beta)

> **Beta:** Formatting and custom Instruct Templates are usable, stored locally, and covered by automated tests, but their controls and SillyTavern compatibility are still evolving. Check the generated prompt preview before relying on a template for an important long-running chat.

The **Settings > Formatting (Beta)** tab configures how SmileyChat turns an assembled chat into a text-completion prompt. It is a provider-neutral formatting layer for text-completion backends. KoboldCPP is the currently integrated text-completion provider; additional text-completion adapters can use the same assembled formatting contract in the future. It does not replace Presets: Presets control prompt content, order, and generation settings; Formatting wraps that assembled content in model-specific tokens.

## Choosing a template

The tab includes `Auto`, `None`, and a large built-in catalog of imported-compatible formats. It includes families such as Llama, ChatML, Mistral, Gemma, Alpaca, DeepSeek, Command R, OpenAI Harmony, Vicuna, WizardLM, and others. The exact built-in catalog is the list shown in the template selector and can grow without changing the file format. You can also create, import, save, export, and delete custom templates.

- **Auto** selects SmileyChat's built-in formatter from the connected model name.
- **None** sends the assembled text without model wrapper tokens.
- **Custom** uses the sequences in the current template.

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

**Wrap sequences with newlines** adds a newline before and after each non-empty sequence. **Sequences as stop strings** and **Names as stop strings** contribute stop strings to a text-completion request. Custom templates use their own stop strings; SmileyChat does not also inject auto-detected built-in stops.

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
