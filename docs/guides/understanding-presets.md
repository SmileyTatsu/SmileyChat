# Understanding Presets

In SmileyChat, **Connections** and **Presets** do two entirely different jobs.

## Connections vs. Presets

- **Connections** tell SmileyChat _how to connect_ to an AI (e.g., "Use OpenRouter", "Use this API Key", "Connect to `localhost:1234`").
- **Presets** tell the AI _how to behave_ and _how to format_ the prompt.

## What is a Preset?

A Preset is a set of instructions that SmileyChat sends to the AI alongside your chat. It includes:

- **Generation Settings:** Things like Temperature (creativity), Max Tokens (response length), and Penalties.
- **Prompt Structure:** The invisible rules sent to the AI (e.g., "You are roleplaying as {{char}}", "Write in extreme detail").

## SillyTavern Compatibility

SmileyChat supports importing SillyTavern-style presets. If you have a favorite preset from ST, you can place it in your `userData/presets/` folder (or use the import tool if available). SmileyChat will translate the prompt structure and macros.

_Note: SmileyChat handles context length trimming based on your Connection profile's model, so some preset settings from other apps might be ignored to provide a better out-of-the-box experience._

## Macros

Presets use macros like `{{char}}` (which gets replaced by the character's name) or `{{user}}` (which gets replaced by your persona's name). You can read the full list of supported macros in the [Preset Macros](../reference/macros.md) documentation.
