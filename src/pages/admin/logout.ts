import type { APIRoute } from "astro";
import { clearAdminSession } from "../../lib/adminAuth";

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearAdminSession(cookies);
  return redirect("/admin/login");
};
