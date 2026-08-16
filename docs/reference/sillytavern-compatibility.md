# SillyTavern Compatibility

SmileyChat can import SillyTavern character cards, presets, lorebooks, chats, and Instruct Template JSON. Compatibility is practical rather than byte-for-byte: SmileyChat translates supported data into its local-first data model and preserves unsupported card data where possible. This lets the app keep its own prompt budgeting, provider adapters, plugin system, and chat data model.

## Presets and Instruct Templates

The following imported behavior is supported for the beta Formatting/Instruct feature:

- Prompt lists, titles, roles, enabled prompt order, and injection metadata used by SmileyChat.
- Supported sampler settings and streaming.
- Common Instruct sequences, Story String, Story String wrappers, system-as-user, alignment message, sequence wrapping, newline collapsing (`collapse_consecutive_newlines` / `collapse_newlines`), stops, name behavior, macro replacement, skip examples, example separator, and Chat Start. Explicit `false` values (such as `names_as_stop: false` or `collapse_newlines: false`) are preserved during import without unprompted overrides.
- Per-message `{{name}}` replacement in sequences when sequence macro replacement is enabled.
- Story String conditional rendering and `wiBefore` / `wiAfter` lore placement.
- The first-output sequence applies only to the first assistant message in the complete chat, even if history trimming removes earlier turns.

## Intentional differences and incomplete parity

The Formatting tab and custom Instruct Templates are marked **beta** because some advanced SillyTavern behavior is not yet implemented exactly.

| Area                  | Current SmileyChat behavior                                                                                                                                                                                         | Why it differs                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activation regex      | Auto evaluates valid template activation regexes against the active model ID and selects the most specific match; ties are resolved by name. Manual selections take precedence; invalid regexes are ignored safely. | Only bundled patterns and templates that declare an activation regex participate. Other model aliases fall back to the legacy family formatter.                                                                     |
| Handlebars            | Story Strings support Handlebars conditionals and shared macros. Regular preset blocks support SmileyChat macros plus `#if` / `#unless`, not arbitrary Handlebars helpers or loops.                                 | Keeping normal preset resolution bounded avoids changing existing prompt behavior and prevents a wider template execution surface.                                                                                  |
| Story anchors         | Text-completion `before-character` and `after-character` injections render through `{{anchorBefore}}` and `{{anchorAfter}}`, then leave the normal injector path to avoid duplication.                              | SmileyChat keeps structured injection anchors so token budgeting and plugin injections remain traceable. Other SillyTavern anchor semantics remain outside this layer.                                              |
| Example formatting    | Examples have correct placement, separator replacement, and supported macro resolution, but legacy card edge cases are not fully reproduced.                                                                        | SillyTavern has accumulated multiple historical example formats; SmileyChat needs fixtures for each before claiming exact output parity.                                                                            |
| Niche Instruct fields | `system_instruction_prefix`, `last_system_sequence`, and `names_force_groups` do not yet have complete behavior/UI mappings.                                                                                        | Their semantics need product decisions that do not conflict with current system prompts, group formatting, and provider adapters.                                                                                   |
| Provider scope        | Formatting is selected through an adapter `promptMode` capability. KoboldCPP currently declares `text-completion`; chat-completion adapters use structured-message prompts.                                         | Applying text wrappers to chat-completion APIs would be incorrect and can double-format prompts. Future text-completion adapters can declare the same capability without provider-ID checks in the prompt compiler. |

Imported context length and maximum-token values are intentionally ignored. SmileyChat trims each request against the active connection profile's local context-token limit, while output-token and sampler behavior belong to the active preset.

## Reporting a compatibility issue

When reporting an output mismatch, include the template JSON (with keys removed), selected connection type/model, active preset, a small synthetic chat, and the expected versus actual prompt. Do not include API keys, private character data, or absolute local file paths.
