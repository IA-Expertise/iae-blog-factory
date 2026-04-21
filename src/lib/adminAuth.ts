import type { AstroCookies } from "astro";

const COOKIE_NAME = "iae_admin_session";

function getExpectedToken() {
  const username = import.meta.env.ADMIN_USER ?? "admin";
  const password = import.meta.env.ADMIN_PASSWORD ?? "admin123";
  return Buffer.from(`${username}:${password}`).toString("base64");
}

export function isAdminAuthenticated(cookies: AstroCookies) {
  return cookies.get(COOKIE_NAME)?.value === getExpectedToken();
}

export function validateAdminLogin(username: string, password: string) {
  const expectedUsername = import.meta.env.ADMIN_USER ?? "admin";
  const expectedPassword = import.meta.env.ADMIN_PASSWORD ?? "admin123";
  return username === expectedUsername && password === expectedPassword;
}

export function setAdminSession(cookies: AstroCookies) {
  cookies.set(COOKIE_NAME, getExpectedToken(), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 10
  });
}

export function clearAdminSession(cookies: AstroCookies) {
  cookies.delete(COOKIE_NAME, { path: "/" });
}
