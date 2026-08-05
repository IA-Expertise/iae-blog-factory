import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AstroCookies } from "astro";
import { prisma } from "./db";

const ADMIN_COOKIE = "iae_admin_session";
const EDITOR_COOKIE = "iae_editor_session";

export type EditorSession = {
  role: "editor";
  editorId: string;
  tenantHostname: string;
  username: string;
};

export type StaffSession = { role: "admin" } | EditorSession;

function getExpectedAdminToken() {
  const username = import.meta.env.ADMIN_USER ?? "admin";
  const password = import.meta.env.ADMIN_PASSWORD ?? "admin123";
  return Buffer.from(`${username}:${password}`).toString("base64");
}

function sessionSigningSecret(): string {
  return (
    import.meta.env.CRON_SECRET?.trim() ||
    import.meta.env.ADMIN_PASSWORD ||
    "iae-blog-factory-dev-secret"
  );
}

function signPayload(payload: string): string {
  return createHmac("sha256", sessionSigningSecret()).update(payload).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const next = scryptSync(password, salt, 64);
    const prev = Buffer.from(hash, "hex");
    if (prev.length !== next.length) return false;
    return timingSafeEqual(prev, next);
  } catch {
    return false;
  }
}

export function isAdminAuthenticated(cookies: AstroCookies) {
  return cookies.get(ADMIN_COOKIE)?.value === getExpectedAdminToken();
}

export function getEditorSession(cookies: AstroCookies): EditorSession | null {
  const raw = cookies.get(EDITOR_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parts = decoded.split("|");
    if (parts.length !== 4) return null;
    const [editorId, tenantHostname, username, sig] = parts;
    if (!editorId || !tenantHostname || !username || !sig) return null;
    const payload = `${editorId}|${tenantHostname}|${username}`;
    const expected = signPayload(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { role: "editor", editorId, tenantHostname, username };
  } catch {
    return null;
  }
}

export function isEditorAuthenticated(cookies: AstroCookies) {
  return Boolean(getEditorSession(cookies));
}

/** Admin IAE ou editor de cliente — pode usar Campo. */
export function canAccessCampo(cookies: AstroCookies) {
  return isAdminAuthenticated(cookies) || isEditorAuthenticated(cookies);
}

export function getStaffSession(cookies: AstroCookies): StaffSession | null {
  if (isAdminAuthenticated(cookies)) return { role: "admin" };
  return getEditorSession(cookies);
}

/** Hostname fixo do editor; `null` = admin (todos os tenants). */
export function getCampoTenantScope(cookies: AstroCookies): string | null {
  return getEditorSession(cookies)?.tenantHostname ?? null;
}

export function validateAdminLogin(username: string, password: string) {
  const expectedUsername = import.meta.env.ADMIN_USER ?? "admin";
  const expectedPassword = import.meta.env.ADMIN_PASSWORD ?? "admin123";
  return username === expectedUsername && password === expectedPassword;
}

export async function validateEditorLogin(
  username: string,
  password: string
): Promise<EditorSession | null> {
  const user = username.trim().toLowerCase();
  if (!user || !password) return null;

  const editor = await prisma.tenantEditor.findUnique({
    where: { username: user },
    include: { tenant: { select: { hostname: true, tenantMode: true } } }
  });
  if (!editor || !editor.active) return null;
  if (editor.tenant.tenantMode !== "client") return null;
  if (!verifyPassword(password, editor.passwordHash)) return null;

  return {
    role: "editor",
    editorId: editor.id,
    tenantHostname: editor.tenant.hostname,
    username: editor.username
  };
}

export function setAdminSession(cookies: AstroCookies) {
  clearEditorSession(cookies);
  cookies.set(ADMIN_COOKIE, getExpectedAdminToken(), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 10
  });
}

export function setEditorSession(cookies: AstroCookies, session: Omit<EditorSession, "role">) {
  clearAdminSession(cookies);
  const payload = `${session.editorId}|${session.tenantHostname}|${session.username}`;
  const token = Buffer.from(`${payload}|${signPayload(payload)}`).toString("base64url");
  cookies.set(EDITOR_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 10
  });
}

export function clearAdminSession(cookies: AstroCookies) {
  cookies.delete(ADMIN_COOKIE, { path: "/" });
}

export function clearEditorSession(cookies: AstroCookies) {
  cookies.delete(EDITOR_COOKIE, { path: "/" });
}

export function clearAllStaffSessions(cookies: AstroCookies) {
  clearAdminSession(cookies);
  clearEditorSession(cookies);
}

export function normalizeTenantMode(value: string | null | undefined): "internal" | "client" {
  return (value ?? "").trim().toLowerCase() === "client" ? "client" : "internal";
}
