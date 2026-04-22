import type { APIRoute } from "astro";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SAFE_NAME = /^[a-zA-Z0-9._-]+\.(png|jpg|jpeg|webp)$/i;

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  let raw = params.name ?? "";
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!raw || !SAFE_NAME.test(raw)) {
    return new Response("Not found", { status: 404 });
  }

  const filepath = join(process.cwd(), "public", "generated-images", raw);
  try {
    const buf = await readFile(filepath);
    const ext = raw.split(".").pop()?.toLowerCase() ?? "png";
    const type =
      ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=604800"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
