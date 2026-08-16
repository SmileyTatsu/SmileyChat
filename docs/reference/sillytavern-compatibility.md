# SillyTavern Compatibility

SmileyChat can import SillyTavern character cards, presets, lorebooks, chats, and Instruct Template JSON. Compatibility is practical rather than byte-for-byte: SmileyChat translates supported data into its local-first data model and preserves unsupported card data where possible. This lets the app keep its own prompt budgeting, provider adapters, plugin system, and chat data model.

## Presets and Instruct Templates

The following imported behavior is supported for the beta Formatting/Instruct feature:

- Prompt lists, titles, roles, enabled prompt order, and injection metadata used by SmileyChat.
- Supported sampler settings and streaming.
- Common Instruct sequences, Story String, Story String wrappers, system-as-user, alignment message, sequence wrapping, stops, name behavior, macro replacement, skip examples, example separator, and Chat Start.
- Per-message `{{name}}` replacement in sequences when sequence macro replacement is enabled.
- Story String conditional rendering and `wiBefore` / `wiAfter` lore placement.
- The first-output sequence applies only to the first assistant message in the complete chat, even if history trimming removes earlier turns.

## Intentional differences and incomplete parity

The Formatting tab and custom Instruct Templates are marked **beta** because some advanced SillyTavern behavior is not yet implemented exactly.

| Area                  | Current SmileyChat behavior                                                                                                                                                         | Why it differs                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Activation regex      | Imported and preserved, but does not automatically select a template from the model ID.                                                                                             | Template discovery currently belongs to the settings UI; generation receives the active resolved formatting only. Automatic selection needs a deliberate shared template-resolution layer. |
| Handlebars            | Story Strings support Handlebars conditionals and shared macros. Regular preset blocks support SmileyChat macros plus `#if` / `#unless`, not arbitrary Handlebars helpers or loops. | Keeping normal preset resolution bounded avoids changing existing prompt behavior and prevents a wider template execution surface.                                                         |
| Story anchors         | Dynamic prompt injections are placed by SmileyChat's prompt injector. Story String anchor variables are not populated as SillyTavern anchor replacements.                           | SmileyChat uses structured injection anchors so token budgeting and plugin injections remain traceable and do not duplicate context.                                                       |
| Example formatting    | Examples have correct placement, separator replacement, and supported macro resolution, but legacy card edge cases are not fully reproduced.                                        | SillyTavern has accumulated multiple historical example formats; SmileyChat needs fixtures for each before claiming exact output parity.                                                   |
| Niche Instruct fields | `system_instruction_prefix`, `last_system_sequence`, and `names_force_groups` do not yet have complete behavior/UI mappings.                                                        | Their semantics need product decisions that do not conflict with current system prompts, group formatting, and provider adapters.                                                          |
| Provider scope        | Formatting is a text-completion abstraction. KoboldCPP is the currently integrated text-completion adapter; chat-completion providers use their own structured-message adapters.    | Applying text wrappers to chat-completion APIs would be incorrect and can double-format prompts. Future text-completion adapters can reuse the formatting contract.                        |

Imported context length and maximum-token values are intentionally ignored. SmileyChat trims each request against the active connection profile's local context-token limit, while output-token and sampler behavior belong to the active preset.

## Reporting a compatibility issue

When reporting an output mismatch, include the template JSON (with keys removed), selected connection type/model, active preset, a small synthetic chat, and the expected versus actual prompt. Do not include API keys, private character data, or absolute local file paths.
