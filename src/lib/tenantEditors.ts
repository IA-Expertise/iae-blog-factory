import { hashPassword, normalizeTenantMode } from "./adminAuth";
import { prisma } from "./db";

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/\s+/g, "");
}

export async function listTenantEditors(hostname: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { hostname: hostname.trim().toLowerCase() },
    select: { id: true }
  });
  if (!tenant) return [];

  return prisma.tenantEditor.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      active: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function createTenantEditor(input: {
  hostname: string;
  username: string;
  password: string;
}): Promise<{ username: string }> {
  const hostname = input.hostname.trim().toLowerCase();
  const username = normalizeUsername(input.username);
  const password = input.password;

  if (!hostname) throw new Error("Tenant inválido.");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new Error("Usuário inválido. Use 3–40 caracteres: a-z, 0-9, . _ -");
  }
  if (password.length < 6) throw new Error("Senha deve ter pelo menos 6 caracteres.");

  const tenant = await prisma.tenant.findUnique({ where: { hostname } });
  if (!tenant) throw new Error("Tenant não encontrado.");
  if (normalizeTenantMode(tenant.tenantMode) !== "client") {
    throw new Error("Editores só podem ser criados em tenants no modo Cliente.");
  }

  const reserved = (import.meta.env.ADMIN_USER ?? "admin").trim().toLowerCase();
  if (username === reserved) throw new Error("Esse nome de usuário é reservado.");

  try {
    await prisma.tenantEditor.create({
      data: {
        tenantId: tenant.id,
        username,
        passwordHash: hashPassword(password),
        active: true
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint failed")) {
      throw new Error("Já existe um editor com esse usuário.");
    }
    throw error;
  }

  return { username };
}

export async function resetTenantEditorPassword(input: {
  editorId: string;
  hostname: string;
  password: string;
}) {
  if (input.password.length < 6) throw new Error("Senha deve ter pelo menos 6 caracteres.");

  const editor = await prisma.tenantEditor.findFirst({
    where: {
      id: input.editorId,
      tenant: { hostname: input.hostname.trim().toLowerCase() }
    }
  });
  if (!editor) throw new Error("Editor não encontrado.");

  await prisma.tenantEditor.update({
    where: { id: editor.id },
    data: { passwordHash: hashPassword(input.password), active: true }
  });
}

export async function setTenantEditorActive(input: {
  editorId: string;
  hostname: string;
  active: boolean;
}) {
  const editor = await prisma.tenantEditor.findFirst({
    where: {
      id: input.editorId,
      tenant: { hostname: input.hostname.trim().toLowerCase() }
    }
  });
  if (!editor) throw new Error("Editor não encontrado.");

  await prisma.tenantEditor.update({
    where: { id: editor.id },
    data: { active: input.active }
  });
}
