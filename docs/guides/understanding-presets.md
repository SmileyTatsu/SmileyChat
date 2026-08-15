# Understanding Presets

In SmileyChat, **Connections** and **Presets** do two entirely different jobs.

## Connections vs. Presets

- **Connections** tell SmileyChat _how to connect_ to an AI (e.g., "Use OpenRouter", "Use this API Key", "Connect to `localhost:1234`").
- **Presets** tell the AI _how to behave_ and _how to format_ the prompt.

## What is a Preset?

A Preset is a set of instructions that SmileyChat sends to the AI alongside your chat. It includes:

- **Generation Settings:** Things like Temperature (creativity), Max Tokens (response length), Penalties, and optional per-preset Streaming overrides.
- **Prompt Structure:** The invisible rules sent to the AI (e.g., "You are roleplaying as {{char}}", "Write in extreme detail"), ordered prompts, system prompts, and injection depth anchors.

## SillyTavern Compatibility & Sync

SmileyChat supports importing SillyTavern-style presets. You can import preset JSON files directly into the Presets manager, or sync all presets from your local SillyTavern directory using **Settings > SillyTavern Sync**. SmileyChat translates the prompt structure and macros into its native preset shape.

_Note: SmileyChat handles context length trimming based on your Connection profile's model, so context token settings from imported presets are ignored to ensure reliable local token budgeting._

## Macros

Presets use macros like `{{char}}` (which gets replaced by the character's name) or `{{user}}` (which gets replaced by your persona's name). You can read the full list of supported macros in the [Preset Macros](../reference/macros.md) documentation.
