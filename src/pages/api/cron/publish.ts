import type { APIRoute } from "astro";
import { runScheduledPublishing } from "../../../lib/cms";

export const prerender = false;

function cronSecretFromEnv(): string {
  if (typeof process !== "undefined" && process.env?.CRON_SECRET !== undefined) {
    return process.env.CRON_SECRET;
  }
  return import.meta.env.CRON_SECRET ?? "";
}

export const GET: APIRoute = async ({ request }) => {
  const secret = cronSecretFromEnv().trim();
  if (secret) {
    const key = new URL(request.url).searchParams.get("key")?.trim() ?? "";
    if (key !== secret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const published = await runScheduledPublishing();
  return new Response(JSON.stringify({ ok: true, published }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
