import { createHash } from "node:crypto";
import { prisma } from "./db";

export type CommentStatus = "PUBLISHED" | "AUTO_HIDDEN" | "HIDDEN" | "DELETED";

export type CommentAdminRow = {
  id: string;
  tenantHostname: string;
  postId: string;
  postTitle: string;
  postSlug: string;
  authorName: string;
  authorEmail: string | null;
  content: string;
  status: CommentStatus;
  source: string;
  isFlagged: boolean;
  flagReason: string | null;
  createdAt: string;
};

const BANNED_TERMS = [
  "viagra",
  "cassino",
  "aposta",
  "bitcoin garantido",
  "ganhe dinheiro rapido",
  "adulto"
];

const DEFAULT_COMMENTS_ENABLED_HOSTS = new Set(["historei.00"]);

export function commentsEnabledForHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  const fromEnvRaw = import.meta.env.COMMENTS_ENABLED_HOSTS?.trim() ?? "";
  if (fromEnvRaw) {
    const fromEnv = new Set(
      fromEnvRaw
        .split(",")
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
    );
    return fromEnv.has(normalized);
  }
  return DEFAULT_COMMENTS_ENABLED_HOSTS.has(normalized);
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

function detectSuspiciousReason(content: string, honeypot: string): string | null {
  if (honeypot.trim()) return "honeypot";

  const lower = content.toLowerCase();
  if (BANNED_TERMS.some((term) => lower.includes(term))) return "blacklist";

  const linkMatches = content.match(/(?:https?:\/\/|www\.)/gi)?.length ?? 0;
  if (linkMatches >= 2) return "many_links";

  return null;
}

export async function createCommentFromPublic(input: {
  hostname: string;
  slug: string;
  authorName: string;
  authorEmail?: string | null;
  content: string;
  consentGiven: boolean;
  honeypot?: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const hostname = input.hostname.trim().toLowerCase();
  const slug = input.slug.trim().toLowerCase();
  const authorName = normalizeText(input.authorName);
  const authorEmail = normalizeText(input.authorEmail ?? "");
  const content = normalizeText(input.content);
  const honeypot = input.honeypot ?? "";

  if (!input.consentGiven) {
    throw new Error("Consentimento LGPD obrigatório.");
  }
  if (authorName.length < 2 || authorName.length > 80) {
    throw new Error("Nome inválido.");
  }
  if (content.length < 8 || content.length > 1200) {
    throw new Error("Comentário deve ter entre 8 e 1200 caracteres.");
  }

  const post = await prisma.post.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      tenant: { hostname }
    },
    include: { tenant: true }
  });
  if (!post) throw new Error("Post não encontrado.");

  const suspiciousReason = detectSuspiciousReason(content, honeypot);
  const ipRaw = input.ip?.trim() ?? "";
  const ipHash = ipRaw ? hashIp(ipRaw) : null;
  const recentWindow = new Date(Date.now() - 3 * 60 * 1000);

  let isFlood = false;
  if (ipHash) {
    const recentCount = await prisma.comment.count({
      where: {
        tenantId: post.tenantId,
        ipHash,
        createdAt: { gte: recentWindow }
      }
    });
    isFlood = recentCount >= 3;
  }

  const flagged = Boolean(suspiciousReason) || isFlood;
  const flagReason = suspiciousReason ?? (isFlood ? "rate_limit" : null);
  const status: CommentStatus = flagged ? "AUTO_HIDDEN" : "PUBLISHED";

  const created = await prisma.comment.create({
    data: {
      tenantId: post.tenantId,
      postId: post.id,
      authorName,
      authorEmail: authorEmail || null,
      content,
      consentGiven: input.consentGiven,
      ipHash,
      userAgent: input.userAgent?.slice(0, 250) ?? null,
      status,
      source: "PUBLIC_FORM",
      isFlagged: flagged,
      flagReason
    }
  });

  return {
    id: created.id,
    status: created.status as CommentStatus,
    published: created.status === "PUBLISHED"
  };
}

export async function listCommentsForAdmin(input: {
  hostname?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const hostname = input.hostname?.trim().toLowerCase();
  const status = input.status?.trim().toUpperCase();
  const search = input.search?.trim();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, input.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where = {
    ...(hostname ? { tenant: { hostname } } : {}),
    ...(status && status !== "ALL" ? { status } : {}),
    ...(search
      ? {
          OR: [
            { authorName: { contains: search, mode: "insensitive" as const } },
            { content: { contains: search, mode: "insensitive" as const } },
            { post: { title: { contains: search, mode: "insensitive" as const } } }
          ]
        }
      : {})
  };

  const [rows, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      include: {
        tenant: { select: { hostname: true } },
        post: { select: { id: true, title: true, slug: true } }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize
    }),
    prisma.comment.count({ where })
  ]);

  return {
    total,
    items: rows.map(
      (row): CommentAdminRow => ({
        id: row.id,
        tenantHostname: row.tenant.hostname,
        postId: row.post.id,
        postTitle: row.post.title,
        postSlug: row.post.slug,
        authorName: row.authorName,
        authorEmail: row.authorEmail,
        content: row.content,
        status: row.status as CommentStatus,
        source: row.source,
        isFlagged: row.isFlagged,
        flagReason: row.flagReason,
        createdAt: row.createdAt.toISOString()
      })
    )
  };
}

export async function listPublishedCommentsForPost(hostname: string, slug: string) {
  const host = hostname.trim().toLowerCase();
  const postSlug = slug.trim().toLowerCase();
  if (!host || !postSlug) return [];

  const rows = await prisma.comment.findMany({
    where: {
      status: "PUBLISHED",
      post: {
        slug: postSlug,
        tenant: { hostname: host }
      }
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      authorName: true,
      content: true,
      createdAt: true
    }
  });

  return rows.map((row) => ({
    id: row.id,
    authorName: row.authorName,
    content: row.content,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function updateCommentStatus(input: { id: string; status: CommentStatus }) {
  await prisma.comment.update({
    where: { id: input.id },
    data: { status: input.status }
  });
}

export async function listCommentTenants() {
  return prisma.tenant.findMany({
    select: { hostname: true, brandName: true },
    orderBy: { hostname: "asc" }
  });
}
