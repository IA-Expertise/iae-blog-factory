import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true
});

/** Converte Markdown (conteúdo dos posts) em HTML seguro para `set:html` no servidor. */
export function renderPostMarkdown(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  return marked.parse(trimmed, { async: false }) as string;
}
