# Preset Macros

Macros are dynamic placeholders used in preset prompts, character cards, and author notes. When SmileyChat compiles the context to send to the AI provider, these macros are replaced with their actual runtime values.

SmileyChat supports many common SillyTavern-style macros, as well as a few unique ones. Plugins can also register custom macros.

## Character Fields

These macros pull information directly from the active character's card.

* `{{char}}`: The name of the character.
* `{{char_description}}`: The main description of the character.
* `{{char_personality}}` / `{{personality}}`: The character's personality details.
* `{{tagline}}`: The character's short description or tagline.
* `{{scenario}}`: The scenario defined for the current chat or character.
* `{{char_first_message}}`: The first message of the character (either from the card or the first character message in the current chat history).
* `{{char_message_examples}}` / `{{message_examples}}` / `{{mes_example}}`: The example messages provided in the character card.
* `{{char_system_prompt}}` / `{{system_prompt}}`: The character-specific system prompt.
* `{{char_post_history_instructions}}` / `{{post_history_instructions}}`: The character-specific instructions appended after the chat history.
* `{{character_book}}` / `{{char_lore}}`: Active and matching lorebook/character book entries.

## User & Persona Fields

These macros pull information about the currently active persona.

* `{{user}}` / `{{persona_name}}`: The name of your active persona.
* `{{persona}}` / `{{persona_description}}`: The description of your active persona.
* `{{user_status}}` / `{{status}}`: Your current status (e.g., Online, Away, Do Not Disturb).

## Conversation History

These macros provide access to the current chat session's flow. Note: To prevent accidental macro injections by the AI or user text, the contents returned by these macros are intentionally *not* recursively evaluated.

* `{{chat_history}}`: The full formatted history of the current chat.
* `{{last message}}` / `{{last_message}}` / `{{lastMessage}}`: The content of the very last message in the chat.
* `{{last user message}}` / `{{last_user_message}}` / `{{lastUserMessage}}`: The content of the most recent message sent by the user.
* `{{last char message}}` / `{{last_char_message}}` / `{{lastCharMessage}}`: The content of the most recent message sent by the character.
* `{{message count}}` / `{{message_count}}`: The total number of messages in the current chat.

## Session Details

* `{{date}}`: The current local date.
* `{{time}}`: The current local short time.
* `{{datetime}}`: The current local full date and time.
* `{{mode}}`: The active chat mode (e.g., `chatting` or `roleplay`).

## Formatting & Control

* `{{newline}}`: Inserts a literal newline character `\n`.
* `{{trim}}`: When placed anywhere in a prompt block, it removes leading and trailing whitespace from that compiled block.
* `{{// your comment here }}`: A comment macro. Everything inside will be removed entirely during preset compilation. Useful for adding notes to your preset prompts.
* `{{outlet::outlet_name}}`: Used internally and by plugins to inject dynamic content registered via prompt outlets.
