import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { AutocompleteProvider } from "@oh-my-pi/pi-tui";
import { completionPrefix, expandReferences, loadSnippets, validatePrefix, type Snippet } from "./snippets";
import { SnippetEditor } from "./editor";

export default function inlineSnippets(pi: ExtensionAPI) {
  pi.registerFlag("snippet-prefix", { description: "Inline snippet trigger character", type: "string", default: "%" });
  let prefix = "%";
  let snippets = new Map<string, Snippet>();
  let loadError: string | undefined;
  async function refresh(cwd: string) {
    try {
      prefix = validatePrefix(String(pi.getFlag("snippet-prefix") ?? "%"));
      snippets = await loadSnippets([
        join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".omp", "agent"), "prompts"),
        join(cwd, ".omp", "prompts"),
      ]);
      loadError = undefined;
    } catch (error) {
      snippets.clear();
      loadError = error instanceof Error ? error.message : String(error);
    }
  }
  pi.on("session_start", async (_event, ctx) => {
    await refresh(ctx.cwd);
    if (!ctx.hasUI) return;
    if (loadError) ctx.ui.notify(loadError, "error");
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new SnippetEditor(() => ({ prefix, snippets, theme: ctx.ui.theme }), tui, theme, keybindings));
    ctx.ui.addAutocompleteProvider(current => {
      // Preserve optional methods and their receiver; do not replace native completion behavior.
      const overrides: Partial<AutocompleteProvider> = {
        async getSuggestions(lines, line, col, signal, onPartial) {
          const token = completionPrefix(lines, line, col, prefix);
          if (token === null) return current.getSuggestions(lines, line, col, signal, onPartial);
          const query = token.slice(1).toLowerCase();
          const items = [...snippets.values()].filter(snippet => snippet.name.toLowerCase().startsWith(query)).map(snippet => ({ value: prefix + snippet.name, label: prefix + snippet.name, description: snippet.description }));
          return { items, prefix: token };
        },
        applyCompletion(lines, line, col, item, token) {
          if (!token.startsWith(prefix) || !item.value.startsWith(prefix)) return current.applyCompletion(lines, line, col, item, token);
          const updated = lines.slice();
          updated[line] = lines[line].slice(0, col - token.length) + item.value + lines[line].slice(col);
          return { lines: updated, cursorLine: line, cursorCol: col - token.length + item.value.length };
        },
      };
      return new Proxy(current, {
        get(target, key) {
          if (key in overrides) return Reflect.get(overrides, key);
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
  });
  pi.on("input", async (event, ctx) => {
    // Read definitions at submission so edits never use stale content.
    await refresh(ctx.cwd);
    try {
      if (loadError) throw new Error(loadError);
      const text = expandReferences(event.text, snippets, prefix);
      return text === event.text ? undefined : { text };
    } catch (error) {
      if (ctx.hasUI) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        ctx.ui.setEditorText(event.text);
      }
      return { handled: true };
    }
  });
  pi.registerCommand("snippets", {
    description: "Reload and list inline prompt snippets",
    handler: async (_args, ctx) => {
      await refresh(ctx.cwd);
      ctx.ui.notify(loadError ?? ([...snippets.values()].map(snippet => `${prefix}${snippet.name} — ${snippet.description}`).join("\n") || "No snippets. Add Markdown files to ~/.omp/agent/prompts/ or .omp/prompts/."), loadError ? "error" : "info");
    },
  });
}
