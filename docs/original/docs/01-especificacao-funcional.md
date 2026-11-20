# 01 — Especificação funcional

## 1. Objetivo
Construir uma aplicação web responsiva para coleta estruturada de informações sobre ocupações e rotina, com visualização profissional por meio de tabelas, gráficos e relatórios. O sistema deverá funcionar inicialmente de forma independente e estar preparado para futura integração ao Potira.

A plataforma organiza informações relatadas; não emite diagnóstico, classificação clínica ou recomendação terapêutica automática.

## 2. Decisões consolidadas
- Catálogo: atividades originais das planilhas + atividades personalizadas.
- Formatos: preenchimento por atividade e por rotina semanal.
- Público: adultos e crianças.
- Respondentes: paciente, responsável e profissional; o profissional pode preencher durante entrevista.
- Acesso do paciente/responsável: link individual, sem necessidade de conta.
- Período: configurado pelo profissional para cada avaliação.
- Campos: configuráveis pelo profissional conforme modelo/avaliação.
- Relatórios: gráficos/tabelas e texto descritivo editável pelo profissional.
- Comparação: entre avaliações do mesmo paciente com atividades em comum e também entre avaliações com atividades diferentes, deixando explícito o que é comparável.
- Integração: futura incorporação ao Potira; não alterar o Potira na primeira etapa.

## 3. Perfis e permissões
### 3.1 Profissional
- Autenticar-se.
- Criar e gerenciar pacientes conforme suas permissões.
- Criar modelos e avaliações.
- Escolher período, formato e campos habilitados.
- Selecionar atividades do catálogo original e personalizadas.
- Gerar, reenviar, revogar e expirar links.
- Consultar respostas, gráficos e relatórios.
- Registrar análise/considerações profissionais.
- Comparar avaliações do mesmo paciente.
- Consultar histórico de alterações.

### 3.2 Paciente
- Acessar avaliação por link válido.
- Responder as perguntas habilitadas.
- Salvar progresso e retornar pelo mesmo link enquanto válido.
- Revisar respostas antes do envio.
- Enviar avaliação e receber confirmação.

### 3.3 Responsável
- Responder em nome da criança ou auxiliar a criança.
- Identificar seu papel na resposta.
- Informar se respondeu sozinho, com a criança ou se a criança respondeu com auxílio.
- Não receber acesso ao painel profissional.

### 3.4 Profissional como respondente
- Registrar respostas durante entrevista ou observação, conforme o protocolo definido.
- Identificar que o respondente foi o profissional.
- Registrar, quando aplicável, a fonte da informação (relato do paciente, relato do responsável, observação profissional).
- O sistema não deve presumir que observação profissional e autorrelato são equivalentes.

## 4. Fluxos principais
### 4.1 Criar avaliação
1. Selecionar paciente ou cadastrar um novo.
2. Definir público/perfil (adulto ou criança).
3. Definir respondente esperado e fonte de informação.
4. Selecionar formato: por atividade, rotina semanal ou ambos.
5. Definir data inicial/final e período de referência.
6. Escolher atividades e campos.
7. Revisar prévia do formulário.
8. Gerar link individual e definir validade.
9. Enviar o link ao paciente/responsável.

### 4.2 Responder avaliação
1. Abrir link.
2. Verificar instruções, identificação mínima e aviso de privacidade.
3. Informar quem está respondendo e relação com o paciente.
4. Preencher as atividades/dias habilitados.
5. Salvar rascunho automaticamente ou por ação explícita.
6. Revisar e enviar.
7. Receber confirmação de envio.

### 4.3 Revisão profissional
1. Visualizar estado da avaliação.
2. Conferir respostas e eventuais alertas de consistência.
3. Solicitar correção ou reabrir com registro de auditoria, se permitido.
4. Registrar considerações profissionais.
5. Gerar relatório.
6. Finalizar avaliação.

## 5. Estados da avaliação
- `draft`: rascunho não enviado.
- `sent`: link emitido.
- `in_progress`: preenchimento iniciado.
- `submitted`: respondente enviou.
- `under_review`: em revisão profissional.
- `finalized`: revisão concluída.
- `expired`: link/avaliação expirou.
- `cancelled`: cancelada pelo profissional.

A expiração do link não deve apagar as respostas. Uma avaliação submetida não pode ser alterada sem criar evento de auditoria.

## 6. Catálogo
- Importar o catálogo original da planilha principal, mantendo o texto original e a localização de origem.
- Cada atividade recebe identificador técnico estável independente do número legado da planilha.
- Preservar número original como metadado, inclusive duplicidades e lacunas.
- Permitir atividades personalizadas por profissional/organização.
- Atividades personalizadas não alteram o catálogo original global.
- Permitir ativar/desativar, categorizar e descrever atividades.
- Alterações futuras no catálogo não modificam avaliações históricas: a avaliação guarda um snapshot dos rótulos e campos usados.

### Áreas e subáreas encontradas nas fontes
- Atividades de vida diária (AVD).
- Atividades instrumentais de vida diária (AIVD).
- Descanso e sono.
- Educação.
- Trabalho.
- Lazer: em casa; em espaços da cidade; em espaços fora da cidade.

O catálogo JSON incluído no pacote transcreve as atividades encontradas na aba `Plan1` da planilha principal. A classificação deve ser revisada pelo responsável clínico antes da publicação.

## 7. Formatos de preenchimento
### 7.1 Por atividade
Cada atividade é apresentada individualmente. Os campos visíveis dependem da configuração da avaliação. Pode haver registros por dia ou pelo período, conforme o modelo.

### 7.2 Rotina semanal
Apresenta os dias do período e permite registrar atividades e duração por dia. Deve aceitar semanas completas ou períodos configurados pelo profissional. Não presumir que toda avaliação será de segunda a domingo.

### 7.3 Uso combinado
Os dois formatos podem ser usados na mesma avaliação, mas não devem gerar duplicidade nos totais. O sistema precisa identificar se um registro é a mesma ocorrência apresentada em duas visualizações ou se são registros independentes. Recomendação: ambos os formatos devem operar sobre a mesma coleção de registros normalizados.

## 8. Relatórios
### 8.1 Relatório visual
- Tempo registrado por dia e período.
- Tempo por área e atividade.
- Frequência, quando coletada.
- Distribuição de satisfação.
- Tipos de desconforto relatados.
- Atividades não realizadas/não aplicáveis/não respondidas.
- Alertas de dados incompletos ou inconsistentes.

### 8.2 Relatório descritivo
- Identificação da avaliação e período.
- Perfil do paciente e respondente.
- Formato utilizado.
- Síntese dos dados registrados.
- Destaques descritivos gerados a partir dos dados.
- Observações do paciente/responsável.
- Considerações do profissional, escritas ou revisadas por ele.
- Limitações e campos não respondidos.

O texto automático deve usar linguagem neutra: “foi registrado”, “o respondente informou”, “houve registro de”. Não inferir causa, diagnóstico, déficit ou prioridade clínica.

## 9. Comparação de avaliações
- Comparar avaliações do mesmo paciente.
- Modo A: somente atividades em comum, com indicação de período, campos e unidades equivalentes.
- Modo B: visão ampliada com atividades diferentes, apresentando itens exclusivos de cada avaliação separadamente.
- Não tratar atividade ausente em uma avaliação como valor zero.
- Mostrar mudanças de catálogo, campos e metodologia entre as avaliações.
- Não comparar percentuais quando denominadores ou critérios forem diferentes sem aviso explícito.

## 10. Fora do escopo da primeira versão
- Diagnóstico automatizado.
- Prescrição ou plano terapêutico automatizado.
- Benchmark entre pacientes.
- Portal público de pacientes com login.
- Integração ativa com o Potira.
- Mapa de 24 horas baseado em horários, até que sejam coletados horários de início/fim.
- Inteligência artificial interpretando clinicamente as respostas.

## 11. Requisitos não funcionais
- Interface responsiva e acessível em celular e computador.
- Linguagem simples no formulário.
- Salvamento seguro de rascunho.
- Segurança por padrão e mínimo privilégio.
- Auditoria de alterações relevantes.
- Exportação PDF.
- Desempenho adequado para formulários longos.
- Backup e política de retenção definidos antes de produção.
