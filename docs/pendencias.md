# Pendências (dependem de validação clínica, credenciais ou autorização)

Nada aqui foi "resolvido por suposição". Onde houve implementação provisória, ela está marcada como ⏳ no registro de decisões.

| ID | Pendência | Tipo | Situação na v1 |
|----|-----------|------|----------------|
| P-01 | Criar projeto Supabase (dev/homologação/produção), aplicar `db/migrations` e ligar o adaptador Supabase | 🔒 credenciais/custo | Migrações prontas e testadas com PGlite; app roda em modo local |
| P-02 | Validar categorização do catálogo (áreas e subáreas inferidas da planilha) | ⏳ clínica | Importado como está, marcado "a validar" |
| P-03 | Confirmar se a coluna "tempo" da planilha é total do dia ou duração por vez | ⏳ clínica | Rotina semanal usa "tempo total no dia" (ADR-010) |
| P-04 | Aprovar múltipla seleção de desconforto | ⏳ clínica | Desligada por padrão, configurável (ADR-003) |
| P-05 | Validar linguagem do formulário para crianças e o fluxo do responsável | ⏳ clínica | Textos neutros e simples, a revisar |
| P-06 | Aviso de privacidade/consentimento definitivo, política de retenção, revisão LGPD | 🔒 jurídico | Texto provisório marcado como rascunho |
| P-07 | Restante do pedido de execução (arquivo chegou truncado na seção 3) | 🔒 autor | Seções 1–3 atendidas |
| P-08 | Regras de conversão de frequência (mês/ano → dia) | ⏳ clínica | Sem conversão; cada unidade analisada separadamente (doc 02 §5) |
| P-09 | Exceção formal para `not_performed` com duração ("correção registrada") | ⏳ clínica | Proibido na v1 (ADR-005) |
| P-10 | Homologação com profissionais em celular e computador | ⏳ clínica | — |
| P-11 | Rate limiting real das tentativas de token (depende do backend) | 🔒 infra | Função SQL registra tentativas; limite em Edge Function a configurar |
