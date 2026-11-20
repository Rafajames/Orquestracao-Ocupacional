# 03 — Arquitetura técnica

## 1. Diretriz
Aplicação web independente na primeira versão, com separação clara entre interface, serviços e persistência. Preparar integração futura ao Potira sem acoplar a primeira entrega ao banco ou autenticação do Potira.

## 2. Stack recomendada
- Frontend: React + TypeScript + Vite.
- UI: componentes acessíveis e responsivos.
- Formulários/validação: React Hook Form + Zod (ou equivalente).
- Gráficos: Recharts.
- Backend e banco: Supabase (PostgreSQL, Auth, Storage e Edge Functions quando necessário).
- PDF: geração no servidor ou biblioteca validada, com testes de paginação.
- Hospedagem: Vercel ou outro host estático compatível; GitHub Pages pode hospedar o frontend, mas operações privilegiadas devem ficar em backend seguro.

A stack é uma recomendação técnica, não uma exigência da metodologia.

## 3. Módulos da aplicação
- `auth`: autenticação profissional.
- `patients`: cadastro e vínculo do paciente.
- `catalog`: áreas, subáreas e ocupações.
- `assessment-templates`: modelos e configuração de campos.
- `assessments`: criação, status e período.
- `respondent-portal`: acesso por link e preenchimento.
- `response-engine`: validação e persistência.
- `analytics`: cálculos determinísticos.
- `reports`: PDF e texto descritivo.
- `audit`: histórico de eventos.
- `integration`: futura camada de integração Potira.

## 4. Modelo de dados
Entidades principais:
- organizations
- professionals
- patients
- respondents
- occupational_areas
- occupations
- assessment_templates
- template_occupations
- assessments
- assessment_links
- response_sessions
- activity_records
- discomfort_selections
- assessment_notes
- assessment_reports
- audit_events

O SQL em `database/schema-inicial.sql` é uma base inicial e deve ser revisado antes de executar em produção.

## 5. Multi-organização e isolamento
Mesmo que a primeira instalação tenha um único profissional, projetar para múltiplos profissionais/organizações:
- cada registro clínico deve ter `organization_id`;
- políticas RLS devem validar vínculo e papel;
- profissional só acessa pacientes/avaliações autorizados;
- funções administrativas privilegiadas não devem depender de campos enviados pelo navegador;
- não confiar em `organization_id` ou `professional_id` recebido do cliente sem validação no servidor.

## 6. Links individuais
- Token aleatório criptograficamente seguro, mínimo recomendado 256 bits.
- Armazenar somente hash do token no banco.
- Token vinculado a uma avaliação e permissões específicas.
- Expiração configurável e revogação imediata.
- Limitar tentativas e aplicar rate limiting.
- Não incluir nome, CPF, diagnóstico ou outro dado pessoal na URL.
- Não expor chaves Supabase privilegiadas no frontend.
- Não conceder acesso direto amplo ao banco ao usuário anônimo.
- Ações de leitura/gravação via função segura que valida token, estado e escopo.
- Definir se o link é de uso único ou reutilizável até a submissão; padrão recomendado: reutilizável até envio/expiração, com sessão protegida.

## 7. Segurança e privacidade
- HTTPS obrigatório.
- Supabase RLS em todas as tabelas com dados de paciente.
- Separar dados identificáveis e dados de resposta sempre que viável.
- Princípio do menor privilégio.
- Consentimento/aviso de privacidade apropriado ao contexto, inclusive regras específicas para crianças e responsáveis.
- Política de retenção e exclusão.
- Auditoria de visualização/alteração de registros sensíveis quando aplicável.
- Backup e plano de recuperação.
- Não usar dados reais em ambientes de desenvolvimento.
- Logs sem conteúdo clínico ou tokens.
- Revisão LGPD e avaliação jurídica/privacidade antes de produção.

## 8. Auditoria
Registrar pelo menos:
- criação/alteração/cancelamento de avaliação;
- geração, revogação e expiração de link;
- envio de respostas;
- correção/reabertura;
- alterações em catálogo e modelos;
- geração/edição/finalização de relatório.

Cada evento deve registrar ator, data/hora, entidade, ação e metadados mínimos, sem copiar conteúdo clínico desnecessário para logs.

## 9. Integração futura com Potira
- Manter IDs internos estáveis.
- Não duplicar paciente automaticamente durante integração.
- Prever campo de referência externa (`external_system`, `external_patient_id`) ou tabela de mapeamento.
- Definir contrato de API versionado.
- Autenticação serviço-a-serviço; nunca compartilhar service role key no navegador.
- Importação/exportação com consentimento e trilha de auditoria.
- A integração deverá ser um projeto separado, após validação da aplicação independente.

## 10. Requisitos de disponibilidade e manutenção
- Migrações versionadas.
- Ambientes separados: desenvolvimento, homologação e produção.
- Seeds apenas com dados fictícios.
- Testes automatizados para cálculos, RLS e links.
- Monitoramento de erros sem dados sensíveis.
- Documentação de backup/restore e rotação de segredos.
