import { generateArticleFromPitch, generateMonthlyPitches, generateMonthlyPitchesFromRss } from "./contentGenerator";
import { addPost, logGenerationJob } from "./cms";
import { prisma } from "./db";
import { normalizeTenantHostname } from "./tenantUrls";

export type BatchTenantRow = {
  hostname: string;
  brandName: string;
  postsPerWeek: number;
};

export type BatchTenantResult = {
  hostname: string;
  brandName: string;
  requested: number;
  written: number;
  error?: string;
};

const MAX_POSTS_PER_TENANT = 7;
const MAX_TENANTS_PER_RUN = 5;

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}

function clampPostsPerWeek(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(MAX_POSTS_PER_TENANT, Math.max(1, Math.floor(n)));
}

/** Tenants marcados para lote automático (não publica — só gera rascunhos). */
export async function listAutoBatchTenants(): Promise<BatchTenantRow[]> {
  const rows = await prisma.tenant.findMany({
    where: { autoBatchEnabled: true },
    orderBy: { brandName: "asc" },
    select: { hostname: true, brandName: true, postsPerWeek: true }
  });
  return rows.map((r) => ({
    hostname: r.hostname,
    brandName: r.brandName,
    postsPerWeek: clampPostsPerWeek(r.postsPerWeek)
  }));
}

async function collectPitchIdeas(input: {
  brandName: string;
  niche: string;
  count: number;
  brief: string;
  styleNotes: string;
  tone: string;
  rssFeedUrl: string | null;
  monthKey: string;
}): Promise<Array<{ title: string; summary: string }>> {
  const ideas: Array<{ title: string; summary: string }> = [];
  const rssUrl = input.rssFeedUrl?.trim() ?? "";

  if (rssUrl) {
    const fromRss = await generateMonthlyPitchesFromRss({
      rssFeedUrl: rssUrl,
      count: input.count,
      niche: input.niche
    });
    for (const p of fromRss) {
      ideas.push({ title: p.title, summary: p.summary });
    }
  }

  if (ideas.length < input.count) {
    const aiIdeas = await generateMonthlyPitches({
      tenantName: input.brandName,
      niche: input.niche,
      monthLabel: input.monthKey,
      count: input.count,
      brief: input.brief,
      styleNotes: input.styleNotes,
      tone: input.tone
    });
    const have = new Set(ideas.map((p) => p.title.trim().toLowerCase()));
    for (const p of aiIdeas) {
      if (ideas.length >= input.count) break;
      const k = p.title.trim().toLowerCase();
      if (have.has(k)) continue;
      ideas.push({ title: p.title, summary: p.summary });
      have.add(k);
    }
  }

  return ideas.slice(0, input.count);
}

/**
 * Gera N matérias em IN_REVIEW para um tenant automático.
 * Não publica e não agenda — revisão humana obrigatória.
 */
export async function prepareWeeklyBatchForTenant(hostnameRaw: string): Promise<BatchTenantResult> {
  const hostname = normalizeTenantHostname(hostnameRaw);
  const tenant = await prisma.tenant.findUnique({ where: { hostname } });
  if (!tenant) {
    return { hostname, brandName: hostname, requested: 0, written: 0, error: "Tenant nao encontrado." };
  }
  if (!tenant.autoBatchEnabled) {
    return {
      hostname,
      brandName: tenant.brandName,
      requested: 0,
      written: 0,
      error: "Tenant nao esta marcado como automatico."
    };
  }

  const requested = clampPostsPerWeek(tenant.postsPerWeek);
  const monthKey = currentMonthKey();

  try {
    const ideas = await collectPitchIdeas({
      brandName: tenant.brandName,
      niche: tenant.niche,
      count: requested,
      brief: tenant.projectDescription ?? "",
      styleNotes: `${tenant.editorialStyleNotes ?? ""}\nPublico-alvo: ${tenant.targetAudience ?? ""}`.trim(),
      tone: tenant.defaultArticleTone ?? "profissional",
      rssFeedUrl: tenant.rssFeedUrl,
      monthKey
    });

    if (!ideas.length) {
      return {
        hostname,
        brandName: tenant.brandName,
        requested,
        written: 0,
        error: "Nenhuma pauta gerada (verifique OPENAI_API_KEY / RSS)."
      };
    }

    let written = 0;
    for (const idea of ideas) {
      const article = await generateArticleFromPitch({
        tenantName: tenant.brandName,
        niche: tenant.niche,
        tone: tenant.defaultArticleTone ?? "profissional",
        brief: tenant.projectDescription ?? "",
        styleNotes: tenant.editorialStyleNotes ?? "",
        pitchTitle: idea.title,
        pitchSummary: idea.summary,
        themePreset: tenant.themePreset,
        coverImageStyle: tenant.coverImageStyle
      });

      const postId = await addPost(hostname, {
        title: article.title,
        category: article.category,
        image: article.imageUrl,
        excerpt: article.excerpt,
        content: article.content,
        publishedAt: new Date().toISOString(),
        initialStatus: "IN_REVIEW"
      });

      if (!postId) continue;

      await prisma.articlePitch.create({
        data: {
          tenantId: tenant.id,
          monthKey,
          title: idea.title,
          summary: idea.summary,
          status: "WRITTEN",
          postId
        }
      });

      await logGenerationJob({
        hostname,
        keyword: article.title.slice(0, 120),
        tone: tenant.defaultArticleTone ?? "profissional",
        status: "done",
        resultTitle: article.title,
        resultImage: article.imageUrl
      });

      written += 1;
    }

    return { hostname, brandName: tenant.brandName, requested, written };
  } catch (e) {
    return {
      hostname,
      brandName: tenant.brandName,
      requested,
      written: 0,
      error: e instanceof Error ? e.message : "Falha no lote."
    };
  }
}

/**
 * Processa até MAX_TENANTS_PER_RUN hostnames selecionados (já filtrados na UI).
 * Só gera IN_REVIEW — nunca publica.
 */
export async function prepareWeeklyBatch(hostnames: string[]): Promise<BatchTenantResult[]> {
  const unique = [...new Set(hostnames.map((h) => normalizeTenantHostname(h)).filter(Boolean))];
  const limited = unique.slice(0, MAX_TENANTS_PER_RUN);
  const results: BatchTenantResult[] = [];

  for (const hostname of limited) {
    results.push(await prepareWeeklyBatchForTenant(hostname));
  }

  return results;
}

export { MAX_TENANTS_PER_RUN, MAX_POSTS_PER_TENANT };
