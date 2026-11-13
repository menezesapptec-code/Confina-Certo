/* ===== Simulação de terminação — módulo separado do TIP Control =====
   Só LÊ os animais/lotes (último peso, quantidade). Não altera lote, custo nem cobrança.
   As simulações salvas ficam em  u/{uid}/cfg/op_xxxx  (tipo 'sim'), junto com os dados do módulo operacional. */
(function () {
  'use strict';
  const T = window.TIP;
  if (!T || !T.pontosPeso || !T.pdfNovo) return;
  const { fld, selF, kv, head, esc, brl, fmt, fmtData, hoje, num, impNum, r2, uid, sum, toast, VIEWS, ACT } = T;

  const D = () => { const S = T.S; if (!S.op) S.op = { docs: [] }; if (!S.op.docs) S.op.docs = []; return S.op.docs; };
  const saved = () => D().filter(x => x.t === 'sim').sort((a, b) => (b.upd || '') < (a.upd || '') ? -1 : 1);
  const pn = v => { const n = impNum(v); return isFinite(n) ? n : 0; };

  const faseNova = (nome) => ({ on: true, nome, dias: '', gmd: '', pv: '', kg: '', op: '' });
  const novaSim = () => ({
    id: '', nome: '', modo: 'lote', loteId: '', donos: [], ids: [], n: '', pesoIn: '', pesoAuto: true, rcIni: '', rcMeta: '', compra: '', taxa: '', venda: '', de: '', ate: '', real: '', preco: '', imp: '', san: '',
    fases: [faseNova('Adaptação'), faseNova('Engorda'), faseNova('Terminação')]
  });
  let CUR = novaSim(), FQ = '';

  /* ---------- animais selecionados e peso de entrada ---------- */
  const selAnimais = () => {
    const A = T.S.animais || [];
    if (CUR.modo === 'manual') return [];
    const s = new Set(CUR.ids); return A.filter(a => s.has(a.id));
  };
  const donoDe = a => String(a.dono || '').trim();
  const visiveis = () => (T.S.animais || []).filter(a => (!CUR.loteId || a.loteId === CUR.loteId) && (!(CUR.donos || []).length || CUR.donos.includes(donoDe(a))))
    .sort((a, b) => String(a.brinco).localeCompare(String(b.brinco), 'pt-BR', { numeric: true }));
  const ultimoKg = a => { const p = T.pontosPeso(a); return p.length ? p[p.length - 1].kg : 0; };
  function autoPeso() {
    const L = selAnimais().map(ultimoKg).filter(x => x > 0);
    return L.length ? sum(L, x => x) / L.length : 0;
  }
  function aplicaAuto() {
    if (CUR.modo === 'manual' || !CUR.pesoAuto) return;
    const p = autoPeso(); CUR.pesoIn = p ? fmt(p, 1).replace(/\./g, '') : '';
  }
  /* custo total no período e data da última pesagem de cada animal (lido do TIP) */
  let CC = { key: '', map: new Map() };
  function custos() {
    const key = (CUR.de || '') + '|' + (CUR.ate || '') + '|' + (window.TIPREV || 0);
    if (CC.key !== key) { let map = new Map(); try { if (T.custoAnimais) map = T.custoAnimais(CUR.de || '', CUR.ate || ''); } catch (e) { map = new Map(); } CC = { key, map }; }
    return CC.map;
  }
  const dataPes = a => { const L = (a.pes || []).filter(x => x.d && num(x.kg) > 0).map(x => x.d).sort(); return L.length ? L[L.length - 1] : ''; };
  const ultData = () => { const L = selAnimais().map(dataPes).filter(Boolean).sort(); return L.length ? L[L.length - 1] : ''; };
  const custoMedio = () => { const A = selAnimais(), M = custos(), L = A.map(a => (M.get(a.id) || { tot: 0 }).tot); return L.length ? sum(L, x => x) / L.length : 0; };
  const nAnim = () => CUR.modo === 'manual' ? Math.max(0, Math.round(pn(CUR.n))) : selAnimais().length;
  const compraMedia = () => { const L = selAnimais().map(a => num(a.valor)).filter(x => x > 0); return L.length ? sum(L, x => x) / L.length : 0; };

  /* ---------- cálculo ---------- */
  const effCompra = () => String(CUR.compra).trim() !== '' ? pn(CUR.compra) : (CUR.modo === 'manual' ? 0 : compraMedia());
  const effReal = () => String(CUR.real).trim() !== '' ? pn(CUR.real) : (CUR.modo === 'manual' ? 0 : custoMedio());
  function calc(S, ov) {
    S = S || CUR; ov = ov || {};
    const n = ov.n != null ? ov.n : S === CUR ? nAnim() : (S.nSnap || 0);
    const p0 = ov.p0 != null ? ov.p0 : pn(S.pesoIn), rc0 = pn(S.rcIni) / 100, rc1 = pn(S.rcMeta) / 100;
    let p = p0, dias = 0, custoFases = 0;
    const fs = [];
    S.fases.forEach(f => {
      if (!f.on) return;
      const d = pn(f.dias); if (!(d > 0)) return;
      const gmd = pn(f.gmd), p1 = p + gmd * d, pm = (p + p1) / 2;
      const kgDia = pm * pn(f.pv) / 100, kgTot = kgDia * d;
      const rac = kgTot * pn(f.kg), op = pn(f.op) * d, custo = rac + op;
      fs.push({ nome: f.nome, dias: d, gmd, p0: p, p1, kgDia, kgTot, rac, op, custo, custoDia: custo / d });
      p = p1; dias += d; custoFases += custo;
    });
    const san = pn(S.san), custoProd = custoFases + san;
    const pesoFim = p, gmdP = dias ? (pesoFim - p0) / dias : 0;
    const c0 = p0 * rc0, c1 = pesoFim * rc1, ganhoC = c1 - c0, ganhoCDia = dias ? ganhoC / dias : 0;
    const arrGanha = ganhoC / 15, arrFinal = c1 / 15;
    const custoArrProd = arrGanha > 0 ? custoProd / arrGanha : 0;
    const compra = ov.compra != null ? ov.compra : S === CUR ? effCompra() : pn(S.compra), real = ov.real != null ? ov.real : S === CUR ? effReal() : pn(S.real), taxa = pn(S.taxa), custoTotal = compra + real + taxa + custoProd, custoArrFinal = arrFinal > 0 ? custoTotal / arrFinal : 0;
    const preco = pn(S.preco), receita = arrFinal * preco, imp = receita * pn(S.imp) / 100;
    const resultado = receita - imp - custoTotal;
    return { n, p0, rc0, rc1, fs, dias, custoFases, san, custoProd, pesoFim, gmdP, c0, c1, ganhoC, ganhoCDia, arrGanha, arrFinal, custoArrProd, compra, real, taxa, custoTotal, custoArrFinal, preco, receita, imp, resultado, margem: receita > 0 ? resultado / receita * 100 : 0 };
  }

  /* resultado da conta para cada animal (peso, compra e custo realizado do próprio animal, a não ser que tenham sido digitados) */
  function linhasAnimais() {
    if (CUR.modo === 'manual') return [];
    const M = custos(), digPeso = !CUR.pesoAuto && pn(CUR.pesoIn) > 0;
    return selAnimais().map(a => {
      const p0 = digPeso ? pn(CUR.pesoIn) : ultimoKg(a); if (!(p0 > 0)) return { a };
      const compra = String(CUR.compra).trim() !== '' ? pn(CUR.compra) : num(a.valor), real = String(CUR.real).trim() !== '' ? pn(CUR.real) : (M.get(a.id) || { tot: 0 }).tot;
      return { a, R: calc(CUR, { p0, compra, real, n: 1 }) };
    });
  }
  /* ---------- resultado (cartões) ---------- */
  function resHTML() {
    const R = calc();
    if (!(R.p0 > 0) || !R.fs.length) return '<div class="card empty">Preencha o peso de entrada e ao menos uma fase (dias e GMD) para ver o resultado.</div>';
    const n = R.n || 1, tot = x => (R.n ? ' · ' + brl(x * R.n) + ' no total' : '');
    let h = '<div class="stats">' +
      '<div class="card stat"><div class="l">Peso ao final</div><div class="v">' + fmt(R.pesoFim, 1) + ' <small>kg</small></div><div class="s">+' + fmt(R.pesoFim - R.p0, 1) + ' kg em ' + fmt(R.dias, 0) + ' dias</div></div>' +
      '<div class="card stat"><div class="l">GMD do período</div><div class="v">' + fmt(R.gmdP, 3) + ' <small>kg/dia</small></div></div>' +
      '<div class="card stat"><div class="l">Ganho de carcaça</div><div class="v">' + (R.rc0 > 0 && R.rc1 > 0 ? fmt(R.ganhoC, 1) + ' <small>kg</small>' : '—') + '</div><div class="s">' + (R.rc0 > 0 && R.rc1 > 0 ? fmt(R.ganhoCDia, 3) + ' kg/dia · ' + fmt(R.arrGanha, 2) + ' @' : 'informe os rendimentos') + '</div></div>' +
      '<div class="card stat"><div class="l">Valor da @ produzida</div><div class="v">' + (R.custoArrProd ? brl(R.custoArrProd) : '—') + '</div><div class="s">custo da fase ÷ @ de carcaça ganhas</div></div></div>';
    h += '<div class="card" style="margin-top:12px"><h3>Por fase</h3><div class="scroll"><table><thead><tr><th>Fase</th><th>Dias</th><th>Peso</th><th>Consumo kg/dia</th><th>Ração</th><th>Operac.</th><th>Custo</th></tr></thead><tbody>' +
      R.fs.map(f => '<tr><td>' + esc(f.nome) + '</td><td>' + fmt(f.dias, 0) + '</td><td>' + fmt(f.p0, 0) + ' → ' + fmt(f.p1, 0) + '</td><td>' + fmt(f.kgDia, 2) + '</td><td>' + brl(f.rac) + '</td><td>' + brl(f.op) + '</td><td><b>' + brl(f.custo) + '</b></td></tr>').join('') +
      '</tbody></table></div><p class="note" style="margin:6px 0 0">Valores por cabeça. Consumo = peso médio da fase × % do PV.</p></div>';
    h += '<div class="card" style="margin-top:12px"><h3>Custo e resultado (por cabeça)</h3><div class="kv">' +
      kv('Aquisição', brl(R.compra)) + kv('Custo já realizado', brl(R.real)) + kv('Ração + operacional (fases)', brl(R.custoFases)) + '</div><div class="kv">' + kv('Sanidade (por animal)', brl(R.san)) + kv('Taxas de abate (por animal)', brl(R.taxa)) + kv('Custo total', brl(R.custoTotal)) + '</div><div class="kv">' + kv('Custo por @ final', R.custoArrFinal ? brl(R.custoArrFinal) : '—') + kv('Venda prevista', CUR.venda ? fmtData(CUR.venda) : '—') + kv('@ final', R.arrFinal ? fmt(R.arrFinal, 2) : '—') + '</div><div class="kv">' +
      kv('Receita', R.preco ? brl(R.receita) : '—') + kv('Impostos', R.preco ? brl(R.imp) : '—') + 
      kv('Resultado final', R.preco ? '<span style="color:' + (R.resultado < 0 ? 'var(--red)' : 'var(--green)') + '">' + brl(R.resultado) + '</span>' : '—') + '</div>' +
      (R.preco ? '<p class="note" style="margin:6px 0 0">Margem ' + fmt(R.margem, 1) + '% da receita' + (R.n ? ' · lote de ' + R.n + ' animais: resultado ' + brl(R.resultado * R.n) : '') + '.</p>' : '<p class="note" style="margin:6px 0 0">Informe o preço da @ para ver receita, impostos e resultado.</p>') + '</div>';
    const AL = linhasAnimais();
    if (AL.length) {
      const ok = AL.filter(x => x.R), sem = AL.length - ok.length;
      h += '<div class="card" style="margin-top:12px"><h3>Animais, um a um</h3><div class="scroll"><table><thead><tr><th>Brinco</th><th>Peso ini</th><th>Peso fim</th><th>@ final</th><th>Custo total</th><th>Resultado</th></tr></thead><tbody>' +
        ok.map(x => '<tr><td><b>' + esc(x.a.brinco) + '</b></td><td>' + fmt(x.R.p0, 0) + '</td><td>' + fmt(x.R.pesoFim, 0) + '</td><td>' + fmt(x.R.arrFinal, 2) + '</td><td>' + brl(x.R.custoTotal) + '</td><td>' + (x.R.preco ? '<b style="color:' + (x.R.resultado < 0 ? 'var(--red)' : 'var(--green)') + '">' + brl(x.R.resultado) + '</b>' : '—') + '</td></tr>').join('') +
        '<tr><td><b>Total</b></td><td></td><td></td><td><b>' + fmt(sum(ok, x => x.R.arrFinal), 2) + '</b></td><td><b>' + brl(sum(ok, x => x.R.custoTotal)) + '</b></td><td><b>' + (R.preco ? brl(sum(ok, x => x.R.resultado)) : '—') + '</b></td></tr></tbody></table></div>' +
        '<p class="note" style="margin:6px 0 0">Cada animal usa o próprio último peso, o próprio valor de compra e o próprio custo já realizado (a menos que você tenha digitado um valor único acima).' + (sem ? ' ' + sem + ' animal(is) sem peso ficaram de fora.' : '') + '</p></div>';
    }
    return h;
  }

  /* ---------- tela ---------- */
  function faseHTML(f, i) {
    return '<div class="card" style="margin-top:10px"><label style="display:flex;gap:10px;align-items:center;font-weight:700"><input type="checkbox" id="sm-fon' + i + '" ' + (f.on ? 'checked' : '') + ' style="width:20px;height:20px"> ' + esc(f.nome) + '</label>' +
      '<div class="cfgrow">' + fld('sm-f' + i + '-dias', 'Dias', f.dias) + fld('sm-f' + i + '-gmd', 'GMD (kg/dia)', f.gmd) + '</div>' +
      '<div class="cfgrow">' + fld('sm-f' + i + '-pv', 'Consumo (% do PV)', f.pv) + fld('sm-f' + i + '-kg', 'Custo da ração (R$/kg)', f.kg) + '</div>' +
      fld('sm-f' + i + '-op', 'Custo operacional (R$/cab·dia)', f.op) + '</div>';
  }
  function animaisHTML() {
    const S0 = T.S, A = visiveis(), s = new Set(CUR.ids);
    const lotes = (S0.lotes || []).filter(l => (S0.animais || []).some(a => a.loteId === l.id));
    const donos = [...new Set((S0.animais || []).map(donoDe).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(d => [d, d]);
    let h = selF('sm-lote', 'Lote', lotes.map(l => [l.id, l.nome]), CUR.loteId, 'Todos os lotes') + '<label>Proprietários</label><div style="display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px">' + donos.map(([d]) => '<label style="display:flex;gap:6px;align-items:center;padding:7px 10px;border:1px solid var(--line);border-radius:999px;font-size:13px"><input type="checkbox" class="sm-dk" data-d="' + esc(d) + '" ' + ((CUR.donos || []).includes(d) ? 'checked' : '') + ' style="width:18px;height:18px">' + esc(d) + '</label>').join('') + '</div><p class="note" style="margin:0 0 4px">' + ((CUR.donos || []).length ? 'Filtrando por ' + CUR.donos.length + ' proprietário(s).' : 'Nenhum marcado = todos os proprietários.') + '</p>' +
      '<p class="note" style="margin:0 0 4px">' + A.length + ' animal(is) neste filtro. Marque os que entram na simulação.</p>' +
      '<div style="display:flex;gap:8px;margin:6px 0"><button type="button" class="btn sm sec" data-act="smTodos">Marcar todos do filtro</button><button type="button" class="btn sm line" data-act="smNenhum">Limpar seleção</button></div>' +
      '<input id="sm-q" type="text" placeholder="Buscar brinco" value="' + esc(FQ) + '" style="margin-bottom:6px">';
    h += '<div style="max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:2px 8px" id="sm-lista">' + A.slice(0, 600).map(a => {
      const lt = (T.S.lotes || []).find(l => l.id === a.loteId), uk = ultimoKg(a), dp = dataPes(a), cs = custos().get(a.id);
      return '<label class="smrow" data-s="' + esc(String(a.brinco).toLowerCase()) + '" style="display:flex;gap:10px;align-items:center;padding:8px 2px;border-bottom:1px solid var(--line)"><input type="checkbox" class="sm-ck" data-id="' + a.id + '" ' + (s.has(a.id) ? 'checked' : '') + ' style="width:20px;height:20px"><span style="flex:1"><b>' + esc(a.brinco) + '</b> <span class="note" style="margin:0">' + esc(lt ? lt.nome : 'sem lote') + (donoDe(a) ? ' · ' + esc(donoDe(a)) : '') + '</span></span><span class="note" style="margin:0;text-align:right">' + (uk ? fmt(uk, 0) + ' kg' : '—') + (dp ? ' · ' + fmtData(dp) : '') + '<br>' + (cs ? brl(cs.tot) : '—') + '</span></label>';
    }).join('') + '</div>';
    return h;
  }
  VIEWS.sim = () => {
    const S = T.S, lotes = (S.lotes || []).filter(l => (S.animais || []).some(a => a.loteId === l.id));
    const sv = saved();
    let h = head('Simulação', 'Projete a terminação: pesos, fases, custo, @ produzida e resultado', '<button class="btn sm" data-act="smNova">+ Nova</button>');
    if (sv.length) h += '<div class="card"><h3>Simulações salvas</h3>' + sv.map(x => {
      const R = calc(Object.assign({}, x, { nSnap: x.n2 || 0 }));
      return '<div data-act="smAbrir" data-id="' + x.id + '" style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer"><span><b>' + esc(x.nome || 'Sem nome') + '</b><span class="note" style="display:block;margin:2px 0 0">' + fmtData(x.upd || '') + ' · ' + (R.fs.length ? fmt(R.dias, 0) + ' dias · ' + fmt(R.pesoFim, 0) + ' kg' : 'incompleta') + '</span></span><b style="white-space:nowrap">' + (R.preco && R.fs.length ? brl(R.resultado) + '/cab' : '') + '</b></div>';
    }).join('') + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>' + (CUR.id ? 'Simulação salva' : 'Nova simulação') + '</h3>' + fld('sm-nome', 'Nome', CUR.nome, { txt: 1, ph: 'Ex.: Lote Rem 4 – terminação' }) +
      selF('sm-modo', 'Animais', [['lote', 'Por lote / proprietário (todos ou alguns)'], ['animais', 'Escolher um a um'], ['manual', 'Sem animais (digitar)']], CUR.modo);
    if (CUR.modo === 'manual') h += fld('sm-n', 'Número de animais', CUR.n);
    else h += animaisHTML();
    h += '<p class="note" id="sm-info" style="margin:6px 0 0"></p></div>';
    h += '<div class="card" style="margin-top:12px"><h3>Entrada e carcaça</h3><div class="cfgrow">' + fld('sm-pesoIn', 'Peso de entrada (kg)', CUR.pesoIn) + fld('sm-rcIni', 'Rendimento inicial (%)', CUR.rcIni) + '</div>' +
      '<div class="cfgrow">' + fld('sm-rcMeta', 'Rendimento meta (%)', CUR.rcMeta) + fld('sm-compra', 'Valor de compra (R$/cab)', CUR.compra) + '</div>' + (CUR.modo !== 'manual' ? '<p class="note" style="margin:0 0 6px">Em branco, usa o valor de compra cadastrado em cada animal.</p>' : '') +
      (CUR.modo !== 'manual' ? '<button type="button" class="btn sm line" data-act="smUsaPeso">Usar último peso dos animais</button> <button type="button" class="btn sm line" data-act="smUsaCompra">Usar valor de compra dos animais</button>' : '') + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>Custo já realizado</h3><p class="note" style="margin:0 0 8px">Custo total de cada animal (nutrição, operacional fixo e sanidade) dentro do período. Traga do sistema ou digite o valor por cabeça.</p><div class="cfgrow">' + fld('sm-de', 'De', CUR.de, { type: 'date' }) + fld('sm-ate', 'Até', CUR.ate, { type: 'date' }) + '</div>' +
      (CUR.modo !== 'manual' ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><button type="button" class="btn sm line" data-act="smAteUlt">Até a última pesagem</button></div>' : '') +
      fld('sm-real', 'Custo já realizado (R$/cab)', CUR.real) + (CUR.modo !== 'manual' ? '<p class="note" style="margin:4px 0 0">Em branco, usa o custo calculado de cada animal neste período.</p>' : '') + (CUR.modo !== 'manual' ? '<button type="button" class="btn sm sec" data-act="smUsaCusto" style="margin-top:6px">Trazer custo dos animais</button>' : '') + '</div>';
    h += '<h3 style="margin:14px 2px 0">Fases</h3><p class="note" style="margin:2px 2px 0">Desmarque as fases que não vai usar. Cada fase começa no peso em que a anterior terminou.</p>' + CUR.fases.map(faseHTML).join('');
    h += '<div class="card" style="margin-top:12px"><h3>Outros custos e venda</h3><div class="cfgrow">' + fld('sm-san', 'Sanidade (R$ por animal)', CUR.san) + fld('sm-taxa', 'Taxas para abate (R$ por animal)', CUR.taxa) + '</div><div class="cfgrow">' + fld('sm-preco', 'Preço da @ de venda (R$)', CUR.preco) + fld('sm-imp', 'Impostos (% sobre a receita)', CUR.imp) + '</div>' + fld('sm-venda', 'Previsão de venda (data)', CUR.venda, { type: 'date' }) + '<button type="button" class="btn sm line" data-act="smVenda" style="margin-top:6px">Calcular: hoje + dias das fases</button></div>';
    h += '<div id="sm-res" style="margin-top:12px">' + resHTML() + '</div>';
    h += '<div class="acts" style="margin-top:12px"><button class="btn" data-act="smSalva">Salvar simulação</button><button class="btn sec" data-act="smPdf">Gerar PDF</button></div>' +
      (CUR.id ? '<button type="button" class="btn line block" style="margin-top:8px;color:var(--red)" data-act="smDel" data-id="' + CUR.id + '">Excluir esta simulação</button>' : '');
    return h + '<p class="note">Simulação à parte: não altera lotes, custos nem cobrança. Carcaça = peso × rendimento; @ = carcaça ÷ 15.</p>';
  };
  function info() {
    const el = document.getElementById('sm-info'); if (!el) return;
    const n = nAnim(), cm = compraMedia();
    el.textContent = CUR.modo === 'manual' ? '' : n + ' animal(is) selecionado(s)' + (autoPeso() ? ' · último peso médio ' + fmt(autoPeso(), 1) + ' kg' : '') + (cm ? ' · compra média ' + brl(cm) : '') + (ultData() ? ' · última pesagem em ' + fmtData(ultData()) : '') + (custoMedio() ? ' · custo médio no período ' + brl(custoMedio()) : '');
  }
  const refresh = () => { const r = document.getElementById('sm-res'); if (r) r.innerHTML = resHTML(); info(); };
  const redraw = () => { T.render(false); setTimeout(info, 0); };

  /* ---------- eventos ---------- */
  const TOP = ['nome', 'n', 'pesoIn', 'rcIni', 'rcMeta', 'compra', 'preco', 'imp', 'san', 'real', 'de', 'ate', 'taxa', 'venda'];
  document.addEventListener('input', e => {
    const id = (e.target && e.target.id) || '';
    if (id === 'sm-q') { FQ = e.target.value; const q = FQ.trim().toLowerCase(); document.querySelectorAll('.smrow').forEach(r => { r.style.display = !q || r.dataset.s.includes(q) ? '' : 'none'; }); return; }
    if (id.slice(0, 3) !== 'sm-') return;
    const m = id.match(/^sm-f(\d)-(\w+)$/);
    if (m) { CUR.fases[+m[1]][m[2]] = e.target.value; refresh(); return; }
    const k = id.slice(3);
    if (TOP.includes(k)) { CUR[k] = e.target.value; if (k === 'pesoIn') CUR.pesoAuto = false; if (k === 'n') info(); if (k === 'de' || k === 'ate') { if (e.type === 'input') { redraw(); return; } } refresh(); }
  });
  document.addEventListener('change', e => {
    const t = e.target, id = (t && t.id) || '';
    if (t && t.classList && t.classList.contains('sm-ck')) { const s = new Set(CUR.ids); if (t.checked) s.add(t.dataset.id); else s.delete(t.dataset.id); CUR.ids = [...s]; CUR.pesoAuto = true; aplicaAuto(); const p = document.getElementById('sm-pesoIn'); if (p) p.value = CUR.pesoIn; refresh(); return; }
    if (t && t.classList && t.classList.contains('sm-dk')) { const s = new Set(CUR.donos || []); if (t.checked) s.add(t.dataset.d); else s.delete(t.dataset.d); CUR.donos = [...s]; if (CUR.modo === 'lote') CUR.ids = visiveis().map(a => a.id); CUR.pesoAuto = true; aplicaAuto(); redraw(); return; }
    const m = id.match(/^sm-fon(\d)$/); if (m) { CUR.fases[+m[1]].on = t.checked; refresh(); return; }
    if (id === 'sm-modo') { CUR.modo = t.value; CUR.pesoAuto = true; aplicaAuto(); redraw(); }
    else if (id === 'sm-lote') { CUR.loteId = t.value; if (CUR.modo === 'lote') CUR.ids = visiveis().map(a => a.id); CUR.pesoAuto = true; aplicaAuto(); redraw(); }
  });

  const snapshot = () => Object.assign({}, JSON.parse(JSON.stringify(CUR)), { n2: nAnim() });
  Object.assign(ACT, {
    smNova: () => { CUR = novaSim(); T.render(false); },
    smAbrir: d => { const x = D().find(o => o.id === d.id); if (!x) return; CUR = JSON.parse(JSON.stringify(x)); delete CUR.t; if (!CUR.donos) CUR.donos = CUR.dono ? [CUR.dono] : []; delete CUR.dono; if (CUR.modo === 'lote' && !CUR.ids.length && CUR.loteId) CUR.ids = (T.S.animais || []).filter(a => a.loteId === CUR.loteId).map(a => a.id); if (CUR.modo === 'manual' && !CUR.n && x.n2) CUR.n = String(x.n2); T.render(false); setTimeout(info, 0); },
    smSalva: () => {
      if (!CUR.nome.trim()) return toast('Dê um nome para a simulação');
      const o = CUR.id ? D().find(x => x.id === CUR.id) : null;
      const s = snapshot(); s.t = 'sim'; s.upd = hoje();
      if (o) { Object.keys(o).forEach(k => delete o[k]); Object.assign(o, s); }
      else { s.id = 'op_' + uid(); D().push(s); CUR.id = s.id; }
      T.save(); T.render(false); toast('Simulação salva');
    },
    smDel: (d, t) => {
      if (!t.dataset.arm) { t.dataset.arm = 1; t.textContent = 'Toque de novo para confirmar'; return; }
      T.S.op.docs = D().filter(x => x.id !== d.id); CUR = novaSim(); T.save(); T.render(false); toast('Excluída');
    },
    smTodos: () => { CUR.ids = [...new Set(CUR.ids.concat(visiveis().map(a => a.id)))]; CUR.pesoAuto = true; aplicaAuto(); redraw(); },
    smNenhum: () => { CUR.ids = []; CUR.pesoAuto = true; aplicaAuto(); redraw(); },
    smUsaPeso: () => { CUR.pesoAuto = true; aplicaAuto(); redraw(); },
    smVenda: () => { const R = calc(); if (!R.dias) return toast('Preencha os dias das fases'); CUR.venda = T.addDias(hoje(), Math.round(R.dias)); redraw(); },
    smAteUlt: () => { const d = ultData(); if (!d) return toast('Os animais não têm pesagem'); CUR.ate = d; redraw(); },
    smUsaCusto: () => { const c = custoMedio(); if (!c) return toast('Sem custo no período para esses animais'); CUR.real = String(r2(c)).replace('.', ','); redraw(); },
    smUsaCompra: () => { const c = compraMedia(); if (!c) return toast('Os animais não têm valor de compra'); CUR.compra = String(r2(c)).replace('.', ','); redraw(); },
    smPdf: async () => {
      const R = calc(); if (!(R.p0 > 0) || !R.fs.length) return toast('Preencha o peso de entrada e ao menos uma fase');
      toast('Gerando PDF…');
      const P = await T.pdfNovo('p', 'Simulação de terminação', (CUR.nome || 'Sem nome') + '  |  ' + fmtData(hoje())); if (!P) return;
      P.h('Resumo', 11);
      P.kvs([['Animais', R.n ? String(R.n) : '—'], ['Peso de entrada', fmt(R.p0, 1) + ' kg'], ['Peso ao final', fmt(R.pesoFim, 1) + ' kg'], ['Dias', fmt(R.dias, 0)], ['GMD do período', fmt(R.gmdP, 3) + ' kg/dia'], ['Rend. carcaça', fmt(R.rc0 * 100, 1) + '% → ' + fmt(R.rc1 * 100, 1) + '%']]);
      P.kvs([['Ganho de carcaça', fmt(R.ganhoC, 1) + ' kg'], ['Ganho carcaça/dia', fmt(R.ganhoCDia, 3) + ' kg'], ['@ produzidas', fmt(R.arrGanha, 2)], ['VALOR DA @ PRODUZIDA', R.custoArrProd ? brl(R.custoArrProd) : '-'], ['@ final', fmt(R.arrFinal, 2)], ['Custo por @ final', R.custoArrFinal ? brl(R.custoArrFinal) : '-']]);
      P.h('Fases (por cabeça)', 11);
      P.tab(['Fase', 'Dias', 'GMD', 'Peso ini', 'Peso fim', 'Kg/dia', 'Ração', 'Operac.', 'Custo'], R.fs.map(f => [f.nome, fmt(f.dias, 0), fmt(f.gmd, 3), fmt(f.p0, 1), fmt(f.p1, 1), fmt(f.kgDia, 2), brl(f.rac), brl(f.op), brl(f.custo)]), [22, 8, 10, 12, 12, 10, 16, 16, 16], ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']);
      P.h('Custo e resultado (por cabeça)', 11);
      P.kvs([['Aquisição', brl(R.compra)], ['Custo já realizado', brl(R.real)], ['Ração + operac. (fases)', brl(R.custoFases)], ['Sanidade/outros', brl(R.san)], ['Taxas de abate', brl(R.taxa)], ['Custo total', brl(R.custoTotal)]]);
      P.kvs([['Preço da @', R.preco ? brl(R.preco) : '-'], ['Receita', R.preco ? brl(R.receita) : '-'], ['Impostos (' + fmt(pn(CUR.imp), 2) + '%)', R.preco ? brl(R.imp) : '-'], ['RESULTADO FINAL', R.preco ? brl(R.resultado) : '-'], ['Margem', R.preco ? fmt(R.margem, 1) + '%' : '-'], ['Venda prevista', CUR.venda ? fmtData(CUR.venda) : '-']]);
      if (R.n && R.preco) P.kvs([['Resultado do lote (' + R.n + ' animais)', brl(R.resultado * R.n)], ['Receita do lote', brl(R.receita * R.n)], ['Custo total do lote', brl(R.custoTotal * R.n)]]);
      const AL = linhasAnimais();
      if (AL.some(x => x.R)) {
        P.h('Animais, um a um', 11);
        const ok = AL.filter(x => x.R);
        P.tab(['Brinco', 'Lote', 'Peso ini', 'Peso fim', '@ final', 'Custo total', 'Receita', 'Resultado'], ok.map(x => { const lt = (T.S.lotes || []).find(l => l.id === x.a.loteId); return [x.a.brinco, lt ? lt.nome : '', fmt(x.R.p0, 1), fmt(x.R.pesoFim, 1), fmt(x.R.arrFinal, 2), brl(x.R.custoTotal), x.R.preco ? brl(x.R.receita) : '-', x.R.preco ? brl(x.R.resultado) : '-']; })
          .concat([['TOTAL', String(ok.length), '', '', fmt(sum(ok, x => x.R.arrFinal), 2), brl(sum(ok, x => x.R.custoTotal)), R.preco ? brl(sum(ok, x => x.R.receita)) : '-', R.preco ? brl(sum(ok, x => x.R.resultado)) : '-']]), [16, 26, 12, 12, 10, 16, 16, 16], ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r']);
      }
      P.p('Simulação: o consumo de cada fase = peso médio da fase x % do PV; carcaca = peso x rendimento; @ = carcaca / 15. Valor da @ produzida = (racao + operacional + sanidade) / @ de carcaca ganhas. Nao altera lotes, custos nem cobrancas.');
      P.save('simulacao-' + (CUR.nome || 'sem-nome').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + hoje());
    }
  });

  T.TITULOS.sim = 'Simulação';
})();
