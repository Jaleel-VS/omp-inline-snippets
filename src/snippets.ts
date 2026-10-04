import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

export interface Snippet { name: string; description: string; content: string }
export interface Reference { name: string; start: number; end: number; escaped: boolean }

export function validatePrefix(prefix: string): string {
  if (prefix.length !== 1 || /[\w\s\\`/]/.test(prefix)) throw new Error("Snippet prefix must be one punctuation character, excluding slash, backslash, and backtick.");
  return prefix;
}

// Scan prose only. Backtick/tilde fences and matching inline backtick runs are literal.
export function references(text: string, prefix: string, partial = false): Reference[] {
  const result: Reference[] = [];
  let fence: { char: string; count: number } | undefined;
  let inline = 0;
  for (let i = 0; i < text.length;) {
    if (i === 0 || text[i - 1] === "\n") {
      const line = text.slice(i, text.indexOf("\n", i) < 0 ? text.length : text.indexOf("\n", i));
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (marker && (!fence || (marker[1][0] === fence.char && marker[1].length >= fence.count && !marker[2].trim()))) {
        fence = fence ? undefined : { char: marker[1][0], count: marker[1].length };
        inline = 0;
        i += line.length;
        continue;
      }
    }
    if (fence) { i++; continue; }
    if (text[i] === "`") {
      let end = i + 1;
      while (text[end] === "`") end++;
      const count = end - i;
      if (inline === count) inline = 0;
      else if (!inline) inline = count;
      i = end;
      continue;
    }
    if (inline || text[i] !== prefix) { i++; continue; }
    let slashStart = i;
    while (slashStart > 0 && text[slashStart - 1] === "\\") slashStart--;
    const escaped = (i - slashStart) % 2 === 1;
    const previous = text[slashStart - 1];
    // No URL/path, word, or adjacent-prefix matches; ordinary punctuation is allowed.
    if (previous && !/[\s([{,:;!?]/.test(previous)) { i++; continue; }
    let end = i + 1;
    if (/[A-Za-z_]/.test(text[end] ?? "")) {
      end++;
      while (/[A-Za-z0-9_-]/.test(text[end] ?? "")) end++;
    }
    if (end > i + 1 || (partial && end === text.length)) {
      result.push({ name: text.slice(i + 1, end), start: i, end, escaped });
    }
    i = end;
  }
  return result;
}

export function expandReferences(text: string, snippets: Map<string, Snippet>, prefix: string): string {
  const refs = references(text, prefix);
  const names = [...new Set(refs.filter(ref => !ref.escaped).map(ref => ref.name))];
  const missing = names.filter(name => !snippets.has(name));
  if (missing.length) throw new Error(`Unknown snippet${missing.length > 1 ? "s" : ""}: ${missing.map(name => prefix + name).join(", ")}`);
  // Remove only the escape attached to a literal reference, without rescanning the result.
  let message = "";
  let offset = 0;
  for (const ref of refs.filter(ref => ref.escaped)) {
    message += text.slice(offset, ref.start - 1) + text.slice(ref.start, ref.end);
    offset = ref.end;
  }
  message += text.slice(offset);
  if (!names.length) return message;
  return `${message}\n\nReferenced instructions (apply the definitions below to the references in this message):\n${names.map(name => `${prefix}${name}:\n${snippets.get(name)!.content}`).join("\n\n")}`;
}

export function completionPrefix(lines: string[], line: number, col: number, prefix: string): string | null {
  const text = [...lines.slice(0, line), lines[line].slice(0, col)].join("\n");
  const last = references(text, prefix, true).at(-1);
  return last && !last.escaped && last.end === text.length ? text.slice(last.start) : null;
}

export async function loadSnippets(directories: string[]): Promise<Map<string, Snippet>> {
  const snippets = new Map<string, Snippet>();
  async function visit(directory: string): Promise<void> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!entry.name.endsWith(".md") || (!entry.isFile() && !entry.isSymbolicLink())) continue;
      const name = basename(entry.name, ".md");
      if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) continue;
      const raw = (await readFile(file, "utf8")).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
      const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(raw);
      const metadata = match ? Bun.YAML.parse(match[1]) as { description?: unknown } | null : null;
      const content = (match ? raw.slice(match[0].length) : raw).trim();
      if (!content) throw new Error(`Empty snippet: ${file}`);
      if (snippets.has(name)) throw new Error(`Duplicate snippet name: ${name} (${file}). Use unique Markdown filenames.`);
      const description = typeof metadata?.description === "string" ? metadata.description : content.split("\n")[0].slice(0, 80);
      snippets.set(name, { name, description, content });
    }
  }
  for (const directory of [...new Set(directories)]) await visit(directory);
  return snippets;
}
