import type { APIRoute } from "astro";
import { clearAllStaffSessions } from "../../lib/adminAuth";

export const GET: APIRoute = async ({ cookies, redirect }) => {
  clearAllStaffSessions(cookies);
  return redirect("/admin/login");
};
