# Rollback — pré webapp de campo

Ponto seguro **antes** da Feature “Criar da rua” (`/campo`).

| Item | Valor |
|------|--------|
| Commit | `13721d81c134dd32c48f45cdd0d0de30c02a57af` |
| Short | `13721d8` |
| Mensagem | `feat(tenants): estilo de capa IA (foto, aquarela ou flat)` |
| Tag local | `rollback-pre-campo-webapp` |

## Como voltar

```bash
# Só inspecionar
git show 13721d8

# Voltar o branch master para esse commit (CUIDADO: descarta commits posteriores locais)
git reset --hard 13721d8

# Ou criar branch de emergência sem mexer em master
git switch -c recovery-pre-campo 13721d8
```

Se os commits novos já tiverem sido enviados ao remoto, preferir **revert** em vez de reset forçado no `master` compartilhado:

```bash
git revert --no-edit <commit-do-campo>..HEAD
```

*Criado em 21/07/2026 junto com a Fase 1 do webapp de campo.*
