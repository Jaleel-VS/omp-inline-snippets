import { CustomEditor } from "@oh-my-pi/pi-tui/prompt/custom-editor";
import type { Theme } from "@oh-my-pi/pi-tui/theme";
import { references, type Snippet } from "./snippets";

interface SnippetState { prefix: string; snippets: ReadonlyMap<string, Snippet>; theme: Theme }
interface TokenStyle { start: number; end: number; known: boolean }

// Visual-only: the buffer, cursor, undo history, and atomic token rules stay unchanged.
export class SnippetEditor extends CustomEditor {
  #text: string | undefined;
  #prefix: string | undefined;
  #snippets: ReadonlyMap<string, Snippet> | undefined;
  #tokens: TokenStyle[] = [];
  readonly #state: () => SnippetState;

  constructor(state: () => SnippetState, ...args: readonly unknown[]) {
    super(...args);
    this.#state = state;
    const decorate = this.decorateText;
    const describe = this.describeDecorations;
    this.decorateText = (text, context) => {
      const { theme } = this.#state();
      if (this.composerState().shell) return decorate(text, context);
      const tokens = this.#styles(this.getText());
      if (!tokens.length) return decorate(text, context);
      const lineOffset = this.getLines().slice(0, context.line).reduce((offset, line) => offset + line.length + 1, 0);
      const start = lineOffset + context.startCol;
      const end = start + text.length;
      let offset = 0;
      let result = "";
      const plain = (from: number, to: number) => decorate(text.slice(from, to), { line: context.line, startCol: context.startCol + from, endCol: context.startCol + to });
      for (const token of tokens) {
        if (token.end <= start || token.start >= end) continue;
        const from = Math.max(0, token.start - start);
        const to = Math.min(text.length, token.end - start);
        result += plain(offset, from);
        const label = theme.bold(theme.fg(token.known ? "accent" : "error", text.slice(from, to)));
        result += token.known ? theme.bg("customMessageBg", label) : theme.underline(label);
        offset = to;
      }
      return result + plain(offset, text.length);
    };
    this.describeDecorations = lines => {
      const base = describe(lines);
      if (this.composerState().shell) return base;
      const tokens = this.#styles(lines.join("\n"));
      if (!tokens.length) return base;
      // Token styles own their ranges; spelling/keyword effects still apply everywhere else.
      return [
        ...base.filter(decoration => !tokens.some(token => decoration.from < token.end && decoration.to > token.start)),
        ...tokens.map(token => ({ from: token.start, to: token.end, s: token.known ? "accent strong mark" : "error strong" })),
      ];
    };
  }

  #styles(text: string): readonly TokenStyle[] {
    const { prefix, snippets } = this.#state();
    if (text === this.#text && prefix === this.#prefix && snippets === this.#snippets) return this.#tokens;
    this.#text = text;
    this.#prefix = prefix;
    this.#snippets = snippets;
    this.#tokens = [];
    for (const reference of references(text, prefix)) {
      if (reference.escaped) continue;
      const known = snippets.has(reference.name);
      // A still-viable autocomplete prefix is not a typo or an error.
      if (!known && [...snippets.keys()].some(name => name.toLowerCase().startsWith(reference.name.toLowerCase()))) continue;
      this.#tokens.push({ start: reference.start, end: reference.end, known });
    }
    return this.#tokens;
  }
}
