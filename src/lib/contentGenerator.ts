import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isObjectStorageConfigured, uploadGeneratedCoverImage } from "./objectStorage";

/** Estilos de capa gerada por IA (campo Tenant.coverImageStyle). */
export const COVER_IMAGE_STYLES = ["photo", "watercolor", "flat"] as const;
export type CoverImageStyle = (typeof COVER_IMAGE_STYLES)[number];

export function normalizeCoverImageStyle(value: string | null | undefined): CoverImageStyle {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "watercolor" || v === "aquarela") return "watercolor";
  if (v === "flat" || v === "vector" || v === "ilustracao") return "flat";
  return "photo";
}

function coverStyleDirective(style: CoverImageStyle): string {
  switch (style) {
    case "watercolor":
      return `- ESTILO OBRIGATORIO: ilustracao em aquarela digital (watercolor), pigmentos suaves, bordas levemente irregulares, textura de papel, sem parecer foto.
- Paleta harmoniosa e editorial; evite hiper-realismo, CGI e stock fotografico.
- Alta qualidade de ilustracao, sem marcas d'agua.`;
    case "flat":
      return `- ESTILO OBRIGATORIO: ilustracao flat / vetorial limpa, formas geometricas simples, poucas sombras, cores chapadas e modernas.
- Evite fotorrealismo, texturas de foto e detalhes hiper-realistas.
- Alta qualidade de ilustracao, sem marcas d'agua.`;
    default:
      return `- ESTILO: ilustracao fotorrealista ou semi-fotorrealista, alta qualidade, sem marcas d'agua.
- Evite caricatura infantil ou aquarela quando o estilo for fotografico.`;
  }
}

type GenerateInput = {
  tenantName: string;
  niche: string;
  keyword: string;
  tone: string;
  /** Preset visual do tenant (classic, urban, etc.) para variar mood. */
  themePreset?: string;
  /** Estilo de capa do tenant (photo | watercolor | flat). */
  coverImageStyle?: string | null;
  /** Trecho curto de briefing/estilo editorial (opcional). */
  styleHint?: string;
  /** Instrução curta do editor só nesta geração (ex.: regenerar capa). */
  imageDirection?: string;
};

function truncateForPrompt(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/** Prompt rico por tenant — antes o modelo ignorava marca/tom e repetia o mesmo estilo. */
function buildEditorialImagePrompt(input: GenerateInput): string {
  const brand = truncateForPrompt(input.tenantName || "Blog", 80);
  const niche = truncateForPrompt(input.niche || "conteudo editorial", 120);
  const headline = truncateForPrompt(input.keyword || "artigo", 160);
  const tone = truncateForPrompt(input.tone || "profissional", 60);
  const coverStyle = normalizeCoverImageStyle(input.coverImageStyle);
  const preset = input.themePreset?.trim() ? `Preset visual do site: ${input.themePreset.trim()}.` : "";
  const hint = input.styleHint?.trim()
    ? `Notas de estilo (referencia, nao texto na imagem): ${truncateForPrompt(input.styleHint, 220)}.`
    : "";
  const direction = input.imageDirection?.trim()
    ? `Pedido extra do editor para ESTA capa (apenas inspiracao visual, sem texto na imagem): ${truncateForPrompt(input.imageDirection, 240)}.`
    : "";
  const variationId = Date.now();

  return `Crie UMA imagem de capa horizontal para blog (formato largo), SEM texto, SEM logotipo, SEM letras ou numeros na imagem.

Marca/blog: "${brand}".
Nicho editorial: ${niche}.
Titulo do artigo (use apenas como inspiracao visual, nao escreva na imagem): ${headline}.
Tom/atmosfera desejada: ${tone}.
Estilo de capa do tenant: ${coverStyle}.
${preset}
${hint}
${direction}

Diretrizes:
- A cena, paleta e elementos visuais devem refletir claramente o NICHO acima (ex.: historia → epoca/cenario coerente; gestao publica → cidade/servicos/cidadania; bem-estar → luz suave e humanizada; tecnologia → ambiente moderno sem ficar generico demais).
- Evite o visual "corporativo generico de stock" quando o nicho nao for corporativo.
- Composicao limpa com espaco negativo para titulo em overlay no site.
${coverStyleDirective(coverStyle)}
- Variacao desta geracao (para nao repetir capas identicas): ${variationId}.`;
}

export type GeneratedArticle = {
  title: string;
  category: string;
  excerpt: string;
  content: string;
  imageUrl: string;
};

function slugKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function extToContentType(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "webp") return "image/webp";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  return "image/png";
}

/** Grava capa no object storage (se configurado) ou em disco + URL da API local. */
async function persistCoverImageToStorage(buffer: Buffer, keyword: string, ext: string): Promise<string> {
  const filename = `${slugKeyword(keyword)}-${Date.now()}.${ext}`;
  const contentType = extToContentType(ext);

  if (isObjectStorageConfigured()) {
    const remoteUrl = await uploadGeneratedCoverImage({ buffer, filename, contentType });
    if (remoteUrl) return remoteUrl;
    console.warn("Upload para object storage falhou; gravando capa no disco local.");
  }

  const outputDir = join(process.cwd(), "public", "generated-images");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, filename), buffer);
  return `/api/media/generated/${filename}`;
}

async function saveGeneratedImageLocally(base64Image: string, keyword: string): Promise<string> {
  const buffer = Buffer.from(base64Image, "base64");
  return persistCoverImageToStorage(buffer, keyword, "png");
}

function buildImageGenerationBody(imageModel: string, prompt: string): Record<string, unknown> {
  const m = imageModel.toLowerCase();
  if (m.startsWith("dall-e-3")) {
    return {
      model: imageModel,
      prompt,
      n: 1,
      size: "1792x1024",
      quality: "standard",
      response_format: "b64_json"
    };
  }
  if (m.startsWith("dall-e-2")) {
    return {
      model: imageModel,
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    };
  }
  return {
    model: imageModel,
    prompt,
    n: 1,
    size: "1536x1024",
    quality: "medium"
  };
}

async function downloadRemoteImageToPublic(url: string, keyword: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error("Falha ao baixar imagem da URL OpenAI:", res.status);
    return null;
  }
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  const ext = type.includes("webp") ? "webp" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : "png";
  const buffer = Buffer.from(await res.arrayBuffer());
  try {
    return await persistCoverImageToStorage(buffer, keyword, ext);
  } catch (error) {
    console.error("Falha ao salvar imagem baixada:", error);
    return null;
  }
}

async function generateImageWithOpenAI(input: GenerateInput, apiKey: string): Promise<string | null> {
  const imageModel = import.meta.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const imagePrompt = buildEditorialImagePrompt(input);

  const body = buildImageGenerationBody(imageModel, imagePrompt);

  const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!imageResponse.ok) {
    const errText = await imageResponse.text().catch(() => "");
    console.error("OpenAI /v1/images/generations:", imageResponse.status, errText.slice(0, 800));
    return null;
  }

  const payload = (await imageResponse.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = payload.data?.[0];
  if (!first) {
    console.error("Resposta de imagem OpenAI sem data[0]");
    return null;
  }

  if (first.b64_json) {
    try {
      return await saveGeneratedImageLocally(first.b64_json, input.keyword);
    } catch (error) {
      console.error("Falha ao salvar imagem localmente (base64):", error);
      return null;
    }
  }

  if (first.url) {
    return downloadRemoteImageToPublic(first.url, input.keyword);
  }

  console.error("Resposta de imagem OpenAI sem b64_json nem url:", Object.keys(first));
  return null;
}

export async function regenerateCoverImage(params: {
  tenantName: string;
  niche: string;
  headline: string;
  tone: string;
  themePreset?: string | null;
  coverImageStyle?: string | null;
  editorialStyleNotes?: string | null;
  /** Texto curto do editor para orientar esta regeneração (opcional). */
  imageDirection?: string | null;
}): Promise<string | null> {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const dir = params.imageDirection?.trim() ?? "";
  return generateImageWithOpenAI(
    {
      tenantName: params.tenantName,
      niche: params.niche,
      keyword: params.headline,
      tone: params.tone,
      themePreset: params.themePreset ?? undefined,
      coverImageStyle: params.coverImageStyle ?? undefined,
      styleHint: params.editorialStyleNotes ?? undefined,
      ...(dir ? { imageDirection: dir } : {})
    },
    apiKey
  );
}

async function generateWithOpenAI(input: GenerateInput): Promise<GeneratedArticle | null> {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Gere um artigo SEO em portugues para o blog ${input.tenantName}.
Nicho: ${input.niche}
Palavra-chave principal: ${input.keyword}
Tom: ${input.tone}

Retorne SOMENTE JSON com este formato:
{
  "title": "string",
  "category": "string curta",
  "excerpt": "string 1-2 frases",
  "content": "markdown completo com h2/h3 e CTA final"
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7
    })
  });

  if (!response.ok) return null;
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const jsonText = data.choices?.[0]?.message?.content;
  if (!jsonText) return null;
  const parsed = JSON.parse(jsonText) as Omit<GeneratedArticle, "imageUrl">;
  let generatedImageUrl: string | null = null;
  try {
    generatedImageUrl = await generateImageWithOpenAI(input, apiKey);
  } catch (error) {
    console.error("Falha na geracao de imagem OpenAI:", error);
  }

  return {
    ...parsed,
    // Fallback estável por keyword para evitar "troca" de imagem a cada reload.
    imageUrl: generatedImageUrl ?? `https://picsum.photos/1200/600?seed=${slugKeyword(input.keyword)}`
  };
}

function fallbackArticle(input: GenerateInput): GeneratedArticle {
  const title = `Guia definitivo sobre ${input.keyword}: estrategias praticas para 2026`;
  return {
    title,
    category: "SEO",
    excerpt: `Aprenda como aplicar ${input.keyword} com foco em crescimento organico e monetizacao.`,
    content: `## Por que ${input.keyword} importa\n\nNo contexto de ${input.niche}, ${input.keyword} se tornou prioridade.\n\n## Estrategia em 3 passos\n\n1. Pesquisa de intencao de busca.\n2. Conteudo orientado a conversao.\n3. Distribuicao com consistencia.\n\n## Checklist rapido\n\n- Defina palavra-chave principal e secundarias.\n- Estruture H1, H2 e H3 com clareza.\n- Inclua CTA alinhado ao objetivo de receita.\n\n## Conclusao\n\nCom execucao semanal e ajustes guiados por dados, voce escala resultados sem aumentar complexidade.`,
    imageUrl: `https://picsum.photos/1200/600?seed=${slugKeyword(input.keyword)}`
  };
}

export async function generateArticleAndImage(input: GenerateInput): Promise<GeneratedArticle> {
  const aiContent = await generateWithOpenAI(input);
  return aiContent ?? fallbackArticle(input);
}

export type MonthlyPitchIdea = {
  title: string;
  summary: string;
  category: string;
};

type RssJsonItem = {
  title?: string;
  url?: string;
  content_text?: string;
  content_html?: string;
  /** JSON Feed 1.1 (ex.: rss.app) */
  summary?: string;
  date_published?: string;
};

type MonthlyPitchInput = {
  tenantName: string;
  niche: string;
  monthLabel: string;
  count: number;
  brief: string;
  styleNotes: string;
  tone: string;
};

async function generateMonthlyPitchesWithOpenAI(input: MonthlyPitchInput): Promise<MonthlyPitchIdea[] | null> {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Voce e editor-chefe de um blog em portugues.
Blog: ${input.tenantName}
Nicho: ${input.niche}
Mes editorial: ${input.monthLabel}
Tom: ${input.tone}

Briefing do blog:
${input.brief || "(sem briefing extra)"}

Estilo e propostas:
${input.styleNotes || "(sem notas de estilo)"}

Gere exatamente ${input.count} PAUTAS (ideias de artigos) para o mes, com titulo chamativo e um resumo de pelo menos 120 caracteres em 2-3 frases (sem ser generico demais) sobre o que o artigo vai cobrir.
Retorne SOMENTE JSON no formato:
{ "pitches": [ { "title": "...", "summary": "...", "category": "string curta" } ] }`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.75
    })
  });

  if (!response.ok) return null;
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const jsonText = data.choices?.[0]?.message?.content;
  if (!jsonText) return null;
  const parsed = JSON.parse(jsonText) as { pitches?: MonthlyPitchIdea[] };
  if (!parsed.pitches?.length) return null;
  return parsed.pitches
    .filter((p) => (p.title ?? "").trim())
    .map((p) => {
      const title = (p.title ?? "").trim();
      return {
        title,
        category: (p.category ?? "Editorial").trim() || "Editorial",
        summary: ensureMinPitchSummary(title, "", (p.summary ?? "").trim(), 100)
      };
    })
    .slice(0, input.count);
}

function fallbackMonthlyPitches(input: MonthlyPitchInput): MonthlyPitchIdea[] {
  const base = [
    {
      title: `Guia pratico de ${input.niche} em ${input.monthLabel}`,
      summary: `Visao geral com passos acionaveis e exemplos para leitores do blog ${input.tenantName}.`,
      category: "Guia"
    },
    {
      title: `Erros comuns em ${input.niche} (e como evitar)`,
      summary: `Lista objetiva de armadilhas frequentes e checklist de correcao rapida.`,
      category: "Checklist"
    },
    {
      title: `Tendencias de ${input.niche} para acompanhar agora`,
      summary: `Panorama curto do que mudou no mercado e o que priorizar no conteudo.`,
      category: "Tendencias"
    },
    {
      title: `Estudo de caso: resultado real em ${input.niche}`,
      summary: `Narrativa com problema, acao e resultado, com espaco para dados e CTA.`,
      category: "Casos"
    },
    {
      title: `Perguntas frequentes: ${input.niche} descomplicado`,
      summary: `FAQ em linguagem simples, ideal para SEO de longa cauda.`,
      category: "FAQ"
    },
    {
      title: `Ferramentas essenciais para quem trabalha com ${input.niche}`,
      summary: `Comparativo leve de ferramentas com criterios de escolha.`,
      category: "Ferramentas"
    },
    {
      title: `Como medir sucesso em ${input.niche}`,
      summary: `Metricas, cadencia de revisao e como comunicar resultados.`,
      category: "Metricas"
    },
    {
      title: `Roteiro editorial de 30 dias para ${input.niche}`,
      summary: `Distribuicao semanal de temas alinhados ao briefing do blog.`,
      category: "Estrategia"
    }
  ];
  return base.slice(0, Math.min(input.count, base.length));
}

export async function generateMonthlyPitches(input: MonthlyPitchInput): Promise<MonthlyPitchIdea[]> {
  const ai = await generateMonthlyPitchesWithOpenAI(input);
  const raw = ai?.length ? ai : fallbackMonthlyPitches(input);
  return raw.map((p) => ({
    ...p,
    summary: ensureMinPitchSummary(p.title, "", p.summary, 80)
  }));
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSummary(input: string): string {
  const clean = stripHtml(input).replace(/[\u2026]|(\[\.\.\.\])|(\.\.\.)/g, "").trim();
  if (!clean) return "";
  if (clean.length <= 260) return clean;
  return `${clean.slice(0, 257).trimEnd()}...`;
}

/** Busca a página da notícia quando o JSON Feed não traz corpo (comportamento próximo ao “abrir o link”). */
async function fetchPagePlainExcerpt(urlStr: string, maxChars: number): Promise<string> {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return "";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "";
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".local")) return "";

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(urlStr, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; IAE-Blog-Factory/1.1; editorial-preview) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5"
      }
    });
    if (!res.ok) return "";
    const buf = await res.arrayBuffer();
    const cap = Math.min(buf.byteLength, 380_000);
    const html = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(new Uint8Array(buf, 0, cap));
    const noNoise = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
    const text = stripHtml(noNoise).replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.slice(0, maxChars);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/** Garante resumo utilizável para pauta / geração (evita “só título” ou validações por tamanho). */
function ensureMinPitchSummary(title: string, url: string, base: string, minLen: number): string {
  const t = title.trim();
  const u = url.trim();
  let s = base.trim();
  if (s.length >= minLen) return s;
  const pad = u
    ? `Pauta baseada na noticia: "${t}". Leia o conteudo na fonte ${u} e desenvolva o artigo com contexto local, dados quando existirem e tom editorial do blog.`
    : `Desenvolva o artigo "${t}" em secoes claras, com exemplos praticos, dados quando fizer sentido e CTA final alinhado ao briefing do blog.`;
  s = `${s} ${pad}`.replace(/\s+/g, " ").trim();
  return s.length >= minLen ? s : pad;
}

function looksGenericTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return true;
  return t === "em breve" || t.includes(" archives");
}

/** Item ja normalizado (JSON, RSS 2.0, Atom ou CSV rss.app). */
type FeedItemNormalized = {
  title: string;
  url: string;
  bodyHint: string;
  publishedRaw: string | null;
};

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number.parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(Number.parseInt(h, 16)));
}

function extractRssTag(block: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cdata = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${escaped}>`,
    "i"
  );
  const m1 = block.match(cdata);
  if (m1) return decodeXmlEntities(m1[1].trim());

  const plain = new RegExp(`<${escaped}(?:\\s[^>]*)?>\\s*([\\s\\S]*?)\\s*</${escaped}>`, "i");
  const m2 = block.match(plain);
  if (!m2) return "";
  let inner = m2[1];
  inner = inner.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
  return decodeXmlEntities(stripHtml(inner).trim());
}

function parseJsonFeedItems(text: string): FeedItemNormalized[] {
  const parsed = JSON.parse(text) as { items?: RssJsonItem[] };
  return (parsed.items ?? [])
    .map((item) => ({
      title: (item.title ?? "").trim(),
      url: (item.url ?? "").trim(),
      bodyHint: [item.content_text, item.content_html, item.summary].filter(Boolean).join("\n"),
      publishedRaw: item.date_published?.trim() || null
    }))
    .filter((x) => x.title && x.url);
}

function parseRss2Items(xml: string): FeedItemNormalized[] {
  const out: FeedItemNormalized[] = [];
  const cleaned = xml.replace(/^\uFEFF/, "").trim();
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const block = m[1];
    const title = extractRssTag(block, "title");
    const url = extractRssTag(block, "link").trim();
    const pubDate = extractRssTag(block, "pubDate");
    const description = extractRssTag(block, "description");
    const encoded = extractRssTag(block, "content:encoded");
    const bodyHint = [description, encoded].filter(Boolean).join("\n\n");
    if (!title || !url) continue;
    out.push({ title, url, bodyHint, publishedRaw: pubDate || null });
  }
  return out;
}

function parseAtomEntries(xml: string): FeedItemNormalized[] {
  const out: FeedItemNormalized[] = [];
  const cleaned = xml.replace(/^\uFEFF/, "");
  const re = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const block = m[1];
    const title = extractRssTag(block, "title");
    const linkRel =
      block.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i) ??
      block.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']alternate["']/i);
    const linkAny = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    const url = (linkRel?.[1] ?? linkAny?.[1] ?? "").trim();
    const summary = extractRssTag(block, "summary");
    const content = extractRssTag(block, "content");
    const published = extractRssTag(block, "published") || extractRssTag(block, "updated");
    const bodyHint = [summary, content].filter(Boolean).join("\n\n");
    if (!title || !url) continue;
    out.push({ title, url, bodyHint, publishedRaw: published || null });
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  let field = "";
  let inQuotes = false;
  while (i < line.length) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        fields.push(field.trim());
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
    }
  }
  fields.push(field.trim());
  return fields.map((f) => f.replace(/^"|"$/g, ""));
}

function parseRssAppLikeCsv(text: string): FeedItemNormalized[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]!);
  const col = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iTitle = col("Title");
  const iLink = col("Link");
  const iDate = col("Date");
  const iPlain = col("Plain Description");
  const iDesc = col("Description");
  const iBody = iPlain >= 0 ? iPlain : iDesc;
  if (iTitle < 0 || iLink < 0) return [];
  const out: FeedItemNormalized[] = [];
  for (let r = 1; r < lines.length; r++) {
    const row = parseCsvLine(lines[r]!);
    const title = (row[iTitle] ?? "").trim();
    const url = (row[iLink] ?? "").trim();
    const bodyHint = iBody >= 0 ? (row[iBody] ?? "").trim() : "";
    const date = iDate >= 0 ? (row[iDate] ?? "").trim() : "";
    if (!title || !url) continue;
    out.push({ title, url, bodyHint, publishedRaw: date || null });
  }
  return out;
}

function detectAndParseFeedBody(text: string): FeedItemNormalized[] {
  const t = text.replace(/^\uFEFF/, "").trim();
  if (!t) return [];
  if (t.startsWith("{")) {
    try {
      return parseJsonFeedItems(t);
    } catch {
      return [];
    }
  }
  if (t.startsWith("<")) {
    if (/<rss[\s>]/i.test(t) || /<rdf:RDF/i.test(t)) return parseRss2Items(t);
    if (/<feed[\s>]/i.test(t)) return parseAtomEntries(t);
    return [];
  }
  if (/^"ID"\s*,/i.test(t) || (t.includes('"Title"') && t.includes('"Link"'))) return parseRssAppLikeCsv(t);
  return [];
}

function formatFeedDateLabel(raw: string | null): string {
  if (!raw?.trim()) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return `Data: ${d.toLocaleDateString("pt-BR")}. `;
}

export async function generateMonthlyPitchesFromRss(input: {
  rssFeedUrl: string;
  count: number;
  niche: string;
}): Promise<MonthlyPitchIdea[]> {
  const feedUrl = input.rssFeedUrl.trim();
  if (!feedUrl) return [];

  try {
    const response = await fetch(feedUrl, {
      headers: { "User-Agent": "IAE-Blog-Factory/1.0 (+rss)" }
    });
    if (!response.ok) return [];

    const text = await response.text();
    const items = detectAndParseFeedBody(text);
    if (!items.length) return [];

    const seen = new Set<string>();
    const ideas: MonthlyPitchIdea[] = [];
    let pageFetchBudget = 8;

    for (const item of items) {
      if (ideas.length >= input.count) break;
      const title = item.title.trim();
      const url = item.url.trim();
      if (!title || looksGenericTitle(title) || !url) continue;

      const dedupeKey = `${title.toLowerCase()}|${url.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      let rawSummary = normalizeSummary(item.bodyHint);
      if (rawSummary.length < 100 && pageFetchBudget > 0) {
        pageFetchBudget -= 1;
        const fromPage = await fetchPagePlainExcerpt(url, 950);
        if (fromPage) {
          rawSummary = normalizeSummary([rawSummary, fromPage].filter(Boolean).join(" "));
        }
      }
      if (rawSummary.length < 50) {
        rawSummary = normalizeSummary(
          `O feed nao trouxe texto do corpo; use o titulo e a materia oficial na fonte. Titulo: ${title}. URL: ${url}`
        );
      }
      rawSummary = ensureMinPitchSummary(title, url, rawSummary, 80);

      const dateLabel = formatFeedDateLabel(item.publishedRaw);
      ideas.push({
        title,
        summary: `${dateLabel}${rawSummary} Fonte: ${url}`,
        category: "Atualidades"
      });
    }

    return ideas;
  } catch {
    return [];
  }
}

type FromPitchInput = {
  tenantName: string;
  niche: string;
  tone: string;
  brief: string;
  styleNotes: string;
  pitchTitle: string;
  pitchSummary: string;
  themePreset?: string | null;
  coverImageStyle?: string | null;
};

async function generateFromPitchOpenAI(input: FromPitchInput): Promise<GeneratedArticle | null> {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Escreva um artigo completo em portugues (markdown) para o blog ${input.tenantName}.
Nicho: ${input.niche}
Tom: ${input.tone}

Briefing:
${input.brief || "(sem briefing extra)"}

Estilo:
${input.styleNotes || "(sem notas de estilo)"}

PAUTA APROVADA:
Titulo: ${input.pitchTitle}
Resumo do conteudo: ${input.pitchSummary}

Regras:
- Use H2 e H3
- Inclua introducao, desenvolvimento e conclusao com CTA
- Otimize SEO sem keyword stuffing

Retorne SOMENTE JSON:
{ "title": "string (pode refinar o titulo da pauta)", "category": "string curta", "excerpt": "2 frases", "content": "markdown completo" }`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.65
    })
  });

  if (!response.ok) return null;
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const jsonText = data.choices?.[0]?.message?.content;
  if (!jsonText) return null;
  const parsed = JSON.parse(jsonText) as Omit<GeneratedArticle, "imageUrl">;
  const imageInput: GenerateInput = {
    tenantName: input.tenantName,
    niche: input.niche,
    keyword: input.pitchTitle,
    tone: input.tone,
    themePreset: input.themePreset ?? undefined,
    coverImageStyle: input.coverImageStyle ?? undefined,
    styleHint: [input.styleNotes, input.brief].filter(Boolean).join(" ").trim() || undefined
  };
  let generatedImageUrl: string | null = null;
  try {
    generatedImageUrl = await generateImageWithOpenAI(imageInput, apiKey);
  } catch (error) {
    console.error("Falha na geracao de imagem OpenAI (pitch):", error);
  }
  return {
    ...parsed,
    // Fallback estável por pauta para manter consistência visual no post.
    imageUrl: generatedImageUrl ?? `https://picsum.photos/1200/600?seed=${slugKeyword(input.pitchTitle)}`
  };
}

function fallbackArticleFromPitch(input: FromPitchInput): GeneratedArticle {
  return {
    title: input.pitchTitle,
    category: "Editorial",
    excerpt: input.pitchSummary.slice(0, 220),
    content: `## Introducao\n\n${input.pitchSummary}\n\n## Desenvolvimento\n\nConteudo completo sera gerado quando a API de IA estiver configurada.\n\n## Conclusao\n\nRevise este rascunho e publique quando estiver pronto.`,
    imageUrl: `https://picsum.photos/1200/600?seed=${slugKeyword(input.pitchTitle)}`
  };
}

export async function generateArticleFromPitch(input: FromPitchInput): Promise<GeneratedArticle> {
  const ai = await generateFromPitchOpenAI(input);
  return ai ?? fallbackArticleFromPitch(input);
}

/** Briefing de campo (áudio transcrito + texto). Sem geração de capa — a foto enviada é a capa. */
export type FieldBriefInput = {
  tenantName: string;
  niche: string;
  tone: string;
  brief: string;
  styleNotes?: string;
  /** Transcrição do áudio e/ou notas digitadas. */
  fieldNotes: string;
};

export type FieldArticleDraft = Omit<GeneratedArticle, "imageUrl">;

async function generateFromFieldBriefOpenAI(input: FieldBriefInput): Promise<FieldArticleDraft | null> {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const notes = input.fieldNotes.trim();
  if (!notes) return null;

  const prompt = `Escreva um artigo completo em portugues (markdown) para o blog ${input.tenantName}.
Nicho: ${input.niche}
Tom: ${input.tone}

Briefing do blog:
${input.brief || "(sem briefing extra)"}

Estilo editorial:
${input.styleNotes || "(sem notas de estilo)"}

NOTAS DO REPORTER EM CAMPO (fonte principal — preserve fatos, nomes, lugares e numeros; nao invente):
${notes}

Regras:
- Use H2 e H3
- Inclua introducao, desenvolvimento e conclusao com CTA leve
- Otimize SEO sem keyword stuffing
- Se as notas forem curtas, desenvolva de forma responsavel sem fabricar fatos

Retorne SOMENTE JSON:
{ "title": "string chamativo e fiel ao fato", "category": "string curta", "excerpt": "2 frases", "content": "markdown completo" }`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.55
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("OpenAI field brief:", response.status, errText.slice(0, 400));
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const jsonText = data.choices?.[0]?.message?.content;
  if (!jsonText) return null;
  return JSON.parse(jsonText) as FieldArticleDraft;
}

function fallbackArticleFromFieldBrief(input: FieldBriefInput): FieldArticleDraft {
  const snippet = input.fieldNotes.trim().slice(0, 220);
  return {
    title: snippet.slice(0, 80) || "Nota de campo",
    category: "Campo",
    excerpt: snippet || "Rascunho gerado a partir de notas de campo.",
    content: `## Introducao\n\n${input.fieldNotes.trim()}\n\n## Desenvolvimento\n\nConteudo completo sera gerado quando a API de IA estiver configurada.\n\n## Conclusao\n\nRevise este rascunho e publique quando estiver pronto.`
  };
}

/** Gera só texto (title/category/excerpt/content). Capa vem da foto enviada no fluxo /campo. */
export async function generateArticleFromFieldBrief(input: FieldBriefInput): Promise<FieldArticleDraft> {
  const ai = await generateFromFieldBriefOpenAI(input);
  return ai ?? fallbackArticleFromFieldBrief(input);
}

/** Transcreve áudio de campo via OpenAI (Whisper). */
export async function transcribeFieldAudio(params: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<string | null> {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const form = new FormData();
  const bytes = new Uint8Array(params.buffer);
  const blob = new Blob([bytes], { type: params.contentType || "application/octet-stream" });
  form.append("file", blob, params.filename || "audio.webm");
  form.append("model", "whisper-1");
  form.append("language", "pt");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("OpenAI whisper:", response.status, errText.slice(0, 400));
    return null;
  }

  const data = (await response.json()) as { text?: string };
  const text = data.text?.trim() ?? "";
  return text || null;
}
