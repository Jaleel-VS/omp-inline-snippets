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
