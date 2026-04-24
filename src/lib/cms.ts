import { generateArticleFromPitch, generateMonthlyPitches, regenerateCoverImage } from "./contentGenerator";
import { prisma } from "./db";
import { nextPublishSlotsUtc, parseWeekdays } from "./publishSlots";

const ADSENSE_CLIENT_RE = /^ca-pub-\d{10,22}$/i;

/** Cliente gravado no tenant ou, se inválido, `PUBLIC_ADSENSE_CLIENT` (ex.: Railway). */
function effectiveAdsenseClient(dbClient: string | null | undefined): string {
  const fromDb = dbClient?.trim() ?? "";
  if (ADSENSE_CLIENT_RE.test(fromDb)) return fromDb;
  const fromEnv = import.meta.env.PUBLIC_ADSENSE_CLIENT?.trim() ?? "";
  if (ADSENSE_CLIENT_RE.test(fromEnv)) return fromEnv;
  return fromDb;
}

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
  enabled: boolean;
  client: string;
  topSlot: string;
  sidebarSlot: string;
  inContentSlot: string;
  footerSlot: string;
};

export type AffiliateConfig = {
  enabled: boolean;
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

export type TenantEditorialConfig = {
  projectDescription: string | null;
  editorialStyleNotes: string | null;
  targetAudience: string | null;
  defaultArticleTone: string;
  autoPublishWeekdays: string | null;
  autoPublishHourUtc: number | null;
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
  editorial: TenantEditorialConfig;
  logoUrl?: string | null;
  rssFeedUrl?: string | null;
  themePreset?: string;
  social: {
    instagram?: string | null;
    facebook?: string | null;
    youtube?: string | null;
  };
  contact: {
    footerText?: string | null;
    menuText?: string | null;
  };
};

export type PitchStatus = "SUGGESTED" | "APPROVED" | "REJECTED" | "WRITTEN";

export type ArticlePitchRow = {
  id: string;
  monthKey: string;
  title: string;
  summary: string;
  status: PitchStatus;
  postId: string | null;
};

const FALLBACK_HOSTNAME = "vinil.local";

const THEME_PRESETS: Record<string, ThemeConfig> = {
  classic: {
    primary: "#0b4aa2",
    secondary: "#dbe5f4",
    accent: "#c65b3b",
    background: "#f3f4f6",
    surface: "#ffffff",
    text: "#0f172a",
    headingFont: "'Inter', sans-serif",
    bodyFont: "'Inter', sans-serif"
  },
  urban: {
    primary: "#0f172a",
    secondary: "#cbd5e1",
    accent: "#2563eb",
    background: "#f8fafc",
    surface: "#ffffff",
    text: "#111827",
    headingFont: "'Inter', sans-serif",
    bodyFont: "'Inter', sans-serif"
  },
  regional: {
    primary: "#14532d",
    secondary: "#d1fae5",
    accent: "#b45309",
    background: "#f5f7f5",
    surface: "#ffffff",
    text: "#1f2937",
    headingFont: "'Merriweather', serif",
    bodyFont: "'Inter', sans-serif"
  },
  premium: {
    primary: "#6b1d45",
    secondary: "#f5d0fe",
    accent: "#a16207",
    background: "#faf7fb",
    surface: "#ffffff",
    text: "#1f2937",
    headingFont: "'Merriweather', serif",
    bodyFont: "'Inter', sans-serif"
  }
};

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
      enabled: true,
      client: "ca-pub-vinil-123456",
      topSlot: "vinil-top-001",
      sidebarSlot: "vinil-sidebar-001",
      inContentSlot: "vinil-incontent-001",
      footerSlot: "vinil-footer-001"
    },
    affiliate: {
      enabled: true,
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
    ],
    editorial: {
      projectDescription: null,
      editorialStyleNotes: null,
      targetAudience: null,
      defaultArticleTone: "profissional",
      autoPublishWeekdays: null,
      autoPublishHourUtc: null
    },
    logoUrl: null,
    rssFeedUrl: null,
    themePreset: "classic",
    social: { instagram: null, facebook: null, youtube: null },
    contact: { footerText: null, menuText: null }
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
      enabled: true,
      client: "ca-pub-govtech-654321",
      topSlot: "govtech-top-001",
      sidebarSlot: "govtech-sidebar-001",
      inContentSlot: "govtech-incontent-001",
      footerSlot: "govtech-footer-001"
    },
    affiliate: {
      enabled: true,
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
    ],
    editorial: {
      projectDescription: null,
      editorialStyleNotes: null,
      targetAudience: null,
      defaultArticleTone: "profissional",
      autoPublishWeekdays: null,
      autoPublishHourUtc: null
    },
    logoUrl: null,
    rssFeedUrl: null,
    themePreset: "classic",
    social: { instagram: null, facebook: null, youtube: null },
    contact: { footerText: null, menuText: null }
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
        adsEnabled: site.ads.enabled,
        adClient: site.ads.client,
        adTopSlot: site.ads.topSlot,
        adSidebarSlot: site.ads.sidebarSlot,
        adInContentSlot: site.ads.inContentSlot,
        adFooterSlot: site.ads.footerSlot,
        amazonEnabled: true,
        affiliateNetwork: site.affiliate.network,
        affiliateTrackingId: site.affiliate.trackingId,
        logoUrl: site.logoUrl ?? null,
        rssFeedUrl: site.rssFeedUrl ?? null,
        themePreset: site.themePreset ?? "classic",
        projectDescription: site.editorial.projectDescription ?? null,
        editorialStyleNotes: site.editorial.editorialStyleNotes ?? null,
        targetAudience: site.editorial.targetAudience ?? null,
        defaultArticleTone: site.editorial.defaultArticleTone ?? "profissional",
        socialInstagram: site.social.instagram ?? null,
        socialFacebook: site.social.facebook ?? null,
        socialYoutube: site.social.youtube ?? null,
        footerContactText: site.contact.footerText ?? null,
        menuContactText: site.contact.menuText ?? null,
        autoPublishWeekdays: site.editorial.autoPublishWeekdays ?? null,
        autoPublishHourUtc: site.editorial.autoPublishHourUtc ?? null
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
      enabled: tenant.adsEnabled,
      client: effectiveAdsenseClient(tenant.adClient),
      topSlot: tenant.adTopSlot,
      sidebarSlot: tenant.adSidebarSlot,
      inContentSlot: tenant.adInContentSlot,
      footerSlot: tenant.adFooterSlot
    },
    affiliate: {
      enabled: tenant.amazonEnabled,
      network: tenant.affiliateNetwork,
      trackingId: tenant.affiliateTrackingId,
      products: tenant.affiliateProducts.map((product) => ({
        id: product.id,
        title: product.title,
        cta: product.cta,
        url: product.url
      }))
    },
    posts: tenant.posts.map(mapPostRow),
    editorial: {
      projectDescription: tenant.projectDescription ?? null,
      editorialStyleNotes: tenant.editorialStyleNotes ?? null,
      targetAudience: tenant.targetAudience ?? null,
      defaultArticleTone: tenant.defaultArticleTone ?? "profissional",
      autoPublishWeekdays: tenant.autoPublishWeekdays ?? null,
      autoPublishHourUtc: tenant.autoPublishHourUtc ?? null
    },
    logoUrl: tenant.logoUrl ?? null,
    rssFeedUrl: tenant.rssFeedUrl ?? null,
    themePreset: tenant.themePreset ?? "classic",
    social: {
      instagram: tenant.socialInstagram ?? null,
      facebook: tenant.socialFacebook ?? null,
      youtube: tenant.socialYoutube ?? null
    },
    contact: {
      footerText: tenant.footerContactText ?? null,
      menuText: tenant.menuContactText ?? null
    }
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
      adsEnabled: true,
      adClient: "ca-pub-tenant-000000",
      adTopSlot: "tenant-top-001",
      adSidebarSlot: "tenant-sidebar-001",
      adInContentSlot: "tenant-incontent-001",
      adFooterSlot: "tenant-footer-001",
      amazonEnabled: true,
      affiliateNetwork: "Amazon",
      affiliateTrackingId: "tenant-20",
      themePreset: "classic"
    },
    update: {
      brandName: input.brandName,
      niche: input.niche
    }
  });
}

export async function getTenantByHostname(hostname: string): Promise<SiteData | null> {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({
    where: { hostname: normalizeHostname(hostname) },
    include: { posts: { orderBy: { updatedAt: "desc" } }, affiliateProducts: true }
  });
  return tenant ? mapTenantToSiteData(tenant) : null;
}

export async function updateTenantSettings(input: {
  hostname: string;
  brandName: string;
  niche: string;
  logoUrl: string;
  rssFeedUrl: string;
  themePreset: string;
  projectDescription: string;
  editorialStyleNotes: string;
  targetAudience: string;
  defaultArticleTone: string;
  socialInstagram: string;
  socialFacebook: string;
  socialYoutube: string;
  footerContactText: string;
  menuContactText: string;
  autoPublishWeekdays: string;
  autoPublishHourUtc: string;
}) {
  await ensureSeedData();
  const host = normalizeHostname(input.hostname);
  const presetKey = input.themePreset in THEME_PRESETS ? input.themePreset : "classic";
  const preset = THEME_PRESETS[presetKey];

  const hourRaw = input.autoPublishHourUtc.trim();
  let autoHour: number | null = null;
  if (hourRaw !== "") {
    const h = Number.parseInt(hourRaw, 10);
    if (Number.isFinite(h)) autoHour = Math.min(23, Math.max(0, h));
  }

  await prisma.tenant.update({
    where: { hostname: host },
    data: {
      brandName: input.brandName.trim(),
      niche: input.niche.trim(),
      logoUrl: input.logoUrl.trim() || null,
      rssFeedUrl: input.rssFeedUrl.trim() || null,
      themePreset: presetKey,
      themePrimary: preset.primary,
      themeSecondary: preset.secondary,
      themeAccent: preset.accent,
      themeBackground: preset.background,
      themeSurface: preset.surface,
      themeText: preset.text,
      themeHeadingFont: preset.headingFont,
      themeBodyFont: preset.bodyFont,
      projectDescription: input.projectDescription.trim() || null,
      editorialStyleNotes: input.editorialStyleNotes.trim() || null,
      targetAudience: input.targetAudience.trim() || null,
      defaultArticleTone: input.defaultArticleTone.trim() || "profissional",
      socialInstagram: input.socialInstagram.trim() || null,
      socialFacebook: input.socialFacebook.trim() || null,
      socialYoutube: input.socialYoutube.trim() || null,
      footerContactText: input.footerContactText.trim() || null,
      menuContactText: input.menuContactText.trim() || null,
      autoPublishWeekdays: input.autoPublishWeekdays.trim() || null,
      autoPublishHourUtc: autoHour
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
      adsEnabled: input.ads.enabled,
      adClient: input.ads.client,
      adTopSlot: input.ads.topSlot,
      adSidebarSlot: input.ads.sidebarSlot,
      adInContentSlot: input.ads.inContentSlot,
      adFooterSlot: input.ads.footerSlot,
      amazonEnabled: input.affiliate.enabled,
      affiliateNetwork: input.affiliate.network,
      affiliateTrackingId: input.affiliate.trackingId,
      logoUrl: input.logoUrl ?? null,
      rssFeedUrl: input.rssFeedUrl ?? null,
      themePreset: input.themePreset ?? "classic",
      projectDescription: input.editorial.projectDescription ?? null,
      editorialStyleNotes: input.editorial.editorialStyleNotes ?? null,
      targetAudience: input.editorial.targetAudience ?? null,
      defaultArticleTone: input.editorial.defaultArticleTone ?? "profissional",
      socialInstagram: input.social.instagram ?? null,
      socialFacebook: input.social.facebook ?? null,
      socialYoutube: input.social.youtube ?? null,
      footerContactText: input.contact.footerText ?? null,
      menuContactText: input.contact.menuText ?? null,
      autoPublishWeekdays: input.editorial.autoPublishWeekdays ?? null,
      autoPublishHourUtc: input.editorial.autoPublishHourUtc ?? null
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
    scheduledPublishAt?: Date | null;
  }
): Promise<string | null> {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return null;

  const status = input.initialStatus ?? "DRAFT";
  const now = new Date();

  const created = await prisma.post.create({
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
      scheduledPublishAt: input.scheduledPublishAt ?? null
    }
  });
  return created.id;
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

export async function getPublishedPostBySlug(hostname: string, slug: string): Promise<Post | null> {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return null;
  const row = await prisma.post.findFirst({
    where: { tenantId: tenant.id, slug, status: "PUBLISHED" }
  });
  if (!row) return null;
  return mapPostRow(row);
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

export async function regeneratePostCover(postId: string): Promise<string | null> {
  await ensureSeedData();
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { tenant: true }
  });
  if (!post) return null;

  const image = await regenerateCoverImage({
    tenantName: post.tenant.brandName,
    niche: post.tenant.niche,
    headline: post.title,
    tone: post.tenant.defaultArticleTone ?? "profissional"
  });
  if (!image) return null;

  await prisma.post.update({
    where: { id: postId },
    data: { image }
  });
  return image;
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

export async function updateTenantMonetization(input: {
  hostname: string;
  adsEnabled: boolean;
  adClient: string;
  adTopSlot: string;
  adSidebarSlot: string;
  adInContentSlot: string;
  adFooterSlot: string;
  amazonEnabled: boolean;
  affiliateTrackingId: string;
}) {
  await ensureSeedData();
  await prisma.tenant.update({
    where: { hostname: normalizeHostname(input.hostname) },
    data: {
      adsEnabled: input.adsEnabled,
      adClient: input.adClient.trim(),
      adTopSlot: input.adTopSlot.trim(),
      adSidebarSlot: input.adSidebarSlot.trim(),
      adInContentSlot: input.adInContentSlot.trim(),
      adFooterSlot: input.adFooterSlot.trim(),
      amazonEnabled: input.amazonEnabled,
      affiliateTrackingId: input.affiliateTrackingId.trim()
    }
  });
}

export async function updateTenantEditorialBrief(
  hostname: string,
  input: {
    projectDescription: string;
    editorialStyleNotes: string;
    targetAudience: string;
    defaultArticleTone: string;
    autoPublishWeekdays: string;
    autoPublishHourUtc: string;
  }
) {
  await ensureSeedData();
  const host = normalizeHostname(hostname);
  const hourRaw = input.autoPublishHourUtc.trim();
  let autoHour: number | null = null;
  if (hourRaw !== "") {
    const h = Number.parseInt(hourRaw, 10);
    if (Number.isFinite(h)) autoHour = Math.min(23, Math.max(0, h));
  }
  const weekdays = input.autoPublishWeekdays.trim() === "" ? null : input.autoPublishWeekdays.trim();

  await prisma.tenant.update({
    where: { hostname: host },
    data: {
      projectDescription: input.projectDescription.trim() || null,
      editorialStyleNotes: input.editorialStyleNotes.trim() || null,
      targetAudience: input.targetAudience.trim() || null,
      defaultArticleTone: input.defaultArticleTone.trim() || "profissional",
      autoPublishWeekdays: weekdays,
      autoPublishHourUtc: autoHour
    }
  });
}

export async function listPitches(hostname: string, monthKey: string): Promise<ArticlePitchRow[]> {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return [];

  const rows = await prisma.articlePitch.findMany({
    where: { tenantId: tenant.id, monthKey },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((r) => ({
    id: r.id,
    monthKey: r.monthKey,
    title: r.title,
    summary: r.summary,
    status: r.status as PitchStatus,
    postId: r.postId
  }));
}

export async function replaceSuggestedPitches(hostname: string, monthKey: string, pitches: { title: string; summary: string }[]) {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return;

  await prisma.articlePitch.deleteMany({
    where: { tenantId: tenant.id, monthKey, status: "SUGGESTED" }
  });

  for (const p of pitches) {
    await prisma.articlePitch.create({
      data: {
        tenantId: tenant.id,
        monthKey,
        title: p.title,
        summary: p.summary,
        status: "SUGGESTED"
      }
    });
  }
}

export async function setPitchStatus(hostname: string, pitchId: string, status: PitchStatus) {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return;

  const pitch = await prisma.articlePitch.findFirst({
    where: { id: pitchId, tenantId: tenant.id }
  });
  if (!pitch) return;

  await prisma.articlePitch.update({
    where: { id: pitchId },
    data: { status }
  });
}

export async function writeArticlesFromApprovedPitches(hostname: string, monthKey: string): Promise<number> {
  await ensureSeedData();
  const tenant = await prisma.tenant.findUnique({ where: { hostname: normalizeHostname(hostname) } });
  if (!tenant) return 0;

  const approved = await prisma.articlePitch.findMany({
    where: { tenantId: tenant.id, monthKey, status: "APPROVED", postId: null },
    orderBy: { createdAt: "asc" }
  });
  if (!approved.length) return 0;

  const weekdays = parseWeekdays(tenant.autoPublishWeekdays);
  const hourUtc = tenant.autoPublishHourUtc;
  const useAuto = weekdays.length > 0 && hourUtc !== null && Number.isFinite(hourUtc);
  const now = new Date();
  const slots = useAuto ? nextPublishSlotsUtc(now, weekdays, hourUtc as number, approved.length) : [];

  let written = 0;
  for (let i = 0; i < approved.length; i++) {
    const pitch = approved[i];
    const article = await generateArticleFromPitch({
      tenantName: tenant.brandName,
      niche: tenant.niche,
      tone: tenant.defaultArticleTone ?? "profissional",
      brief: tenant.projectDescription ?? "",
      styleNotes: tenant.editorialStyleNotes ?? "",
      pitchTitle: pitch.title,
      pitchSummary: pitch.summary
    });

    const slot = useAuto ? slots[i] : undefined;
    const postId = await addPost(hostname, {
      title: article.title,
      category: article.category,
      image: article.imageUrl,
      excerpt: article.excerpt,
      content: article.content,
      publishedAt: now.toISOString(),
      initialStatus: slot ? "APPROVED" : "DRAFT",
      scheduledPublishAt: slot ?? null
    });

    if (postId) {
      await prisma.articlePitch.update({
        where: { id: pitch.id },
        data: { status: "WRITTEN", postId }
      });
      written += 1;
    }
  }

  return written;
}
