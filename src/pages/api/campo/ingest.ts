import type { APIRoute } from "astro";
import { isAdminAuthenticated } from "../../../lib/adminAuth";
import { ingestCampoSubmission } from "../../../lib/campo/ingest";

export const prerender = false;

async function fileToBuffer(file: FormDataEntryValue | null): Promise<{
  buffer: Buffer;
  contentType: string;
  filename: string;
} | null> {
  if (!file || typeof file === "string") return null;
  const f = file as File;
  if (!f.size) return null;
  const ab = await f.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    contentType: f.type || "application/octet-stream",
    filename: f.name || "upload.bin"
  };
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAdminAuthenticated(cookies)) {
    return new Response(JSON.stringify({ ok: false, error: "Nao autenticado." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Formulario invalido." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const hostname = String(form.get("hostname") ?? "").trim();
  const textNotes = String(form.get("textNotes") ?? "");
  const photo = await fileToBuffer(form.get("photo"));
  const audio = await fileToBuffer(form.get("audio"));

  if (!photo) {
    return new Response(JSON.stringify({ ok: false, error: "Envie uma foto de capa." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const result = await ingestCampoSubmission({
    hostname,
    photoBuffer: photo.buffer,
    photoContentType: photo.contentType,
    audioBuffer: audio?.buffer ?? null,
    audioContentType: audio?.contentType ?? null,
    audioFilename: audio?.filename ?? null,
    textNotes
  });

  if (!result.ok) {
    return new Response(JSON.stringify(result), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ ok: true, postId: result.postId }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
