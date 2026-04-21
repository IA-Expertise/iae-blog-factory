import type { APIRoute } from "astro";
import { runScheduledPublishing } from "../../../lib/cms";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  if (secret) {
    const key = new URL(request.url).searchParams.get("key");
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
