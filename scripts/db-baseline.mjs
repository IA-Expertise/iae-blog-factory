#!/usr/bin/env node
/**
 * Baseline do Prisma (erro P3005: banco já tem schema, mas _prisma_migrations está vazio).
 *
 * Registra cada pasta em prisma/migrations como já aplicada, SEM rodar o SQL delas.
 *
 * Uso (normalmente UMA VEZ em produção, com DATABASE_URL apontando para o Postgres):
 *   npm run db:baseline
 *
 * Depois disso, o Start Command pode usar `prisma migrate deploy` para aplicar só migrations novas.
 *
 * ATENÇÃO: só execute se o estado atual do banco for equivalente ao resultado de TODAS as
 * migrations listadas abaixo. Se alguma tabela/coluna faltar, corrija antes (ou não marque
 * essa migration como aplicada sem rodar o SQL).
 */
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationsDir = join(root, 'prisma', 'migrations');

const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => !name.startsWith('.'))
  .sort();

if (dirs.length === 0) {
  console.error('Nenhuma migration encontrada em prisma/migrations');
  process.exit(1);
}

console.log(`Baseline: marcando ${dirs.length} migration(ões) como já aplicadas:\n`);
for (const name of dirs) {
  console.log(`  - ${name}`);
}
console.log('');

for (const name of dirs) {
  const result = spawnSync(
    'npx',
    ['prisma', 'migrate', 'resolve', '--applied', name],
    {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    },
  );
  if (result.status !== 0) {
    console.error(`\nFalhou ao marcar como aplicada: ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nBaseline concluído.');
