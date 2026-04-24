import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

function redactDatabaseUrl(url) {
  if (!url) return "(DATABASE_URL ausente)";
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = "***";
    return parsed.toString();
  } catch {
    return "(DATABASE_URL invalida)";
  }
}

async function main() {
  console.log("=== DB CHECK ===");
  console.log("DATABASE_URL (mascarada):", redactDatabaseUrl(process.env.DATABASE_URL));

  const [tenantCount, postCount, affiliateCount, pitchCount, jobCount, recentTenants, recentPosts] = await Promise.all([
    prisma.tenant.count(),
    prisma.post.count(),
    prisma.affiliateProduct.count(),
    prisma.articlePitch.count(),
    prisma.generationJob.count(),
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { hostname: true, brandName: true, createdAt: true }
    }),
    prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { title: true, slug: true, status: true, createdAt: true }
    })
  ]);

  console.log("\nContagens:");
  console.log("- Tenant:", tenantCount);
  console.log("- Post:", postCount);
  console.log("- AffiliateProduct:", affiliateCount);
  console.log("- ArticlePitch:", pitchCount);
  console.log("- GenerationJob:", jobCount);

  console.log("\nTenants recentes:");
  for (const row of recentTenants) {
    console.log(`- ${row.hostname} | ${row.brandName} | ${row.createdAt.toISOString()}`);
  }

  console.log("\nPosts recentes:");
  for (const row of recentPosts) {
    console.log(`- ${row.title} | ${row.slug} | ${row.status} | ${row.createdAt.toISOString()}`);
  }
}

main()
  .catch((error) => {
    console.error("\nFalha no check de banco:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
