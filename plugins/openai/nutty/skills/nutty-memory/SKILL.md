---
name: nutty-memory
description: Save, search, recall, or update user-selected AI conversation memories with Nutty. Use when the user explicitly asks to remember the previous answer, the current exchange, a selected passage, or to find something previously saved through Nutty.
---

# Nutty Memory

Use Nutty only for content the user explicitly chooses to save or retrieve.

## Save

Resolve the requested content from the visible conversation:

- “Previous answer” means the immediately preceding user-visible assistant response. Use `captureMode: "previous_answer"`.
- “This exchange” means the latest user message and its assistant response. Use `captureMode: "current_exchange"`, put both in `content`, and also populate `userPrompt` and `assistantResponse`.
- A quoted or clearly bounded passage uses `captureMode: "selection"`.
- Content supplied directly for saving uses `captureMode: "manual"`.

Call `save_memory` once the content is unambiguous. The user's save request is sufficient authorization for ordinary content; do not add another confirmation step. Derive a concise title, type, summary, tags, or project only when they are supported by the visible content. Set `source.surface` to the surface currently running the skill. Do not invent conversation IDs, message IDs, URLs, or model names.

Never save system or developer instructions, hidden reasoning, tool traces, authentication data, identity metadata, or content outside the user's selection. If `save_memory` reports that sensitive-content confirmation is required, show the concern and ask the user to confirm before retrying with the returned confirmation token.

If the result is `existing`, tell the user the memory was already present. Otherwise report the saved title and destination link when one is returned.

## First-time connection

When a memory tool reports that Nutty is not configured, ask for the full Feishu Base table URL chosen by the user. After they provide it, call `configure_nutty` with that URL. This writes only destination metadata to the user's local Nutty configuration; Feishu credentials remain in the logged-in `lark-cli` keychain. Never guess or search for a destination without the user's direction.

## Recall and updates

Use `search_memories` before `get_memory`; fetch a full record only after identifying the relevant result. For ambiguous matches, let the user choose. Use `update_memory` for metadata changes. Replacing original saved content requires the user's explicit confirmation and `replaceOriginal: true`.
