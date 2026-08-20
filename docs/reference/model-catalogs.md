# Built-In Model Catalogs

SmileyChat ships static, provider-specific model catalogs under `src/data/`. They give the Connections UI a useful initial set of model IDs without requiring a request to a provider's Models API.

The built-in catalogs are:

- `src/data/default-openai-models.json`
- `src/data/default-google-ai-models.json`
- `src/data/default-anthropic-models.json`
- `src/data/default-xai-models.json`
- `src/data/default-novelai-models.json`

These are defaults only. A provider's loaded models appear separately in the UI, and a user can still enter a custom model ID. Loaded and custom models do not automatically inherit validation metadata from a similarly named catalog entry.

## Catalog Structure

Each file is an ordered array of display categories. Keep category IDs, labels, model order, model IDs, labels, and existing `contextTokenLimit` values stable unless a deliberate catalog update requires changing them.

```json
[
    {
        "id": "provider-family",
        "label": "Provider family",
        "models": [
            {
                "id": "provider-model-id",
                "label": "Provider Model",
                "contextTokenLimit": 1048576,
                "requestValidation": {}
            }
        ]
    }
]
```

`contextTokenLimit` remains SmileyChat's local prompt-trimming budget. At request time, a documented `requestValidation.inputTokenLimit` is an additional hard ceiling, so the effective prompt budget is the lower applicable value. The two values can legitimately differ when a provider documents a different request-input limit than the app's local budgeting limit.

## `requestValidation`

Every built-in model entry has a `requestValidation` object. Before generation, SmileyChat uses it to transiently validate the active request: documented output caps are enforced, unsupported controls are omitted, documented numeric bounds are clamped, and documented integer controls are rounded. Saved presets and connection settings are never rewritten.

```json
{
    "inputTokenLimit": 1048576,
    "maxOutputTokens": 65536,
    "temperature": {
        "supported": true,
        "min": 0,
        "max": 2,
        "default": 1
    },
    "topP": {
        "supported": true,
        "min": 0,
        "max": 1,
        "default": 1
    },
    "topK": {
        "supported": true,
        "integer": true,
        "min": 1
    }
}
```

### Token-limit fields

- `inputTokenLimit` is the maximum documented request input-token limit for the model.
- `maxOutputTokens` is the maximum documented output-token limit. A value of `null` means the provider does not publish a fixed per-model output-token cap in the official documentation used for the catalog. It does **not** mean unlimited output.

### Parameter fields

Each parameter object has `supported`. When `supported` is `true`, the object may contain the documented `min`, `max`, `default`, and `integer` constraints. Omitted bounds or defaults are deliberately undocumented/unknown values; consumers must not invent them.

When a model does not accept a control, preserve it explicitly:

```json
"temperature": {
    "supported": false,
    "default": 1
}
```

Supported shared parameter names are:

- `temperature`
- `topP`
- `topK` — always includes `integer: true`
- `presencePenalty`
- `frequencyPenalty`

Google AI models can additionally declare:

- `thinking` — includes `supported`, optional `default` (e.g. `On (medium)`, `On (high)`, `On (minimal)`, `On`, `Off`), and `levels` (supported discrete levels such as `["low", "medium", "high"]`, `["minimal", "low", "medium", "high"]`, `["minimal", "high"]`, or `["low", "high"]`).

NovelAI native-generation models can additionally declare:

- `typicalP`
- `tailFreeSampling`
- `repetitionPenalty`
- `repetitionPenaltySlope`

The catalog records the capability of the model/API path used by SmileyChat. For example, NovelAI's chat-completions and native text-generation paths have different available controls, so their entries intentionally differ.

## Ownership and Runtime Boundaries

Generation values remain preset-owned. A connection profile chooses the provider, model, endpoint, authentication, and local context budget; a preset supplies generation behavior such as temperature, top-p, top-k, output length, and penalties. `requestValidation` constrains the transient request for a selected built-in model; it never persists normalized values back into either owner.

Do not write API keys, provider URLs, sampling values, request history, pricing, or non-validation presentation metadata into `requestValidation`.

## Maintaining the Catalogs

When changing validation metadata:

1. Research the exact model and parameter/API path in current official provider documentation. Do not infer limits from a different model family or reuse a generic provider range where the provider has not documented it for that model.
2. Preserve all existing category and model identity fields and `contextTokenLimit` values unless the catalog change explicitly authorizes changing them.
3. Use `null` for an unpublished fixed output cap and omit undocumented sampler bounds/defaults. Never substitute a plausible value.
4. Mark unsupported controls with `supported: false`; do not silently omit a known unsupported control.
5. Keep all catalog JSON valid and consistently formatted. Parse every changed catalog and run `git diff --check` before submitting.

Use official provider documentation as the source of record:

- [Google Gemini Models API](https://ai.google.dev/api/models)
- [Anthropic model overview](https://platform.claude.com/docs/en/about-claude/models/overview) and [Messages API](https://platform.claude.com/docs/en/api/messages/create)
- [OpenAI model catalog](https://developers.openai.com/api/docs/models)
- [xAI models](https://docs.x.ai/developers/models)
- [NovelAI Generation API](https://docs.novelai.net/en/scripting/generation-api/)
