/**
 * db-baseline.mjs
 *
 * Registra as migrations existentes como já aplicadas no histórico do Prisma
 * (_prisma_migrations), sem re-executar nenhum SQL.
 *
 * Use este script UMA VEZ em produção quando o banco já possui o schema mas
 * o histórico de migrations do Prisma está vazio (erro P3005).
 *
 * Uso:
 *   node ./scripts/db-baseline.mjs
 *
 * Após executar este script, `npx prisma migrate deploy` funcionará
 * normalmente, pois todas as migrations estarão marcadas como aplicadas.
 */

import { execSync } from "child_process";

const MIGRATIONS = [
  "20260421182808_init",
  "20260205193000_post_editorial_workflow",
  "20260205203000_generator_pitches",
  "20260206110000_tenant_simplified_config",
  "20260509120000_add_internal_ads",
];

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

console.log("=== Prisma Baseline ===");
console.log(
  "Registrando migrations existentes como aplicadas no histórico do Prisma...\n"
);

for (const migration of MIGRATIONS) {
  try {
    run(`npx prisma migrate resolve --applied "${migration}"`);
    console.log(`✓ ${migration} marcada como aplicada.`);
  } catch (err) {
    // Se a migration já estiver registrada, o Prisma retorna erro — ignoramos.
    console.warn(
      `⚠ Não foi possível marcar "${migration}" (pode já estar registrada): ${err.message}`
    );
  }
}

console.log("\n✅ Baseline concluído.");
console.log(
  'Execute "npx prisma migrate deploy" para aplicar quaisquer migrations pendentes.'
);
