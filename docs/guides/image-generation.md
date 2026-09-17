# NovelAI Image Generation

SmileyChat includes a bundled **Image Generation** core extension. The first release supports NovelAI image generation only. It can turn the active chat context into a NovelAI prompt, preserve a user-authored master prompt exactly, generate one or more images, save them into the active chat, and keep later model requests lightweight by representing generated images as text.

The extension is disabled by default.

## Requirements

Before generating an image:

1. Open **Options > Connections**.
2. Create or select a **NovelAI** connection profile and save its API token.
3. Open **Options > Plugins** and enable **Image Generation**.
4. Open the plugin's **Configure** panel and select the NovelAI profile if SmileyChat should not choose it automatically.
5. Open a saved chat. Images cannot be attached without an active chat.

The automatic `generate_image` tool is available only while the extension is enabled and a NovelAI connection profile with a saved token can be resolved. The active chat model must also support tool calling for automatic generation.

## Ways to Generate

### Automatic chat tool

The extension registers an argument-free `generate_image` model tool. The chat model decides only whether the tool is appropriate; it does not write or submit an image prompt.

The tool should be used only when:

- a character is sending a selfie, photo, or other image requested in the conversation, including an in-character request; or
- an image is strictly necessary to satisfy an explicit user request.

It should not create unsolicited illustrations, decorative scene images, visual reveals, or images that merely enrich roleplay.

After invocation, the extension handles the complete workflow:

1. Select the latest meaningful chat message.
2. Compile the configured preset and bounded recent history when enabled.
3. Ask the selected text model to write only the replaceable NovelAI prompt section.
4. Insert that section into the master prompt.
5. Call NovelAI.
6. Save the returned image into the active chat's attachment folder.
7. Continue the character response with the image attached.

The tool accepts an empty JSON object and has no request or prompt parameter. This prevents the chat model from bypassing the configured prompt writer or master prompt.

### Message action

Open a message's actions and select **Illustrate message**. The modal starts in **Last message** mode with that message as its visual direction.

### Slash command

Use `/image` to open the image-generation modal. Optional text after the command becomes custom visual direction:

```text
/image rainy rooftop reunion at blue hour
```

## Manual Workbench

The image modal supports these context modes:

- **Current scene**: scenario plus current conversation context.
- **Last message**: illustrates the selected or latest meaningful message.
- **Character**: full character image.
- **Character portrait**: portrait-focused character image.
- **Persona**: image of the active user persona.
- **Background**: environment without foreground character focus.
- **Raw request**: use manually authored prompt insertion text.
- **Custom**: use custom visual direction with the prompt writer.

For AI-assisted modes, select **Write Prompt with AI**, review or edit the prompt insertion, inspect the fully compiled prompt, and then select **Generate Image**. Raw mode can be used when the insertion is already written.

Manually generated images are added as an Image Generation system message excluded from future prompts.

## Master Prompt

The master prompt must contain `{{prompt}}` exactly once. SmileyChat replaces only that marker. Every character before and after it remains unchanged, including line breaks, weights, punctuation, artist tags, negative weights, and quality tags.

Example:

```text
1girl, solo, depthness, year 2026, ultra complexity,
2::artist:doppel (bonnypir)::, 1.2::gerph::,

-2::muscular, toned::,
{{prompt}},

masterpiece, amazing quality, absurdres, no text,
```

If the marker is missing or appears more than once, settings cannot be saved and generation is rejected.

## Prompt Writer

The prompt writer is a separate text-model request. The editable **Prompt-writer instruction** describes how visual intent should be translated into NovelAI tags and short natural-language bindings. Structured JSON parsing is an internal application protocol; users do not need to preserve JSON instructions in the editable prompt.

The bundled default instruction emphasizes:

- analyzing the latest context before making assumptions;
- locking the established character identity and stable appearance;
- distinguishing persistent traits from temporary clothing, location, pose, and physical state;
- matching activity and setting, such as workout clothing for a normal gym workout unless context establishes otherwise;
- visible-only prompting;
- correct handling of through-the-lens selfies, mirror selfies, and candid photos;
- current room and recent physical residue such as rain, sweat, or flattened hair;
- concise booru tags plus natural language only where tags cannot express relationships.

The instruction is editable. **Reset Defaults** loads the current bundled version, but updates never overwrite an already saved customized instruction.

### Prompt-writer connection

Choose a saved text-generation connection for prompt writing, or leave it at **Active chat connection**. This connection is independent from the NovelAI image profile.

### Preset and history context

Enable **Send preset and recent chat context** to compile a preset before the prompt-writer rules and task.

- **Prompt-writer preset** selects a specific preset or follows the active preset.
- **Recent messages** accepts `0` through `50` and defaults to `8`.
- `0` sends the preset without chat history.
- The selected preset also supplies generation settings for the prompt-writer request.
- Image-specific instructions and the internal response contract are placed after compiled preset context so they remain authoritative.

The prompt writer receives the current character, persona, scenario, image request, and bounded conversation context. The latest explicit visual request takes priority when older transient facts conflict.

## Generated-Image History Context

Generated images remain visible in chat and are stored locally, but their pixel data is not replayed into later model requests. This avoids large base64 payloads, vision-token use, and HTTP `413 Request Entity Too Large` failures.

Choose one of these modes:

- **Prompt tags** (default): reuse the exact generated prompt insertion. This requires no extra label output and is normally the most token-efficient choice.
- **AI-written label**: ask the existing prompt-writer request for a plain-language visual memory of up to 300 characters. It preserves identity, image type, current appearance, action, framing, and setting while omitting artist and quality tags. It does not make an additional model request.

On later turns, the prompt contains text similar to:

```text
[Generated image context: NovelAI prompt tags: nejire hadou, handheld selfie, indoors, tired grin]
```

or:

```text
[Generated image context: Image label: Nejire sends a tired indoor selfie after patrol, still wearing her hero suit.]
```

The tool's transport-only assistant call and result frames are suppressed from saved prompt history. Boilerplate such as `(empty)`, `Generated 1 NovelAI image`, and `Tool error:` is not replayed. Diagnostics remain available in logs without contaminating model context.

Older `generate_image` entries created before textual context was stored are also prevented from replaying their image bytes. They use a compact fallback marker indicating that detailed historical tags are unavailable.

This policy applies to tool-generated images. Normal user-uploaded images retain the existing multimodal behavior.

## NovelAI Settings

### Connection and endpoint

- **Connection profile**: explicitly selected NovelAI profile, otherwise the active NovelAI profile, otherwise the first available NovelAI profile.
- **API base URL**: defaults to `https://image.novelai.net`.
- **Endpoint**: `POST {baseUrl}/ai/generate-image`.
- **Image model**: defaults to `nai-diffusion-5-full`; custom NovelAI image model IDs are accepted.

The extension sends `Accept: application/json`, so NovelAI returns base64 images inside JSON instead of a ZIP response. SmileyChat decodes and saves those images locally before attaching them to chat messages.

### Generation controls

| Setting         | Behavior                                            |
| --------------- | --------------------------------------------------- |
| Width / Height  | Canvas dimensions from 64 through 2048 pixels.      |
| Steps           | 1 through 50, or at most 28 with Only free enabled. |
| Guidance        | CFG scale from 0 through 20.                        |
| CFG rescale     | Rescale value from 0 through 1.                     |
| Image count     | 1 through 4, forced to 1 with Only free enabled.    |
| Noise schedule  | NovelAI noise-schedule value, default `karras`.     |
| Negative prompt | Undesired-content prompt sent with the request.     |
| Image format    | `png` or `webp`.                                    |

Supported samplers are restricted to NovelAI's configured list:

- Euler Ancestral (default)
- Euler
- DPM++ 2S Ancestral
- DPM++ 2M SDE
- DPM++ 2M

Quality tags:

- `standard`
- `light`
- `none`

Undesired-content presets:

- `heavy`
- `light`
- `furryFocus`
- `humanFocus`
- `none`

### Only free

**Only free generations** enforces all of these limits at save time and again immediately before the NovelAI request:

- one generated image;
- no more than 28 steps;
- no more than 1,048,576 pixels (one megapixel);
- oversized dimensions are proportionally reduced and rounded down to multiples of 64.

## Storage

Extension settings are stored at:

```text
userData/settings/core-extensions/smiley-image-generation/settings.json
```

The NovelAI API token remains in:

```text
userData/settings/connection-secrets.json
```

Generated chat images are copied into:

```text
userData/chats/assets/{chatId}/
```

The extension never stores the NovelAI token in its own settings file.

## Diagnostics and Errors

The extension writes structured logs for:

- tool start, completion, and failure;
- prompt-writer start, completion, and failure;
- selected prompt-writer profile and preset;
- bounded history message count;
- prompt and label lengths;
- NovelAI request start, completion, and failure;
- model, dimensions, steps, image count, format, duration, and correlation ID;
- local image-save failures.

Open **Options > Diagnostics** and filter the `plugins` or generation-related entries. Secrets are scrubbed, and raw prompts are not logged by default.

Common failures:

- **Tool unavailable**: enable the extension and save a token on a NovelAI connection profile.
- **No meaningful message**: send a chat message before automatic generation.
- **Invalid structured response**: verify the prompt-writer model follows system instructions, or try another text connection.
- **Master prompt marker error**: include `{{prompt}}` exactly once.
- **NovelAI returned no images**: inspect the correlation ID and NovelAI error in Diagnostics.
- **Image could not be saved locally**: inspect the detailed image number and decoding/upload error in Diagnostics.
- **HTTP 413 from the text provider**: generated NovelAI images are text-only in history, but large user-uploaded images or other file attachments may still exceed an upstream request-body limit.

## Implementation Map

- `src/core-extensions/image-generation/`: bundled extension UI, settings, prompt assembly, NovelAI request, and tests.
- `src/core-extensions/image-generation/default-instruction.ts`: bundled prompt-writer default.
- `src/lib/presets/compile.ts`: converts tool-generated images to text context and suppresses completed transport-only tool protocol.
- `src/app/hooks/use-prompt-generation.ts`: executes tools, supplies image context to the immediate continuation, and persists replay metadata.
- `src/app/hooks/chat-session-attachments.ts`: validates, decodes, and uploads generated image data.
- `src/lib/plugins/types.ts`: plugin tool-result fields used by generated-image context.
