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

async function saveGeneratedImageLocally(base64Image: string, keyword: string): Promise<string> {
  const outputDir = join(process.cwd(), "public", "generated-images");
  await mkdir(outputDir, { recursive: true });

  const filename = `${slugKeyword(keyword)}-${Date.now()}.png`;
  const filepath = join(outputDir, filename);
  const buffer = Buffer.from(base64Image, "base64");
  await writeFile(filepath, buffer);

  return `/generated-images/${filename}`;
}

async function generateImageWithOpenAI(input: GenerateInput, apiKey: string): Promise<string | null> {
  const imageModel = import.meta.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const imagePrompt = `Crie uma imagem editorial premium para capa de artigo sobre "${input.keyword}" no nicho "${input.niche}".
Estilo: clean editorial, realista, moderno, alta qualidade, sem textos na imagem, composição horizontal para blog.`;

  const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: imageModel,
      prompt: imagePrompt,
      size: "1536x1024"
    })
  });

  if (!imageResponse.ok) return null;

  const payload = (await imageResponse.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const base64Image = payload.data?.[0]?.b64_json;
  if (!base64Image) return null;

  return saveGeneratedImageLocally(base64Image, input.keyword);
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
  const generatedImageUrl = await generateImageWithOpenAI(input, apiKey);

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
