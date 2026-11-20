# Orquestração Ocupacional — documentação v1.0

Pacote de documentação funcional e técnica para orientar a implementação da plataforma web.

## Conteúdo
- `docs/01-especificacao-funcional.md`: escopo, perfis, fluxos e regras funcionais.
- `docs/02-regras-de-dados-e-calculos.md`: campos, frequência, tempos, validações e indicadores.
- `docs/03-arquitetura-tecnica.md`: arquitetura, segurança, integração futura com Potira e critérios técnicos.
- `docs/04-plano-de-implementacao-e-testes.md`: fases, critérios de aceite e testes.
- `database/schema-inicial.sql`: proposta inicial de banco PostgreSQL/Supabase (requer revisão antes de aplicar).
- `catalogo/catalogo_original.json`: catálogo transcrito da planilha principal, preservando rótulos, numeração e localização de origem.

## Referências utilizadas
1. `Orquestração Ocupacional.xlsx`, aba `Plan1`: lista de ocupações, legenda e organização por dia.
2. `Edivania Orquestração ocupacional.xlsx`, abas `Plan1`, `Plan2`, `Plan3` e `Plan5`: exemplos de distribuição semanal de minutos por atividade e área.

Os dados quantitativos da planilha Edivania não foram copiados para o pacote, pois são registros de exemplo e não devem ser tratados como catálogo ou regra universal.

## Importante
Este pacote é uma especificação para implementação, não um software pronto nem uma validação clínica da metodologia. Antes de uso com pacientes, validar o conteúdo, os cálculos e os textos com o profissional responsável; revisar LGPD, segurança, consentimento e governança dos dados.
