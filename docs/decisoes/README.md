# Registro de decisões técnicas (ADRs)

Cada decisão segue o formato pedido: **problema → consequência → solução → registro → referência original preservada**.
A documentação original está intacta em `docs/original/`. Nada nela foi editado.

Legenda de situação: ✅ decidido e implementado · ⏳ implementado provisoriamente, depende de validação clínica · 🔒 depende de credenciais/autorização.

---

## ADR-001 — Frequência e "quantidade de ocorrências" usam o mesmo campo no SQL ✅
- **Problema:** `schema-inicial.sql` tem apenas `occurrence_count` + `frequency_unit`. O doc 02 §2 lista "Quantidade de ocorrências" e "Frequência e unidade" como campos distintos, e §4 usa `occurrence_count` para calcular o total (`duração × ocorrências`).
- **Consequência:** se "3 vezes por semana" fosse gravado em `occurrence_count`, o sistema calcularia `duração × 3` como se fosse o total do registro, misturando frequência habitual com ocorrências.
- **Solução:** dois conceitos separados: `occurrence_count` (ocorrências *dentro do registro*, usado no total) e `frequency_value` + `frequency_unit` (frequência habitual, nunca multiplicada). Coluna `frequency_value` adicionada na migração.
- **Original:** doc 02 §2, §4, §5; SQL `activity_records`.

## ADR-002 — Unidade `na` ("não realiza") na frequência ✅
- **Problema:** a legenda da planilha tem `na` como unidade de frequência; o SQL só aceita `day/week/month/year`.
- **Consequência:** sem tratamento, `na` se perderia ou viraria frequência zero.
- **Solução:** `na` é mapeado para `record_status = not_performed` (estado de realização), não para unidade. O formulário mostra "não realiza" como estado.
- **Original:** doc 02 §3 e §5.

## ADR-003 — "Sem desconforto": `none` vs `no_discomfort` e exclusividade ✅ / múltipla seleção ⏳
- **Problema:** o doc 02 §8 fala em `no_discomfort`; o SQL usa `none`. O SQL não impede `none` junto com outro tipo.
- **Consequência:** inconsistência de nomes; o banco aceitaria "sem desconforto + físico" (caso de teste 7).
- **Solução:** valor canônico `none` (rótulo "Sem desconforto"). A exclusividade é validada na aplicação **e** por trigger no banco (`trg_discomfort_exclusive`).
- **Múltipla seleção:** o doc 02 §6 diz que a múltipla seleção é *ampliação proposta a confirmar*. Ela está implementada, mas **desligada por padrão** (`discomfortMultiple: false`). O profissional pode ligá-la por avaliação, e o relatório avisa quando as categorias se sobrepõem. ⏳
- **Original:** doc 02 §6, §8; SQL `discomfort_selections`.

## ADR-004 — Formatos combinados sem duplicidade ✅
- **Problema:** doc 01 §7.3 exige que os dois formatos não gerem totais duplicados.
- **Solução:** uma única coleção normalizada de registros, com chave única `(sessão, atividade, data)`. "Por atividade" e "Rotina semanal" são **duas visões dos mesmos registros**: editar um dia em uma visão altera o mesmo registro na outra. O registro de período (`record_date = null`) é distinto dos registros diários.
- **Regra de total:** se uma atividade tem registros diários, o total da atividade é a soma dos diários. Se tem **também** um registro de período com tempo, esse valor **não é somado** e aparece um alerta ("registro de período coexistindo com registros diários"). Se só tem o registro de período, ele é o total. Assim nada é contado duas vezes e nada é descartado em silêncio.
- **Original:** doc 01 §7.3; doc 02 §7; critério de aceite "O mesmo registro não é contado duas vezes".

## ADR-005 — `not_performed` com duração "salvo correção explicitamente registrada" ✅
- **Problema:** doc 02 §8 admite exceção com correção registrada; o SQL proíbe sempre.
- **Solução:** v1 mantém a proibição estrita (mais segura). Uma correção é feita trocando o estado, com evento de auditoria. Uma exceção formal pode ser adicionada depois, se a clínica pedir.

## ADR-006 — Modo de participação do responsável ✅
- **Problema:** doc 01 §3.3 pede para registrar se o responsável respondeu sozinho, com a criança, ou se a criança respondeu com auxílio. O SQL não tem campo para isso.
- **Solução:** coluna `guardian_mode` (`guardian_alone`, `guardian_with_child`, `child_with_help`) em `response_sessions`, além de `respondent_name` e `relationship_to_patient`.

## ADR-007 — Observações do respondente e autor anônimo ✅
- **Problema:** `assessment_notes.author_id` é `not null` e referencia profissional, mas `note_type` inclui `respondent_note`, escrita por quem usa o link (anônimo).
- **Solução:** a observação geral do respondente fica em `response_sessions.respondent_notes`; `assessment_notes` serve só para textos profissionais.

## ADR-008 — Subcategorias de área ✅ / classificação ⏳
- **Problema:** o catálogo tem subcategorias (Lazer → Em casa / Em espaços da cidade / Fora da cidade), mas `occupations` só tem `area_id`.
- **Solução:** `occupational_areas.parent_id`, com subáreas como áreas-filhas. O catálogo JSON é importado sem alterar nome, numeração ou linha de origem.
- **⏳** A categorização foi *inferida* pelas seções da planilha (LEIA-ME do catálogo) e precisa de validação profissional.

## ADR-009 — Numeração duplicada (94) e lacuna (95) ✅
Preservadas como metadado `source_number`. A identidade técnica é `stable_key` (`orig-row-NNN`) e o UUID. A interface mostra "nº original 94" nos dois itens, sem renumerar.

## ADR-010 — Quando o total não pode ser calculado ✅
Caso de teste 2: duração sem quantidade de ocorrências → total **não calculado**, e o registro aparece como "tempo informado sem quantidade". Se houver `direct_total_minutes` (total informado diretamente), ele é usado e nunca multiplicado (doc 02 §4).
- Na rotina semanal, o campo padrão é "tempo total no dia" (`direct_total`), porque é a leitura mais natural da coluna "tempo" por dia da planilha. ⏳ Confirmar com a clínica se a coluna "tempo" significa total do dia ou duração por vez.

## ADR-011 — Estado da atividade a partir de vários registros ✅
Para os contadores por atividade: **realizada** se algum registro for `performed`; **não realizada** se todos os registros com resposta forem `not_performed`; caso contrário, prevalece `not_applicable` > `unknown`. Uma atividade sem nenhum registro conta como `not_answered`, a menos que o campo de estado esteja desabilitado (nesse caso não é tratada como ausente — doc 02 §2).

## ADR-012 — Satisfação: denominador ✅
Denominador = registros `performed` com o campo de satisfação habilitado. Os registros sem resposta aparecem separados. O percentual sempre mostra o `n`.

## ADR-013 — Backend: modo local agora, Supabase depois 🔒
- **Problema:** a arquitetura recomenda Supabase, mas criar o projeto exige conta, credenciais e possível custo, que dependem de autorização.
- **Solução:** a aplicação acessa dados por uma interface (`src/data/repository.ts`). A v1 funciona **completa em modo local** (dados no navegador, para demonstração e homologação com dados fictícios). As migrações SQL para Supabase (schema revisado, RLS, funções seguras do portal) estão em `db/migrations` e são **testadas automaticamente** com PostgreSQL embarcado (PGlite).
- **Limitação do modo local:** o link do respondente só funciona no mesmo navegador/dispositivo em que foi gerado. **Não usar com pacientes reais.** O uso real exige o adaptador Supabase (pendência P-01).

## ADR-014 — Exportação PDF ✅
O relatório usa uma folha de impressão dedicada (CSS `@media print`, A4) e "Salvar como PDF" do navegador. Isso não exige biblioteca de terceiros e preserva texto selecionável e acessível. A geração no servidor fica como evolução.

## ADR-015 — Formulários e validação ✅
Validação com **Zod** e regras de domínio puras (`src/domain/validation.ts`), compartilhadas entre o formulário e os testes. Não usei React Hook Form: os formulários são grades dinâmicas e ficam mais simples com estado controlado, uma alternativa que o doc 03 já admite ("ou equivalente").

## ADR-016 — Roteamento por hash ✅
O app usa `HashRouter` para funcionar no GitHub Pages sem configuração de servidor. O token do link fica após `#`, então não vai para logs de servidor HTTP.

## ADR-017 — Ordem dos dias ✅
A planilha principal começa na sexta e a Edivania na segunda. O sistema não assume nenhuma ordem: os dias são **as datas reais** do período configurado (de 1 a 62 dias), mostradas em ordem cronológica com o nome do dia.

## ADR-018 — Pedido de execução truncado 🔒
O arquivo `docs/original/00-pedido-de-execucao-TRUNCADO.txt` chegou cortado em 4 KB (seção 3, "Comparações"). As seções seguintes não foram lidas. Pendência P-07.

## ADR-019 — Um respondente por análise ✅
- **Problema:** uma avaliação pode ter várias sessões de resposta (ex.: paciente pelo link e profissional em entrevista). Somar tudo contaria a mesma atividade/dia duas vezes e misturaria autorrelato com observação (doc 01 §3.4).
- **Solução:** cada sessão é analisada **separadamente**; a tela de avaliação e o relatório têm seletor de sessão (padrão: a última enviada). O banco impõe unicidade por `(sessão, atividade, data)`. Combinar respondentes numa visão única exige regra clínica e fica fora da v1.

## ADR-020 — Link: só hash, validade obrigatória, token gerado no servidor ✅
Token de 256+ bits; só o SHA-256 é guardado; validade obrigatória (máx. 1 ano); revogação imediata; leitura da coluna `token_hash` negada ao cliente. No SQL o token é gerado pela função `create_assessment_link` (3 UUIDs aleatórios concatenados), sem depender de `pgcrypto`.

## ADR-021 — "Expirada" é derivada ✅
Não há tarefa agendada que mude o `status` para `expired`: a validade é verificada no acesso (link expirado → erro) e o painel mostra "sem link ativo". As respostas nunca são apagadas por expiração (doc 01 §5).

## ADR-022 — Acessibilidade ✅
Rótulos acessíveis iguais ao texto visível, alvos de toque ≥ 44 px, foco visível, navegação por teclado, link "ir para o conteúdo", gráficos com descrição textual e tabelas equivalentes. Revisão formal WCAG e teste com leitor de tela ficam para a homologação (P-10).
