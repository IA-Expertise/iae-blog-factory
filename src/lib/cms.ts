import { prisma } from "./db";

export type PostStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED";

export type ThemeConfig = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  headingFont: string;
  bodyFont: string;
};

export type AdConfig = {
  provider: "adsense";
  client: string;
  slot: string;
};

export type AffiliateConfig = {
  network: string;
  trackingId: string;
  products: Array<{
    id: string;
    title: string;
    cta: string;
    url: string;
  }>;
};

export type Post = {
  id: string;
  title: string;
  slug?: string;
  category: string;
  publishedAt: string;
  image: string;
  excerpt?: string;
  content?: string;
  status: PostStatus;
  scheduledPublishAt?: string | null;
};

export type SiteData = {
  hostname: string;
  brandName: string;
  niche: string;
  hero: {
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaHref: string;
    image: string;
  };
  theme: ThemeConfig;
  ads: AdConfig;
  affiliate: AffiliateConfig;
  posts: Post[];
};

const FALLBACK_HOSTNAME = "vinil.local";

const DEFAULT_SITES: SiteData[] = [
  {
    hostname: "vinil.local",
    brandName: "Fabrica do Vinil",
    niche: "discos de vinil",
    hero: {
      title: "Colecione Historia em Vinil",
      subtitle: "Guias, achados raros e setups para audio analogico.",
      ctaLabel: "Ver Colecoes",
      ctaHref: "/colecoes",
      image: "https://picsum.photos/1200/600?random=11"
    },
    theme: {
      primary: "#6f4e37",
      secondary: "#d8c3a5",
      accent: "#a98467",
      background: "#f7f1e8",
      surface: "#fffaf3",
      text: "#2d1f14",
      headingFont: "'Merriweather', serif",
      bodyFont: "'Lora', serif"
    },
    ads: {
      provider: "adsense",
      client: "ca-pub-vinil-123456",
      slot: "vinil-sidebar-001"
    },
    affiliate: {
      network: "Amazon",
      trackingId: "vinil-20",
      products: [
        {
          id: "p-vinil-1",
          title: "Vitrola Bluetooth Vintage",
          cta: "Ver Oferta",
          url: "https://example.com/affiliate/vitrola"
        },
        {
          id: "p-vinil-2",
          title: "Kit de Limpeza para LP",
          cta: "Comprar Agora",
          url: "https://example.com/affiliate/limpeza-lp"
        }
      ]
    },
    posts: [
      {
        id: "v1",
        title: "10 Albuns essenciais para iniciar sua colecao",
        category: "Guia",
        publishedAt: "2026-04-21",
        image: "https://picsum.photos/600/400?random=21",
        status: "PUBLISHED"
      }
    ]
  },
  {
    hostname: "govtech.local",
    brandName: "GovTech Insights",
    niche: "gestao publica",
    hero: {
      title: "Tecnologia para uma Gestao Publica Eficiente",
      subtitle: "Estrategias, casos reais e ferramentas para modernizar servicos.",
      ctaLabel: "Explorar Conteudo",
      ctaHref: "/insights",
      image: "https://picsum.photos/1200/600?random=31"
    },
    theme: {
      primary: "#1e3a5f",
      secondary: "#94a3b8",
      accent: "#334155",
      background: "#f1f5f9",
      surface: "#ffffff",
      text: "#0f172a",
      headingFont: "'Inter', sans-serif",
      bodyFont: "'Roboto', sans-serif"
    },
    ads: {
      provider: "adsense",
      client: "ca-pub-govtech-654321",
      slot: "govtech-sidebar-001"
    },
    affiliate: {
      network: "Hotmart",
      trackingId: "govtech-pro",
      products: [
        {
          id: "p-gov-1",
          title: "Curso de Inovacao em Licitacoes",
          cta: "Conhecer Curso",
          url: "https://example.com/affiliate/licitacoes"
        }
      ]
    },
    posts: [
      {
        id: "g1",
        title: "Indicadores que destravam a gestao municipal",
        category: "Gestao",
        publishedAt: "2026-04-20",
        image: "https://picsum.photos/600/400?random=41",
        status: "PUBLISHED"
      }
    ]
  }
];

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().trim().split(":")[0];
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function mapPostRow(post: {
  id: string;
  title: string;
  slug: string;
  category: string;
  image: string;
  excerpt: string | null;
  content: string | null;
  publishedAt: Date;
  status: string;
  scheduledPublishAt: Date | null;
}): Post {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    category: post.category,
    image: post.image,
    excerpt: post.excerpt ?? undefined,
    content: post.content ?? undefined,
    publishedAt: formatDate(post.publishedAt),
    status: post.status as PostStatus,
    scheduledPublishAt: post.scheduledPublishAt?.toISOString() ?? null
  };
}

async function ensureSeedData() {
  const count = await prisma.tenant.count();
  if (count > 0) return;

  for (const site of DEFAULT_SITES) {
    const tenant = await prisma.tenant.create({
      data: {
        hostname: site.hostname,
        brandName: site.brandName,
        niche: site.niche,
        heroTitle: site.hero.title,
        heroSubtitle: site.hero.subtitle,
        heroCtaLabel: site.hero.ctaLabel,
        heroCtaHref: site.hero.ctaHref,
        heroImage: site.hero.image,
        themePrimary: site.theme.primary,
        themeSecondary: site.theme.secondary,
        themeAccent: site.theme.accent,
        themeBackground: site.theme.background,
        themeSurface: site.theme.surface,
        themeText: site.theme.text,
        themeHeadingFont: site.theme.headingFont,
        themeBodyFont: site.theme.bodyFont,
        adProvider: site.ads.provider,
        adClient: site.ads.client,
        adSlot: site.ads.slot,
        affiliateNetwork: site.affiliate.network,
        affiliateTrackingId: site.affiliate.trackingId
      }
    });

    for (const product of site.affiliate.products) {
      await prisma.affiliateProduct.create({
        data: {
          tenantId: tenant.id,
          title: product.title,
          cta: product.cta,
          url: product.url
        }
      });
    }

    for (const post of site.posts) {
      await prisma.post.create({
        data: {
          tenantId: tenant.id,
          title: post.title,
          slug: slugify(post.title),
          category: post.category,
          image: post.image,
          publishedAt: new Date(post.publishedAt),
          status: "PUBLISHED",
          scheduledPublishAt: null
        }
      });
    }
  }
}

function mapTenantToSiteData(
  tenant: Awaited<ReturnType<typeof prisma.tenant.findFirstOrThrow>> & {
    posts: Awaited<ReturnType<typeof prisma.post.findMany>>;
    affiliateProducts: Awaited<ReturnType<typeof prisma.affiliateProduct.findMany>>;
  }
): SiteData {
  return {
    hostname: tenant.hostname,
    brandName: tenant.brandName,
    niche: tenant.niche,
    hero: {
      title: tenant.heroTitle,
      subtitle: tenant.heroSubtitle,
      ctaLabel: tenant.heroCtaLabel,
      ctaHref: tenant.heroCtaHref,
      image: tenant.heroImage
    },
    theme: {
      primary: tenant.themePrimary,
      secondary: tenant.themeSecondary,
      accent: tenant.themeAccent,
      background: tenant.themeBackground,
      surface: tenant.themeSurface,
      text: tenant.themeText,
      headingFont: tenant.themeHeadingFont,
      bodyFont: tenant.themeBodyFont
    },
    ads: {
      provider: "adsense",
      client: tenant.adClient,
      slot: tenant.adSlot
    },
    affiliate: {
      network: tenant.affiliateNetwork,
      trackingId: tenant.affiliateTrackingId,
      products: tenant.affiliateProducts.map((product) => ({
        id: product.id,
        title: product.title,
        cta: product.cta,
        url: product.url
      }))
    },
    posts: tenant.posts.map(mapPostRow)
  };
}

async function findTenantByHostname(hostname: string, publishedPostsOnly: boolean) {
  await ensureSeedData();
  return prisma.tenant.findUnique({
    where: { hostname },
    include: {
      posts: {
        where: publishedPostsOnly ? { status: "PUBLISHED" } : undefined,
        orderBy: { publishedAt: "desc" }
      },
      affiliateProducts: true
    }
  });
}

export async function listSites(): Promise<SiteData[]> {
  await ensureSeedData();
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      posts: { orderBy: { updatedAt: "desc" } },
      affiliateProducts: true
    }
  });
  return tenants.map(mapTenantToSiteData);
}

export async function getSiteDataByHostname(hostname: string): Promise<SiteData> {
  const normalized = normalizeHostname(hostname);
  const tenant =
    (await findTenantByHostname(normalized, true)) ?? (await findTenantByHostname(FALLBACK_HOSTNAME, true));
  if (!tenant) throw new Error("Nenhum tenant encontrado.");
  return mapTenantToSiteData(tenant);
}

export async function createTenant(input: { hostname: string; brandName: string; niche: string }) {
  await ensureSeedData();
  const hostname = normalizeHostname(input.hostname);
  const base = DEFAULT_SITES[0];
  await prisma.tenant.upsert({
    where: { hostname },
    create: {
      hostname,
      brandName: input.brandName,
      niche: input.niche,
      heroTitle: `${input.brandName}: conteudo de autoridade em ${input.niche}`,
      heroSubtitle: `Portal especializado em ${input.niche}.`,
      heroCtaLabel: base.hero.ctaLabel,
      heroCtaHref: "/",
      heroImage: base.hero.image,
      themePrimary: base.theme.primary,
      themeSecondary: base.theme.secondary,
      themeAccent: base.theme.accent,
      themeBackground: base.theme.background,
      themeSurface: base.theme.surface,
      themeText: base.theme.text,
      themeHeadingFont: base.theme.headingFont,
      themeBodyFont: base.theme.bodyFont,
      adProvider: "adsense",
      adClient: "ca-pub-tenant-000000",
      adSlot: "tenant-sidebar-001",
      affiliateNetwork: "Amazon",
      affiliateTrackingId: "tenant-20"
    },
    update: {
      brandName: input.brandName,
      niche: input.niche
    }
  });
}

export async function updateTenant(input: SiteData) {
  await ensureSeedData();
  const hostname = normalizeHostname(input.hostname);
  const existing = await prisma.tenant.findUnique({ where: { hostname } });
  if (!existing) return;

  await prisma.tenant.update({
    where: { hostname },
    data: {
      brandName: input.brandName,
      niche: input.niche,
      heroTitle: input.hero.title,
      heroSubtitle: input.hero.subtitle,
      heroCtaLabel: input.hero.ctaLabel,
      heroCtaHref: input.hero.ctaHref,
      heroImage: input.hero.image,
      themePrimary: input.theme.primary,
      themeSecondary: input.theme.secondary,
      themeAccent: input.theme.accent,
      themeBackground: input.theme.background,
      themeSurface: input.theme.surface,
      themeText: input.theme.text,
      themeHeadingFont: input.theme.headingFont,
      themeBodyFont: input.theme.bodyFont,
      adClient: input.ads.client,
      adSlot: input.ads.slot,
      affiliateNetwork: input.affiliate.network,
      affiliateTrackingId: input.affiliate.trackingId
    }
  });
}

export async function addPost(
  hostname: string,
  input: {
    title: string;
    category: string;
    image: string;
    publishedAt: string;
    excerpt?: string;
    content?: string;
    initialStatus?: PostStatus;
  }
) {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return;

  const status = input.initialStatus ?? "DRAFT";
  const now = new Date();

  await prisma.post.create({
    data: {
      tenantId: tenant.id,
      title: input.title,
      slug: slugify(input.title),
      category: input.category,
      image: input.image,
      excerpt: input.excerpt,
      content: input.content,
      publishedAt: status === "PUBLISHED" ? new Date(input.publishedAt) : now,
      status,
      scheduledPublishAt: null
    }
  });
}

export async function deletePost(hostname: string, postId: string) {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return;

  await prisma.post.deleteMany({
    where: { id: postId, tenantId: tenant.id }
  });
}

export async function logGenerationJob(input: {
  hostname: string;
  keyword: string;
  tone: string;
  status: "pending" | "done" | "error";
  resultTitle?: string;
  resultSlug?: string;
  resultImage?: string;
}) {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(input.hostname) } });
  if (!tenant) return;

  await prisma.generationJob.create({
    data: {
      tenantId: tenant.id,
      keyword: input.keyword,
      tone: input.tone,
      status: input.status,
      resultTitle: input.resultTitle,
      resultSlug: input.resultSlug,
      resultImage: input.resultImage
    }
  });
}

export async function getPostById(postId: string) {
  await ensureSeedData();
  return prisma.post.findUnique({
    where: { id: postId },
    include: { tenant: true }
  });
}

export async function updatePostFields(
  postId: string,
  input: { title?: string; slug?: string; category?: string; image?: string; excerpt?: string; content?: string }
) {
  await ensureSeedData();
  const data: Record<string, string | undefined> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.category !== undefined) data.category = input.category;
  if (input.image !== undefined) data.image = input.image;
  if (input.excerpt !== undefined) data.excerpt = input.excerpt;
  if (input.content !== undefined) data.content = input.content;
  if (Object.keys(data).length === 0) return;
  await prisma.post.update({
    where: { id: postId },
    data
  });
}

export async function setPostStatus(postId: string, status: PostStatus) {
  await ensureSeedData();
  await prisma.post.update({
    where: { id: postId },
    data: { status }
  });
}

export async function publishPostNow(postId: string) {
  await ensureSeedData();
  const now = new Date();
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: "PUBLISHED",
      publishedAt: now,
      scheduledPublishAt: null
    }
  });
}

export async function schedulePostPublication(postId: string, isoDateTime: string) {
  await ensureSeedData();
  const when = new Date(isoDateTime);
  if (Number.isNaN(when.getTime())) throw new Error("Data de agendamento invalida.");

  await prisma.post.update({
    where: { id: postId },
    data: {
      status: "APPROVED",
      scheduledPublishAt: when
    }
  });
}

export async function runScheduledPublishing(): Promise<number> {
  await ensureSeedData();
  const now = new Date();
  const result = await prisma.post.updateMany({
    where: {
      status: "APPROVED",
      scheduledPublishAt: { lte: now, not: null }
    },
    data: {
      status: "PUBLISHED",
      publishedAt: now,
      scheduledPublishAt: null
    }
  });
  return result.count;
}

export type ScheduledPostRow = {
  id: string;
  title: string;
  status: PostStatus;
  scheduledPublishAt: string;
  hostname: string;
  brandName: string;
};

export async function listScheduledPostsForCalendar(): Promise<ScheduledPostRow[]> {
  await ensureSeedData();
  const posts = await prisma.post.findMany({
    where: {
      scheduledPublishAt: { not: null }
    },
    orderBy: { scheduledPublishAt: "asc" },
    include: { tenant: { select: { hostname: true, brandName: true } } }
  });
  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status as PostStatus,
    scheduledPublishAt: p.scheduledPublishAt!.toISOString(),
    hostname: p.tenant.hostname,
    brandName: p.tenant.brandName
  }));
}

export async function addAffiliateProduct(hostname: string, input: { title: string; cta: string; url: string }) {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return;

  await prisma.affiliateProduct.create({
    data: {
      tenantId: tenant.id,
      title: input.title,
      cta: input.cta,
      url: input.url
    }
  });
}

export async function deleteAffiliateProduct(hostname: string, productId: string) {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return;

  await prisma.affiliateProduct.deleteMany({
    where: { id: productId, tenantId: tenant.id }
  });
}
