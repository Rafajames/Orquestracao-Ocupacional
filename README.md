# Orquestração Ocupacional

Plataforma web para pacientes, responsáveis e profissionais registrarem atividades e rotina; o terapeuta ocupacional recebe tabelas, gráficos, indicadores e relatório descritivo (PDF), e pode comparar avaliações do mesmo paciente.

> Organiza **informações relatadas**. Não emite diagnóstico, classificação clínica nem recomendação terapêutica.
> A metodologia vem da documentação v1 (`docs/original/`), preservada sem alterações.

## Estado desta versão (v0.1)
| Área | Situação |
|------|----------|
| Catálogo original (100 atividades, numeração 94 duplicada e lacuna 95 preservadas) + atividades personalizadas, áreas/subáreas, modelos | ✅ |
| Avaliação com período livre (1–62 dias), formatos por atividade / rotina por dia / ambos (mesmos registros, sem duplicar), campos configuráveis | ✅ |
| Respondentes: paciente, responsável, profissional, paciente+responsável; fonte da informação registrada | ✅ |
| Link individual sem conta: só hash guardado, validade obrigatória, revogação imediata, rascunho e retomada | ✅ |
| Painel (indicadores, gráficos, tabelas, alertas), relatório com texto automático neutro + considerações editáveis + PDF (impressão) | ✅ |
| Comparação (somente em comum / ampliada), sem tratar ausência como zero | ✅ |
| Auditoria de eventos (sem conteúdo clínico) | ✅ |
| Banco PostgreSQL/Supabase com RLS e funções do portal, **testado** com PostgreSQL embarcado | ✅ (`db/`) |
| Aplicação conectada ao Supabase | ⏳ pendência **P-01** (credenciais) — hoje roda em **modo local** (dados só no navegador) |

**Não use com pacientes reais.** Pendências clínicas, jurídicas e de infraestrutura: [`docs/pendencias.md`](docs/pendencias.md). Decisões e contradições encontradas na documentação: [`docs/decisoes/README.md`](docs/decisoes/README.md).

## Executar
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 54 testes: cálculos, regras, portal local e segurança do banco (RLS)
npm run build
```
Teste de ponta a ponta no navegador (opcional, precisa de Python + Playwright + Chrome): `python3 tests/e2e/run.py` com a build servida em `localhost:4173`.

## Estrutura
```
docs/original/     documentação v1 (ZIP) intacta + pedido de execução
docs/decisoes/     decisões (ADRs) e contradições; docs/pendencias.md
db/migrations/     001 schema revisado · 002 RLS, triggers, funções do portal
db/seed/           catálogo original (gerado por scripts/gen-seed.mjs)
src/domain/        regras puras: cálculos, validação, comparação, texto descritivo
src/data/store.ts  modo local + contrato do portal (espelha as funções SQL)
src/pages, src/components   interface
tests/             vitest (domínio, portal local, banco) e e2e
```

## Próximo passo técnico (P-01)
Criar o projeto Supabase, aplicar `db/migrations/*.sql` e `db/seed/*.sql`, e implementar o adaptador que troca `src/data/store.ts` por chamadas ao Supabase (`portal_open`, `portal_start_session`, `portal_save_records`, `portal_submit`, `create_assessment_link`, `pro_save_records`). O contrato e os testes de segurança já existem.
