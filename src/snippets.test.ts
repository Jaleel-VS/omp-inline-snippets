import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { references, expandReferences, completionPrefix, loadSnippets, validatePrefix } from "./snippets";

const snippets = new Map([
  ["concise", { name: "concise", description: "Brief", content: "Keep it brief." }],
  ["minimal_change", { name: "minimal_change", description: "Scope", content: "Avoid unrelated refactors. %not_recursive" }],
]);

test("attaches each referenced definition once in first-use order without recursive expansion", () => {
  expect(expandReferences("Fix it. %minimal_change, %concise and %concise.", snippets, "%")).toBe("Fix it. %minimal_change, %concise and %concise.\n\nReferenced instructions (apply the definitions below to the references in this message):\n%minimal_change:\nAvoid unrelated refactors. %not_recursive\n\n%concise:\nKeep it brief.");
});

test("missing names stop expansion rather than partially applying instructions", () => {
  expect(() => expandReferences("%concise %missing", snippets, "%")).toThrow("Unknown snippet: %missing");
});

test("preserves literal code, URLs, percentages, and escaped references", () => {
  const literal = "90% https://example.com/%concise path/%concise word%concise ` %concise `\n```ts\n%concise\n```\n~~~\n%concise\n~~~";
  expect(expandReferences(literal, snippets, "%")).toBe(literal);
  expect(expandReferences("Literal \\%concise; actual %concise", snippets, "%")).toBe("Literal %concise; actual %concise\n\nReferenced instructions (apply the definitions below to the references in this message):\n%concise:\nKeep it brief.");
});

test("supports punctuation, underscore names, and configurable prefix", () => {
  expect(references("(%minimal_change), %concise!", "%").map(ref => ref.name)).toEqual(["minimal_change", "concise"]);
  expect(expandReferences("&concise", snippets, "&")).toContain("&concise:\nKeep it brief.");
  expect(() => validatePrefix("/")).toThrow();
  expect(() => validatePrefix("%%")).toThrow();
});

test("completion respects cursor position, multiline code fences, and escaping", () => {
  expect(completionPrefix(["Do %con then continue"], 0, 7, "%")).toBe("%con");
  expect(completionPrefix(["Do %"], 0, 4, "%")).toBe("%");
  expect(completionPrefix(["```", "%con"], 1, 4, "%")).toBeNull();
  expect(completionPrefix(["\\%con"], 0, 5, "%")).toBeNull();
  expect(completionPrefix(["`%con"], 0, 5, "%")).toBeNull();
});

test("loads Markdown descriptions, rejects duplicate filenames, and reloads edited text", async () => {
  const root = await mkdtemp(join(tmpdir(), "omp-snippets-"));
  try {
    await writeFile(join(root, "concise.md"), "---\ndescription: Brief answers\n---\nKeep it brief.");
    expect((await loadSnippets([root])).get("concise")).toEqual({ name: "concise", description: "Brief answers", content: "Keep it brief." });
    await writeFile(join(root, "concise.md"), "New instruction.");
    expect(expandReferences("%concise", await loadSnippets([root]), "%")).toContain("New instruction.");
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "nested", "concise.md"), "Conflicting instruction.");
    await expect(loadSnippets([root])).rejects.toThrow("Duplicate snippet name: concise");
  } finally { await rm(root, { recursive: true, force: true }); }
});
