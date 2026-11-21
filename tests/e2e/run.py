import sys, re
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:4173/'
errors = []
def watch(page):
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error',) else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}, locale='pt-BR')
    pg = ctx.new_page(); watch(pg)
    pg.goto(BASE)
    pg.get_by_label('Seu nome (profissional)').fill('Dra. Teste')
    pg.get_by_role('button', name='Entrar').click()
    pg.get_by_role('link', name='Pacientes').click()
    pg.get_by_label('Nome', exact=True).fill('Maria Fictícia')
    pg.get_by_role('button', name='Cadastrar').click()
    expect(pg.get_by_role('heading', name='Maria Fictícia')).to_be_visible()
    pg.get_by_role('link', name='Nova avaliação').click()
    pg.get_by_label('Título da avaliação').fill('Rotina de teste')
    pg.get_by_label('Rotina por dia').check()
    for area in ['AVD', 'Descanso e sono']:
        pg.locator('summary', has_text=re.compile(rf'^{area} —')).click()
        pg.get_by_label('Marcar toda a área').nth(0 if area == 'AVD' else 1).check() if False else None
    # marca toda a área nas duas áreas abertas
    for cb in pg.get_by_label('Marcar toda a área').all():
        if cb.is_visible(): cb.check()
    expect(pg.get_by_role('heading', name=re.compile(r'4\. Atividades \(24 selecionadas\)'))).to_be_visible()
    pg.get_by_role('button', name='Criar avaliação (rascunho)').click()
    expect(pg.get_by_role('heading', name='Rotina de teste')).to_be_visible()
    # link
    pg.get_by_role('tab', name='Links').click()
    pg.get_by_role('button', name='Gerar link').click()
    link = pg.locator('.linkbox').inner_text()
    assert '#/r/' in link, link
    print('link gerado, tamanho do token:', len(link.split('#/r/')[1]))

    # ---- portal (mobile) ----
    mob = ctx.new_page(); watch(mob); mob.set_viewport_size({'width': 390, 'height': 844})
    mob.goto(link)
    expect(mob.get_by_role('heading', name='Rotina de teste')).to_be_visible()
    assert 'Maria' not in mob.content(), 'nome do paciente vazou no portal'
    mob.get_by_label('Seu nome', exact=True).fill('Fulano')
    mob.get_by_role('button', name='Começar').click()
    expect(mob.get_by_text('Li o aviso')).to_be_visible()   # exige aceite
    mob.get_by_label('Li o aviso de privacidade').check()
    mob.get_by_role('button', name='Começar').click()
    expect(mob.get_by_text('atividades respondidas').first).to_be_visible()
    cards = mob.locator('.act')
    c0 = cards.nth(0)
    c0.get_by_label('Realiza', exact=True).check()
    c0.get_by_label('Tempo de cada vez: minutos').fill('20')
    c0.get_by_label('Quantas vezes no período').fill('2')
    expect(c0.get_by_text('Total calculado: 40 min')).to_be_visible()
    c0.get_by_label('Satisfeito(a)', exact=True).check()
    c0.get_by_label('Físico').check()
    # conflito: sem desconforto troca a escolha (radio) — sem erro
    cards.nth(1).get_by_label('Não realiza no período').check()
    mob.screenshot(path='/home/claude/shots/portal-mobile.png')
    # rotina por dia
    mob.get_by_role('tab', name='Rotina por dia').click()
    mob.locator('.daychips button').nth(1).click()
    d0 = mob.locator('.act').nth(2)
    d0.get_by_label('Realizou', exact=True).check()
    d0.get_by_label('Tempo total neste dia: horas').fill('1')
    d0.get_by_label('Tempo total neste dia: minutos').fill('30')
    expect(mob.get_by_text('Salvo automaticamente')).to_be_visible(timeout=5000)
    mob.get_by_role('button', name='Revisar e enviar').click()
    expect(mob.get_by_role('heading', name='Revisar antes de enviar')).to_be_visible()
    mob.screenshot(path='/home/claude/shots/portal-review.png')
    mob.get_by_role('button', name='Enviar respostas').click()
    expect(mob.get_by_role('heading', name='Respostas enviadas ✓')).to_be_visible()
    mob.reload()
    expect(mob.get_by_role('heading', name='Respostas já enviadas')).to_be_visible()

    # ---- painel profissional ----
    pg.reload(); pg.goto(BASE + '#/'); 
    pg.get_by_role('link', name='Rotina de teste').click()
    expect(pg.get_by_text('Tempo total registrado'.lower(), exact=False).first).to_be_visible() if False else None
    expect(pg.locator('.kpi b').first).to_have_text('2 h 10 min')   # 40 min + 90 min
    assert pg.locator('svg.recharts-surface').count() >= 4, pg.locator('svg.recharts-surface').count()
    pg.screenshot(path='/home/claude/shots/dashboard.png', full_page=True)
    pg.get_by_role('tab', name='Atividades').click()
    expect(pg.get_by_role('cell', name='Banho', exact=True)).to_be_visible()
    pg.get_by_role('tab', name='Respondente').click()
    expect(pg.get_by_text('Fonte da informação:')).to_be_visible()
    pg.get_by_role('tab', name='Links').click()
    pg.get_by_role('button', name='Revogar').count()
    pg.get_by_role('link', name='Relatório').click()
    expect(pg.get_by_role('heading', name='Relatório de Orquestração Ocupacional')).to_be_visible()
    pg.locator('#cons').fill('Considerações de teste.')
    pg.get_by_role('button', name='Salvar considerações').click()
    expect(pg.get_by_text('Considerações de teste.').last).to_be_visible()
    pg.pdf(path='/home/claude/shots/relatorio.pdf', format='A4', print_background=True)
    pg.screenshot(path='/home/claude/shots/report.png', full_page=True)
    txt = pg.locator('article.report').inner_text()
    for must in ['Fulano', 'Fonte da informação', 'Limitações', 'não emite diagnóstico']:
        assert must in txt, must
    b.close()

print('ERROS DE CONSOLE:', errors if errors else 'nenhum')
sys.exit(1 if errors else 0)
