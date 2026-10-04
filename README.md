# omp inline snippets

A local omp extension for compact `%name` references anywhere in a normal prompt. Definitions are attached to the submitted user message, visible in conversation history. No extra model call, tool, or system-prompt injection.

## Use

Start a new `ompa` session after installing the extension. Existing sessions do not hot-reload extension code.

```text
Review this change. Follow %minimal_change and %concise.
```

Type `%con`, then press Tab to show completion suggestions. Tab accepts `%concise` without inserting its full text. Submit normally to attach the referenced instructions. Each definition is attached once, in first-use order.

Recognized references render bold with a theme-aware highlight in the composer. Partial names stay plain; unknown names use the error color. Escaped references and references inside code remain literal. This is styling only: normal cursor movement, character deletion, selection, and copying are unchanged. Shell/Python composer modes bypass snippet styling. Both ANSI terminals and Tern's native composer are supported.

Two starter snippets are installed in `~/.omp/agent/prompts/`: `concise.md` and `minimal_change.md`.

## Add or edit snippets

Save a Markdown file in `~/.omp/agent/prompts/` (global) or `<current-working-directory>/.omp/prompts/` (project). Nested directories are supported; the filename without `.md` is the name.

```markdown
---
description: Explain the reasoning before changing code
---
Explain the proposed change and its tradeoffs before editing files.
```

Save as `explain_first.md` and reference `%explain_first`. Names start with a letter or underscore and may contain letters, digits, underscores, and hyphens. Names are case-sensitive; completion matches prefixes case-insensitively.

Use `/snippets` to refresh and list definitions for autocomplete. Submission always rereads files, so edits are used immediately. Duplicate filenames across directories or scopes are errors, not silent overrides. Empty files and malformed YAML are errors. The same files also serve as native `/name` prompt templates, but those reload only when omp restarts.

Snippets are literal text: no argument substitution, Handlebars evaluation, or recursive snippet expansion. Use simple instruction snippets rather than parameterized slash templates.

## Literal references and errors

Backtick code spans, backtick/tilde fenced blocks, URL/path-embedded tokens, and ordinary percentages are not expanded. Write `\%concise` in prose to send literal `%concise` without attaching its definition.

Unknown names stop submission and restore the draft, with an error notification. This extension's interactive workflow was verified in Tern. Do not assume equivalent print/RPC/ACP behavior; their input-event dispatch/UI differs.

## Change the trigger

```sh
ompa --snippet-prefix '&'
```

The prefix must be one punctuation character, excluding `/`, `\`, and backtick. `%` is the default. Only one prefix is active per session.

## Local development

```sh
bun install
bun test
bun run check
omp plugin link /Users/jdvans/claudework/omp-snippets
```

The development dependencies point at this machine's installed omp 18.6.0 packages so the extension is checked against the host's APIs. Restart omp after changing extension source.

Verified: nine behavioral tests, TypeScript check, actual ANSI rendering, native Tern light/dark token styling, and Tern/ompa autocomplete and expanded submission with a model response. Unknown-reference rejection preserves the draft.
