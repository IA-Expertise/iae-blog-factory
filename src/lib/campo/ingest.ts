import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateArticleFromFieldBrief,
  regenerateCoverImage,
  transcribeFieldAudio
} from "../contentGenerator";
import { addPost, getTenantByHostname, logGenerationJob } from "../cms";
import { isObjectStorageConfigured, uploadPublicImageAsset } from "../objectStorage";
import { normalizeSocialVideoInput } from "../socialVideoEmbed";

export type CoverMode = "photo" | "ai";

export type CampoIngestResult =
  | { ok: true; postId: string }
  | { ok: false; error: string };

function extFromMime(mime: string, fallback: string): string {
  const m = mime.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a")) return "mp4";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  return fallback;
}

function slugSeed(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "campo";
}

async function persistCoverPhoto(buffer: Buffer, hostname: string, contentType: string): Promise<string | null> {
  const ext = extFromMime(contentType, "jpg");
  const safeHost = hostname.replace(/[^a-z0-9.-]/gi, "-").toLowerCase() || "tenant";
  const filename = `campo-${safeHost}-${Date.now()}.${ext}`;
  const objectPath = `campo/${safeHost}/${filename}`;

  if (isObjectStorageConfigured()) {
    const remote = await uploadPublicImageAsset({
      buffer,
      objectPath,
      contentType: contentType || "image/jpeg"
    });
    if (remote) return remote;
  }

  const outputDir = join(process.cwd(), "public", "generated-images");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, filename), buffer);
  return `/api/media/generated/${filename}`;
}

function mergeFieldNotes(transcript: string | null, textNotes: string): string {
  const parts: string[] = [];
  if (transcript?.trim()) parts.push(`(Audio):\n${transcript.trim()}`);
  if (textNotes.trim()) parts.push(`(Texto):\n${textNotes.trim()}`);
  return parts.join("\n\n").trim();
}

function normalizeCoverMode(raw: string | null | undefined): CoverMode {
  return (raw ?? "").trim().toLowerCase() === "ai" ? "ai" : "photo";
}

/**
 * Pipeline aditivo do webapp /campo:
 * - coverMode=photo → foto enviada é a capa
 * - coverMode=ai → capa gerada com o estilo do tenant (após a matéria)
 * Áudio/texto = briefing → Post IN_REVIEW.
 */
export async function ingestCampoSubmission(input: {
  hostname: string;
  coverMode?: string | null;
  photoBuffer?: Buffer | null;
  photoContentType?: string | null;
  audioBuffer?: Buffer | null;
  audioContentType?: string | null;
  audioFilename?: string | null;
  textNotes?: string | null;
  videoUrl?: string | null;
}): Promise<CampoIngestResult> {
  const hostname = input.hostname.trim().toLowerCase();
  const coverMode = normalizeCoverMode(input.coverMode);
  if (!hostname) return { ok: false, error: "Selecione um tenant." };
  if (coverMode === "photo" && !input.photoBuffer?.length) {
    return { ok: false, error: "Envie uma foto de capa." };
  }

  const site = await getTenantByHostname(hostname);
  if (!site) return { ok: false, error: "Tenant nao encontrado." };

  let transcript: string | null = null;
  if (input.audioBuffer?.length) {
    transcript = await transcribeFieldAudio({
      buffer: input.audioBuffer,
      filename: input.audioFilename || `audio.${extFromMime(input.audioContentType || "", "webm")}`,
      contentType: input.audioContentType || "audio/webm"
    });
  }

  const fieldNotes = mergeFieldNotes(transcript, input.textNotes ?? "");
  if (!fieldNotes) {
    return { ok: false, error: "Grave um audio ou escreva um texto com a noticia." };
  }

  const video = normalizeSocialVideoInput(input.videoUrl);
  if (video.error) {
    return { ok: false, error: video.error };
  }

  const article = await generateArticleFromFieldBrief({
    tenantName: site.brandName,
    niche: site.niche,
    tone: site.editorial.defaultArticleTone || "profissional",
    brief: site.editorial.projectDescription || "",
    styleNotes: site.editorial.editorialStyleNotes || "",
    fieldNotes
  });

  let coverUrl: string | null = null;

  if (coverMode === "photo") {
    coverUrl = await persistCoverPhoto(
      input.photoBuffer!,
      hostname,
      input.photoContentType || "image/jpeg"
    );
    if (!coverUrl) {
      return { ok: false, error: "Falha ao salvar a foto de capa." };
    }
  } else {
    coverUrl = await regenerateCoverImage({
      tenantName: site.brandName,
      niche: site.niche,
      headline: article.title,
      tone: site.editorial.defaultArticleTone || "profissional",
      themePreset: site.themePreset,
      coverImageStyle: site.coverImageStyle,
      editorialStyleNotes: site.editorial.editorialStyleNotes,
      imageDirection: article.excerpt?.slice(0, 200) || null
    });
    if (!coverUrl) {
      coverUrl = `https://picsum.photos/1200/600?seed=${slugSeed(article.title)}`;
    }
  }

  const postId = await addPost(hostname, {
    title: article.title,
    category: article.category || "Campo",
    image: coverUrl,
    excerpt: article.excerpt,
    content: article.content,
    videoUrl: video.value,
    publishedAt: new Date().toISOString(),
    initialStatus: "IN_REVIEW"
  });

  if (!postId) {
    return { ok: false, error: "Falha ao criar o post." };
  }

  await logGenerationJob({
    hostname,
    keyword: article.title.slice(0, 120),
    tone: site.editorial.defaultArticleTone || "profissional",
    status: "done",
    resultTitle: article.title,
    resultImage: coverUrl
  });

  return { ok: true, postId };
}
