import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[check-tenant] Procurando tenant: louveiranews.com.br\n');

  try {
    // Buscar tenant
    const tenant = await prisma.tenant.findUnique({
      where: { hostname: 'louveiranews.com.br' },
      include: {
        posts: {
          select: {
            id: true,
            title: true,
            createdAt: true,
            status: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!tenant) {
      console.log('❌ Tenant NÃO ENCONTRADO no banco de dados');
      console.log('\nTenants disponíveis:');
      const allTenants = await prisma.tenant.findMany({
        select: { hostname: true, brandName: true, createdAt: true },
      });
      allTenants.forEach((t) => {
        console.log(`  - ${t.hostname} (${t.brandName})`);
      });
      return;
    }

    console.log('✅ Tenant encontrado:\n');
    console.log(`  ID:           ${tenant.id}`);
    console.log(`  Hostname:     ${tenant.hostname}`);
    console.log(`  Nome:         ${tenant.brandName}`);
    console.log(`  Nicho:        ${tenant.niche}`);
    console.log(`  Criado em:    ${tenant.createdAt.toISOString()}`);
    console.log(`  Atualizado em:${tenant.updatedAt.toISOString()}`);
    console.log(`\n  Total de posts (últimos 5): ${tenant.posts.length}`);

    if (tenant.posts.length > 0) {
      console.log('\n  Posts recentes:');
      tenant.posts.forEach((post) => {
        const icon = post.status === 'PUBLISHED' ? '📝' : '🔒';
        console.log(
          `    ${icon} [${post.status}] ${post.title} (${post.createdAt.toLocaleDateString('pt-BR')})`
        );
      });
    } else {
      console.log('\n  ⚠️  Nenhum post encontrado');
    }
  } catch (e) {
    console.error('❌ Erro:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
