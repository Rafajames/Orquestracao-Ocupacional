# 02 — Regras de dados, respostas e cálculos

## 1. Princípios
1. Preservar o dado original informado.
2. Guardar valores numéricos normalizados para cálculo.
3. Distinguir ausência de informação de valor zero.
4. Guardar unidade e período de referência.
5. Não somar registros duplicados.
6. Tornar todos os cálculos rastreáveis e reproduzíveis.

## 2. Campos configuráveis
A avaliação poderá habilitar/desabilitar campos conforme a decisão profissional:
- Realiza a atividade? (sim/não/não se aplica/não sabe informar).
- Duração por ocorrência.
- Quantidade de ocorrências.
- Frequência e unidade de frequência.
- Dia/data do registro.
- Satisfação.
- Desconforto (seleção múltipla).
- Observação.
- Horário de início/fim, somente se habilitado no modelo.

A configuração deve declarar campos obrigatórios, opcionais e condicionais. Se um campo estiver desabilitado, não deve ser tratado como resposta ausente.

## 3. Estados de realização
Usar valores distintos:
- `performed`: realizada.
- `not_performed`: não realiza no período.
- `not_applicable`: não se aplica.
- `unknown`: não sabe informar.
- `not_answered`: sem resposta.

Não converter automaticamente nenhum desses estados em zero minuto.

## 4. Tempo
- Armazenar duração em minutos inteiros (ou segundos se a precisão inferior a um minuto for necessária; decisão técnica recomendada: minutos inteiros na primeira versão).
- Guardar também o texto original digitado, se a entrada permitir formatos livres.
- Preferir entrada estruturada: horas + minutos ou minutos.
- Validar valores negativos e limites máximos configurados.
- `total_minutes = duration_minutes * occurrence_count`, quando ambos forem conhecidos.
- Se o respondente informar diretamente o total do dia, armazenar esse tipo de medida e não multiplicar novamente.

## 5. Frequência
A planilha principal apresenta unidades:
- `d`: quantidade de vezes por dia.
- `s`: quantidade de vezes por semana.
- `m`: quantidade de vezes por mês.
- `a`: quantidade de vezes por ano.
- `na`: não realiza.

O sistema deve preservar a unidade selecionada. Não converter automaticamente frequências mensais/anuais em diárias sem declarar uma regra de conversão e sua hipótese. Para a primeira versão, exibir e analisar cada unidade separadamente; conversões poderão ser adicionadas depois, de forma explícita.

## 6. Satisfação e desconforto
### Satisfação
A legenda original usa `s` = satisfeito e `I` = insatisfeito. Na interface, usar rótulos completos, sem depender das letras abreviadas. Se não houver resposta, manter nulo/sem resposta.

### Desconforto
A legenda original usa:
- `f`: físico.
- `m`: mental.
- `s`: sensorial.
- `sd`: sem desconforto.

Na aplicação, permitir múltiplos tipos (físico, mental, sensorial), se essa for a configuração aprovada pelo responsável clínico. `Sem desconforto` deve ser exclusivo e incompatível com qualquer tipo marcado. Não presumir que múltipla seleção foi validada pela metodologia: tratar como ampliação proposta a confirmar antes da implantação clínica.

## 7. Totais e indicadores
### Tempo por atividade
Somar registros de duração total dentro do período, somente quando a medida e a unidade forem comparáveis.

### Tempo por dia
Somar totais das atividades do dia. Não somar registros que sejam duplicatas entre os formatos “por atividade” e “rotina semanal”.

### Tempo por área
Somar os totais das atividades associadas à área, respeitando a versão de classificação usada na avaliação.

### Satisfação
Apresentar contagem e percentual:
- satisfeitas / respostas válidas de satisfação.
- insatisfeitas / respostas válidas de satisfação.
Sempre exibir o denominador e o número de respostas sem preenchimento.

### Desconforto
Apresentar contagens por categoria e total de registros válidos. Se houver múltipla seleção, esclarecer que as categorias podem se sobrepor e que a soma percentual pode ultrapassar 100%.

### Atividades não realizadas
Contar somente `not_performed`. Separar `not_applicable`, `unknown` e `not_answered`.

## 8. Validação de consistência
- Duração não pode ser negativa.
- Quantidade de ocorrências não pode ser negativa.
- Frequência deve ter unidade definida.
- `not_performed` não deve coexistir com duração positiva no mesmo registro, salvo correção explicitamente registrada.
- `not_applicable` não deve receber duração.
- `no_discomfort` não pode coexistir com categorias de desconforto.
- Alertar quando total diário ultrapassar 1.440 minutos, sem apagar nem alterar respostas.
- Alertar sobre sobreposição somente se existirem horários de início/fim.
- Em períodos semanais, não assumir sete dias se o profissional escolheu outro período.
- Não completar dados ausentes com médias ou zeros.

## 9. Comparações
- Comparação direta exige mesma atividade (identificador estável ou mapeamento validado), unidade, definição do campo e período comparável.
- Itens sem correspondência devem aparecer como exclusivos, não como zero.
- Mudanças de rótulo ou categoria devem ser exibidas.
- A comparação entre catálogos diferentes deve incluir nota de limitação.

## 10. Referências das planilhas
### Planilha principal
`Orquestração Ocupacional.xlsx`, aba `Plan1`:
- Linhas iniciais contêm legenda de tempo, frequência, satisfação e desconforto.
- Blocos de dias estão na ordem sexta, sábado, domingo, segunda, terça, quarta e quinta.
- Cada dia tem quatro colunas: tempo, frequência, satisfação e desconforto.
- O catálogo está dividido por áreas e subáreas.
- Há numeração duplicada 94 para “Ir a confraternizações” e “Ir a museus”, e lacuna do número 95. Preservar esse dado como legado; usar IDs técnicos novos.

### Planilha Edivania
`Edivania Orquestração ocupacional.xlsx`:
- `Plan1` contém exemplo de registro semanal de minutos por atividade e resumos por área/dia.
- `Plan2` e `Plan3` mostram recortes de AVD por semana/dias.
- `Plan5` apresenta totais de exemplo por área durante a semana.
- A organização de dias aparece de segunda a domingo.
- A planilha tem fórmulas e referências que devem ser auditadas antes de reproduzir qualquer cálculo.
- Os totais dessa planilha são exemplos, não valores de referência nem regras clínicas.

## 11. Indicadores não disponíveis com os dados atuais
- Linha do tempo de 24 horas: requer horário de início/fim.
- Tendência diária de início/fim: requer registro temporal.
- Taxa de participação ajustada: exige definição formal do denominador.
- Escores globais ou classificação clínica: não definidos nas fontes; não implementar sem validação.
