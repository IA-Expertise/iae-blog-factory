import type { APIRoute } from "astro";
import { canAccessCampo, getCampoTenantScope } from "../../../lib/adminAuth";
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
  if (!canAccessCampo(cookies)) {
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

  const scope = getCampoTenantScope(cookies);
  let hostname = String(form.get("hostname") ?? "").trim();
  if (scope) {
    hostname = scope;
  }

  const textNotes = String(form.get("textNotes") ?? "");
  const coverMode = String(form.get("coverMode") ?? "photo").trim().toLowerCase();
  const photo = await fileToBuffer(form.get("photo"));
  const audio = await fileToBuffer(form.get("audio"));

  if (coverMode !== "ai" && !photo) {
    return new Response(JSON.stringify({ ok: false, error: "Envie uma foto de capa." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const result = await ingestCampoSubmission({
    hostname,
    coverMode,
    photoBuffer: photo?.buffer ?? null,
    photoContentType: photo?.contentType ?? null,
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
