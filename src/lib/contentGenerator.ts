import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type GenerateInput = {
  tenantName: string;
  niche: string;
  keyword: string;
  tone: string;
};

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

async function saveGeneratedImageBuffer(buffer: Buffer, keyword: string, ext: string): Promise<string> {
  const outputDir = join(process.cwd(), "public", "generated-images");
  await mkdir(outputDir, { recursive: true });

  const filename = `${slugKeyword(keyword)}-${Date.now()}.${ext}`;
  const filepath = join(outputDir, filename);
  await writeFile(filepath, buffer);

  return `/generated-images/${filename}`;
}

async function saveGeneratedImageLocally(base64Image: string, keyword: string): Promise<string> {
  const buffer = Buffer.from(base64Image, "base64");
  return saveGeneratedImageBuffer(buffer, keyword, "png");
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
    return await saveGeneratedImageBuffer(buffer, keyword, ext);
  } catch (error) {
    console.error("Falha ao salvar imagem baixada:", error);
    return null;
  }
}

async function generateImageWithOpenAI(input: GenerateInput, apiKey: string): Promise<string | null> {
  const imageModel = import.meta.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const imagePrompt = `Crie uma imagem editorial premium para capa de artigo sobre "${input.keyword}" no nicho "${input.niche}".
Estilo: clean editorial, realista, moderno, alta qualidade, sem textos na imagem, composição horizontal para blog.`;

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
}): Promise<string | null> {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return generateImageWithOpenAI(
    {
      tenantName: params.tenantName,
      niche: params.niche,
      keyword: params.headline,
      tone: params.tone
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
    imageUrl: generatedImageUrl ?? `https://picsum.photos/1200/600?random=${Math.floor(Math.random() * 1000)}`
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

Gere exatamente ${input.count} PAUTAS (ideias de artigos) para o mes, com titulo chamativo e um resumo de 2-3 frases do que o artigo vai cobrir.
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
  return parsed.pitches.slice(0, input.count);
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
  return ai?.length ? ai : fallbackMonthlyPitches(input);
}

type FromPitchInput = {
  tenantName: string;
  niche: string;
  tone: string;
  brief: string;
  styleNotes: string;
  pitchTitle: string;
  pitchSummary: string;
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
    tone: input.tone
  };
  let generatedImageUrl: string | null = null;
  try {
    generatedImageUrl = await generateImageWithOpenAI(imageInput, apiKey);
  } catch (error) {
    console.error("Falha na geracao de imagem OpenAI (pitch):", error);
  }
  return {
    ...parsed,
    imageUrl: generatedImageUrl ?? `https://picsum.photos/1200/600?random=${Math.floor(Math.random() * 1000)}`
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
