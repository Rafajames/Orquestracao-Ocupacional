# 04 — Plano de implementação e testes

## 1. Ordem de desenvolvimento
### Sprint 0 — Preparação
- Criar repositório independente.
- Configurar TypeScript, lint, testes e ambientes.
- Revisar catálogo JSON com profissional.
- Aprovar dicionário de dados e regras clínicas.

### Sprint 1 — Base e acesso profissional
- Criar projeto Supabase.
- Aplicar migrações iniciais em ambiente de desenvolvimento.
- Implementar autenticação profissional.
- Implementar organização e permissões.
- Criar cadastro de pacientes.

### Sprint 2 — Catálogo e modelos
- Importar catálogo original.
- Implementar atividades personalizadas.
- Implementar modelos de avaliação.
- Configurar campos, formatos e períodos.
- Preservar snapshot de catálogo/modelo na avaliação.

### Sprint 3 — Link e formulário
- Gerar tokens seguros.
- Criar portal de respondente sem login.
- Implementar formatos por atividade e rotina semanal.
- Implementar respondente paciente/responsável/profissional.
- Implementar rascunho e retomada.
- Implementar revisão e submissão.

### Sprint 4 — Cálculos e painel
- Implementar cálculos em funções testáveis.
- Criar visão geral e detalhe da avaliação.
- Implementar gráficos e tabelas.
- Exibir denominadores, dados ausentes e alertas.

### Sprint 5 — Relatórios e comparação
- Criar relatório visual e descritivo.
- Permitir considerações profissionais.
- Comparar avaliações do mesmo paciente.
- Mostrar itens comuns e exclusivos.
- Exportar PDF.

### Sprint 6 — Segurança e validação
- Revisar RLS.
- Testar expiração/revogação de links.
- Testar tentativas indevidas.
- Testar dados de crianças e identificação do respondente.
- Validar cálculos com casos de referência.
- Fazer homologação com profissionais.
- Preparar política de privacidade e operação.

## 2. Critérios de aceite
- Profissional autenticado cria paciente e avaliação.
- Configuração do período é respeitada.
- Formulário por atividade e semanal salvam na mesma estrutura normalizada.
- O mesmo registro não é contado duas vezes.
- Paciente/responsável acessa apenas a avaliação vinculada ao token.
- Token expirado/revogado não permite acesso.
- Profissional pode registrar resposta durante entrevista.
- Identidade do respondente e fonte da informação ficam registradas.
- Campos desabilitados não aparecem como dados faltantes.
- Dados ausentes não são convertidos em zero.
- Cálculos exibem unidades e denominadores.
- Relatório PDF identifica período, respondente e limitações.
- Comparação não trata atividade ausente como zero.
- Mudanças de catálogo não alteram avaliações antigas.
- Nenhuma chave privilegiada aparece no frontend.

## 3. Casos de teste de cálculo
1. Duração 15 min × 2 ocorrências = 30 min no total.
2. Duração informada sem quantidade: não calcular total acumulado sem regra definida.
3. Frequência 3 vezes por semana deve continuar identificada como semanal.
4. `not_performed` não deve ser somado como zero sem exibir o estado.
5. `not_answered` não deve ser confundido com `not_performed`.
6. Dia com total acima de 1.440 minutos deve gerar alerta.
7. Seleção “sem desconforto” junto com “físico” deve ser bloqueada.
8. Múltiplos desconfortos devem contar como um registro e várias categorias, se essa regra for aprovada.
9. Comparação de duas avaliações com atividades diferentes deve separar itens comuns e exclusivos.
10. Mudança de rótulo do catálogo não deve modificar o snapshot histórico.

## 4. Testes de segurança
- Token aleatório inválido não acessa avaliação.
- Token expirado não acessa avaliação.
- Token revogado perde acesso imediatamente.
- Um profissional não acessa avaliação de outra organização.
- Usuário anônimo não consulta tabelas clínicas diretamente.
- Tentativa de alterar `patient_id` ou `organization_id` no cliente é rejeitada.
- Logs não contêm token em texto puro nem conteúdo clínico.
- Relatório só é acessível a profissional autorizado.

## 5. Homologação clínica
Antes do uso real:
- revisar catálogo e categorias;
- confirmar definições de tempo/frequência;
- confirmar opções de satisfação e desconforto;
- validar linguagem adulta e infantil;
- validar fluxo de responsável;
- aprovar relatórios e indicadores;
- documentar limitações e versão da metodologia.

## 6. Definition of Done
Uma funcionalidade só é considerada concluída quando:
- implementada;
- testada;
- protegida por permissões;
- documentada;
- validada em celular e computador;
- sem alteração indevida em dados históricos;
- aprovada no ambiente de homologação.
