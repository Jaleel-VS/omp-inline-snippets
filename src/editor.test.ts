import { expect, test } from "bun:test";
import { getEditorTheme, initThemeSync, theme } from "@oh-my-pi/pi-tui/theme";
import { SnippetEditor } from "./editor";

initThemeSync();
const snippets = new Map([["concise", { name: "concise", description: "Brief", content: "Keep it brief." }]]);
function editor() { return new SnippetEditor(() => ({ prefix: "%", snippets, theme }), getEditorTheme()); }

test("native ranges distinguish known and unknown tokens without marking partial or literal references", () => {
  const instance = editor();
  const text = "Known %concise, partial %con, unknown %missing. Literal ` %concise ` and \\%concise";
  instance.setText(text);
  const ranges = instance.describeDecorations([text]).filter(range => range.s === "accent strong mark" || range.s === "error strong");
  expect(ranges.map(range => ({ text: text.slice(range.from, range.to), style: range.s }))).toEqual([
    { text: "%concise", style: "accent strong mark" },
    { text: "%missing", style: "error strong" },
  ]);
  expect(instance.getText()).toBe(text);
});

test("ANSI decoration preserves source text through wrapped token segments", () => {
  const instance = editor();
  const text = "Use %concise.";
  instance.setText(text);
  const first = instance.decorateText("Use %con", { line: 0, startCol: 0, endCol: 8 });
  const second = instance.decorateText("cise.", { line: 0, startCol: 8, endCol: 13 });
  expect(Bun.stripANSI(first + second)).toBe(text);
  expect(instance.getText()).toBe(text);
});

test("shell mode bypasses snippet decoration", () => {
  const instance = editor();
  instance.composerState = () => ({ shell: { kind: "bash", excluded: false }, running: false });
  instance.setText("! echo %concise");
  expect(instance.describeDecorations(["! echo %concise"]).filter(range => range.s.includes("mark"))).toEqual([]);
});

test("typing a reference opens suggestions without Tab and Escape dismisses without changing the draft", async () => {
  const instance = editor();
  instance.setTextAssistProvider({ getWordCompletion: () => "flicting" });
  let updated = Promise.withResolvers<void>();
  instance.onAutocompleteUpdate = () => updated.resolve();
  instance.setAutocompleteProvider({
    async getSuggestions(lines, line, col) {
      const text = lines[line].slice(0, col);
      const prefix = /%[A-Za-z_]*$/.exec(text)?.[0];
      return prefix && "%concise".startsWith(prefix) ? { prefix, items: [{ value: "%concise", label: "%concise" }] } : null;
    },
    applyCompletion(lines, line, col, item, prefix) {
      const updated = lines.slice();
      updated[line] = lines[line].slice(0, col - prefix.length) + item.value + lines[line].slice(col);
      return { lines: updated, cursorLine: line, cursorCol: col - prefix.length + item.value.length };
    },
  });
  instance.handleInput("Use %con");
  await updated.promise;
  expect(instance.isShowingAutocomplete()).toBe(true);
  expect(instance.getText()).toBe("Use %con");
  instance.handleInput("\x1b");
  expect(instance.isShowingAutocomplete()).toBe(false);
  expect(instance.getText()).toBe("Use %con");
  updated = Promise.withResolvers<void>();
  instance.handleInput("c");
  await updated.promise;
  expect(instance.isShowingAutocomplete()).toBe(true);
  instance.handleInput("\t");
  expect(instance.getText()).toBe("Use %concise");
  expect(instance.isShowingAutocomplete()).toBe(false);
});

test("native text edits trigger suggestions while code, escapes, and shell edits do not query completion", async () => {
  const instance = editor();
  const requested: string[] = [];
  const updated = Promise.withResolvers<void>();
  instance.onAutocompleteUpdate = () => updated.resolve();
  instance.setAutocompleteProvider({
    async getSuggestions(lines) {
      requested.push(lines.join("\n"));
      return null;
    },
    applyCompletion(lines, line, col) { return { lines, cursorLine: line, cursorCol: col }; },
  });
  for (const text of ["`%con", "\\%con", "```\n%con"]) {
    instance.setText("");
    instance.handleInput(text);
  }
  instance.setText("");
  instance.applyHostEdit({ len: 0, from: 0, to: 0, text: "Use %con", cursor: 8 });
  await updated.promise;
  expect(requested).toEqual(["Use %con"]);
  instance.composerState = () => ({ shell: { kind: "bash", excluded: false }, running: false });
  instance.setText("");
  instance.handleInput("%con");
  expect(requested).toEqual(["Use %con"]);
});
