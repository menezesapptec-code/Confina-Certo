/* ===== Custo operacional (centro de custo) — módulo separado do TIP Control =====
   Se este arquivo não carregar, o TIP Control continua funcionando como antes (o R$/cab·dia manual segue valendo).
   Dados: cada item é um documento em  u/{uid}/cfg/op_xxxx  (tipos: cat, maq, lan, dc, da, sp, sc, ss). */
(function () {
  'use strict';
  const T = window.TIP;
  if (!T) return;
  const { fld, selF, kv, head, esc, brl, fmt, fmtData, hoje, addDias, num, impNum, r2, uid, sum, toast, sheet, closeModal, VIEWS, ACT, FORMS } = T;

  /* ---------- dados ---------- */
  const D = () => { const S = T.S; if (!S.op) S.op = { docs: [] }; if (!S.op.docs) S.op.docs = []; return S.op.docs; };
  const of = t => D().filter(x => x.t === t);
  const byId = (arr, id) => arr.find(x => x.id === id);
  const cats = () => of('cat').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const maqs = () => of('maq').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const novo = o => { o.id = 'op_' + uid(); D().push(o); return o; };
  const SUG = ['Combustível (diesel)', 'Sanidade', 'Mão de obra', 'Manutenção de cercas, cochos e curral', 'Manutenção de maquinaria', 'Pastagem', 'Investimentos (cerca, cocho, maquinaria...)'];
  const MESES_INV = 60;
  function catDiesel() {
    let c = of('cat').find(x => x.diesel);
    if (!c) c = of('cat').find(x => /diesel|combust/i.test(x.nome));
    if (!c) { c = novo({ t: 'cat', nome: 'Combustível (diesel)', diesel: true }); }
    else if (!c.diesel) c.diesel = true;
    return c;
  }

  /* ---------- meses ---------- */
  const ym = d => String(d || '').slice(0, 7);
  const mAdd = (m, n) => { let y = +m.slice(0, 4), k = +m.slice(5, 7) - 1 + n; y += Math.floor(k / 12); k = ((k % 12) + 12) % 12; return y + '-' + String(k + 1).padStart(2, '0'); };
  const mDiff = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  const mDias = m => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  const MN = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mLb = m => MN[+m.slice(5, 7) - 1] + '/' + m.slice(2, 4);
  const mCur = () => ym(hoje());

  /* ---------- diesel: preço médio e estoque ---------- */
  function dieselInfo() {
    const cp = of('dc').sort((a, b) => a.data < b.data ? -1 : 1), ab = of('da').sort((a, b) => a.data < b.data ? -1 : 1);
    const lc = sum(cp, x => num(x.litros)), vc = sum(cp, x => num(x.valor)), la = sum(ab, x => num(x.litros));
    const pmGeral = lc > 0 ? vc / lc : 0;
    const pm = d => { let l = 0, v = 0; cp.forEach(x => { if (x.data <= d) { l += num(x.litros); v += num(x.valor); } }); return l > 0 ? v / l : pmGeral; };
    const custoAb = x => num(x.litros) * pm(x.data);
    return { cp, ab, lc, la, estoque: lc - la, pmGeral, pm, custoAb, valorEstoque: (lc - la) * pmGeral };
  }

  /* ---------- sanidade (operacional): produtos, compras e saídas com preço médio ---------- */
  function catSan() {
    let c = of('cat').find(x => x.san) || of('cat').find(x => /sanidade/i.test(x.nome));
    if (!c) c = novo({ t: 'cat', nome: 'Sanidade', san: true }); else if (!c.san) c.san = true;
    return c;
  }
  const prods = () => of('sp').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  function sanInfo() {
    const cmp = of('sc').sort((a, b) => a.data < b.data ? -1 : 1), sai = of('ss').sort((a, b) => a.data < b.data ? -1 : 1);
    const pm = (pid, d) => { let q = 0, v = 0; cmp.forEach(x => { if (x.prodId === pid && x.data <= d) { q += num(x.qtd); v += num(x.valor); } }); if (q > 0) return v / q; cmp.forEach(x => { if (x.prodId === pid) { q += num(x.qtd); v += num(x.valor); } }); return q > 0 ? v / q : 0; };
    const custoSai = x => num(x.qtd) * pm(x.prodId, x.data);
    const por = new Map();
    prods().forEach(p => { const q = sum(cmp.filter(x => x.prodId === p.id), x => num(x.qtd)), v = sum(cmp.filter(x => x.prodId === p.id), x => num(x.valor)), s = sum(sai.filter(x => x.prodId === p.id), x => num(x.qtd)); const m = q > 0 ? v / q : 0; por.set(p.id, { p, q, s, estoque: q - s, pm: m, valor: (q - s) * m }); });
    return { cmp, sai, por, custoSai, valorEstoque: sum([...por.values()], r => Math.max(0, r.valor)) };
  }

  /* ---------- rateio mensal ---------- */
  function lanMeses(l) {
    const m0 = ym(l.data);
    const fim = (l.ateMes && l.ateMes >= m0) ? l.ateMes : mAdd(m0, Math.max(1, Math.round(num(l.n) || 1)) - 1);
    return { m0, fim, n: mDiff(m0, fim) + 1 };
  }
  let CACHE = null;
  function calc() {
    const S = T.S, key = S, rev = window.TIPREV || 0, h = hoje(), nd = D().length;
    if (CACHE && CACHE.key === key && CACHE.rev === rev && CACHE.h === h && CACHE.nd === nd) return CACHE;
    const tot = new Map(), porCat = new Map(), itens = new Map();
    const add = (m, catId, v, it) => {
      tot.set(m, (tot.get(m) || 0) + v);
      if (!porCat.has(m)) porCat.set(m, new Map());
      porCat.get(m).set(catId || '', (porCat.get(m).get(catId || '') || 0) + v);
      if (!itens.has(m)) itens.set(m, []); itens.get(m).push(it);
    };
    of('lan').forEach(l => {
      const v = num(l.valor); if (!(v > 0) || !l.data) return;
      const mm = lanMeses(l);
      for (let i = 0; i < mm.n; i++) add(mAdd(mm.m0, i), l.catId, v / mm.n, { tipo: 'lan', o: l, v: v / mm.n });
    });
    const di = dieselInfo(), cd = of('cat').find(x => x.diesel);
    di.ab.forEach(x => { const v = di.custoAb(x); if (v > 0 && x.data) add(ym(x.data), cd ? cd.id : '', v, { tipo: 'da', o: x, v }); });
    const si = sanInfo(), cs = of('cat').find(x => x.san);
    si.sai.forEach(x => { const v = si.custoSai(x); if (v > 0 && x.data) add(ym(x.data), cs ? cs.id : '', v, { tipo: 'ss', o: x, v }); });
    /* dias-animal por mês (todos os animais da fazenda; quem não foi vendido conta até hoje e segue igual nos meses futuros) */
    const dias = new Map();
    T.ALLA().forEach(a => {
      if (!a.entrada) return;
      const fim = a.venda && a.venda.d ? a.venda.d : null, m0 = ym(a.entrada), mf = fim ? ym(fim) : mAdd(mCur(), 24);
      const n = Math.min(mDiff(m0, mf), 120);
      for (let i = 0; i <= n; i++) {
        const m = mAdd(m0, i), ini = i === 0 ? a.entrada : m + '-01', ate = (fim && ym(fim) === m) ? fim : m + '-' + String(mDias(m)).padStart(2, '0');
        const d = T.diffDias(ini, ate) + 1; if (d > 0) dias.set(m, (dias.get(m) || 0) + d);
      }
    });
    const rate = new Map(), rateAll = new Map();
    const fech = new Set(of('fech').map(x => x.mes));
    tot.forEach((v, m) => { const dd = dias.get(m) || 0; if (v > 0 && dd > 0) { rateAll.set(m, v / dd); if (fech.has(m)) rate.set(m, v / dd); } });
    CACHE = { key, rev, h, nd, tot, porCat, itens, dias, rate, rateAll, di, si, fech };
    return CACHE;
  }
  const temDados = () => D().some(x => x.t === 'lan' || x.t === 'da' || x.t === 'ss');
  const cabMes = (C, m) => { const d = C.dias.get(m) || 0; return d / mDias(m); };

  /* ---------- gancho do custo do lote: custo operacional do animal (usado por custoLinhas) ---------- */
  function opAnimal(a, loteId, de, ate, dias, opDia) {
    if (!temDados()) return opDia * dias;
    const C = calc(); let tot = 0;
    T.ivNoLote(a, loteId, de, ate).forEach(([s, e]) => {
      let d = s;
      while (d <= e) {
        const m = ym(d), fimM = m + '-' + String(mDias(m)).padStart(2, '0'), f = e < fimM ? e : fimM;
        const n = T.diffDias(d, f) + 1, r = C.rate.has(m) ? C.rate.get(m) : opDia;
        tot += n * r; d = addDias(f, 1);
      }
    });
    return tot;
  }

  /* custo operacional REAL do animal (o que foi lançado, mesmo com o mês em aberto): para comparar com o que se cobra */
  function opReal(a, loteId, de, ate) {
    const C = calc(); let tot = 0;
    T.ivNoLote(a, loteId, de, ate).forEach(([s, e]) => {
      let d = s;
      while (d <= e) {
        const m = ym(d), fimM = m + '-' + String(mDias(m)).padStart(2, '0'), f = e < fimM ? e : fimM;
        tot += (T.diffDias(d, f) + 1) * (C.rateAll.get(m) || 0); d = addDias(f, 1);
      }
    });
    return tot;
  }

  /* ---------- gráficos ---------- */
  const COR = ['#1f6a42', '#e0a526', '#c2452d', '#4a7fb5', '#7fb069', '#8a5fb0', '#b5703f', '#3d9c9c', '#a0a04a', '#7a7a7a'];
  function hbars(rows, fm) {
    const mx = Math.max(1, ...rows.map(r => r.v));
    return rows.map((r, i) => '<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span>' + esc(r.l) + '</span><b style="font-variant-numeric:tabular-nums">' + fm(r.v) + (r.s ? ' <small style="color:var(--mut);font-weight:600">' + r.s + '</small>' : '') + '</b></div><div class="bar"><i style="display:block;height:100%;width:' + Math.max(2, r.v / mx * 100) + '%;background:' + (r.c || COR[i % COR.length]) + ';border-radius:99px"></i></div></div>').join('');
  }
  /* barras verticais empilhadas por mês: meses [{m, parts:[{v,c,n}]}] */
  function vbars(meses, fm) {
    const W = 340, H = 150, pb = 22, n = meses.length, bw = Math.min(34, (W - 10) / n - 8), mx = Math.max(1, ...meses.map(x => sum(x.parts, p => p.v)));
    let s = '<svg viewBox="0 0 ' + W + ' ' + (H + pb) + '" style="width:100%;max-width:480px;height:auto;display:block;margin:0 auto" role="img">';
    meses.forEach((x, i) => {
      const cx = 8 + (i + .5) * ((W - 16) / n); let y = H;
      x.parts.forEach(p => { const h = p.v / mx * (H - 16); if (h > 0) { y -= h; s += '<rect x="' + (cx - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + h + '" fill="' + p.c + '" rx="2"><title>' + esc(p.n) + ': ' + fm(p.v) + '</title></rect>'; } });
      const t = sum(x.parts, p => p.v);
      if (t > 0) s += '<text x="' + cx + '" y="' + (y - 3) + '" text-anchor="middle" font-size="9" fill="#66756b">' + fm(t) + '</text>';
      s += '<text x="' + cx + '" y="' + (H + 14) + '" text-anchor="middle" font-size="10" fill="#66756b"' + (x.on ? ' font-weight="700"' : '') + '>' + mLb(x.m) + '</text>';
    });
    return s + '</svg>';
  }
  const k = v => v >= 1000 ? fmt(v / 1000, v >= 10000 ? 0 : 1) + 'k' : fmt(v, 0);
  const legenda = items => '<div style="display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:12px;color:var(--mut)">' + items.map(i => '<span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:' + i.c + ';margin-right:4px"></i>' + esc(i.n) + '</span>').join('') + '</div>';

  /* ---------- barra dos 3 setores ---------- */
  const SET = [['geral', 'Painel geral'], ['painel', 'TIP', 'Terminação intensiva a pasto'], ['op', 'Custo operacional'], ['sim', 'Simulação']];
  const setorDe = v => v === 'geral' ? 'geral' : v === 'op' ? 'op' : v === 'sim' ? 'sim' : 'painel';
  function bar(view) {
    const vw = document.getElementById('view'); if (!vw) return;
    if (T.isAdmin && T.isAdmin()) return;
    const on = setorDe(view), el = document.createElement('div'); el.id = 'setor';
    vw.insertBefore(el, vw.firstChild);
    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:0 0 14px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:5px">' +
      SET.map(([id, t, sub]) => '<a href="#' + id + '" style="text-align:center;padding:10px 2px;border-radius:10px;font-weight:700;font-size:12px;text-decoration:none;line-height:1.15;' + (on === id ? 'background:var(--green);color:#f4efe6' : 'color:var(--ink)') + '">' + t + (sub ? '<div style="font-size:10px;font-weight:500;opacity:.8;margin-top:2px">' + sub + '</div>' : '') + '</a>').join('') + '</div>';
  }

  /* ---------- estado de tela ---------- */
  const F = { tab: 'resumo', mes: '' };
  const mesSel = () => F.mes || mCur();
  function mesesDisp(C) {
    const s = new Set([mCur()]); C.tot.forEach((_, m) => s.add(m)); C.dias.forEach((_, m) => { if (m <= mCur() && mDiff(m, mCur()) <= 12) s.add(m); });
    return [...s].sort().reverse();
  }
  const mSel = (C) => '<div class="cfgrow" style="margin-bottom:10px">' + selF('op-mes', 'Mês', mesesDisp(C).map(m => [m, MN[+m.slice(5, 7) - 1] + '/' + m.slice(0, 4)]), mesSel()) + '</div>';
  const nomeCat = id => { const c = byId(of('cat'), id); return c ? c.nome : 'Sem categoria'; };

  /* ---------- OPERACIONAL ---------- */
  VIEWS.op = () => {
    const C = calc(), m = mesSel(), tab = F.tab;
    const tabs = [['resumo', 'Resumo'], ['lanc', 'Lançamentos'], ['diesel', 'Diesel'], ['san', 'Sanidade'], ['cad', 'Cadastros']];
    const ch = '<div class="chips">' + tabs.map(([id, t]) => '<button class="chip ' + (tab === id ? 'on' : '') + '" data-act="opTab" data-id="' + id + '">' + t + '</button>').join('') + '</div>';
    let h = head('Custo operacional', 'Controle à parte do que a fazenda gasta, rateado por cabeça (não entra no TIP)', '<button class="btn sm" data-act="opLanNovo">+ Custo</button>') + ch;
    if (tab === 'resumo') h += opResumo(C, m);
    else if (tab === 'lanc') h += mSel(C) + opLanc(C, m);
    else if (tab === 'diesel') h += opDiesel(C, m);
    else if (tab === 'san') h += opSan(C, m);
    else h += opCad();
    return h;
  };

  function opResumo(C, m) {
    const tot = C.tot.get(m) || 0, rate = C.rate.get(m), cab = cabMes(C, m), opDia = T.opDia(), fechado = C.fech.has(m), prev = (tot > 0 && (C.dias.get(m) || 0) > 0) ? tot / C.dias.get(m) : null;
    let h = mSel(C);
    h += '<div class="card" style="margin-bottom:12px"><b>Controle à parte</b><p class="note" style="margin:6px 0 0">Este painel só acompanha o que você gasta. Ele não entra no custo do TIP nem na cobrança: lá vale o valor manual de ' + brl(opDia) + ' por cabeça/dia (ou o que você digitar).</p></div>';
    h += '<div class="stats"><div class="card stat"><div class="l">Custo do mês</div><div class="v">' + brl(tot) + '</div></div>' +
      '<div class="card stat"><div class="l">Por cabeça · dia</div><div class="v">' + (prev != null ? brl(prev) : '—') + '</div><div class="s">gasto real do mês ÷ animais</div></div>' +
      '<div class="card stat"><div class="l">Cabeças (média)</div><div class="v">' + fmt(cab, 0) + '</div><div class="s">todos os animais da fazenda</div></div>' +
      '<div class="card stat"><div class="l">Por cabeça · mês</div><div class="v">' + (prev != null ? brl(prev * mDias(m)) : '—') + '</div></div></div>';
    /* por categoria */
    const pc = C.porCat.get(m);
    if (pc && pc.size) {
      const rows = [...pc.entries()].map(([id, v]) => ({ l: nomeCat(id), v })).sort((a, b) => b.v - a.v).map(r => Object.assign(r, { s: fmt(r.v / tot * 100, 0) + '%' }));
      h += '<div class="card" style="margin-top:12px"><h3>Onde mais gasta · ' + mLb(m) + '</h3>' + hbars(rows, brl) + '</div>';
    }
    /* investimentos em diluição */
    const invs = of('lan').filter(l => { const c = byId(of('cat'), l.catId); return c && c.inv && lanMeses(l).n > 1; }).map(l => { const mm = lanMeses(l), feitos = Math.max(0, Math.min(mm.n, mDiff(mm.m0, mCur()) + 1)); return { l, mm, feitos, mensal: num(l.valor) / mm.n }; }).filter(x => x.feitos < x.mm.n);
    if (invs.length) h += '<div class="card" style="margin-top:12px"><h3>Investimentos em diluição</h3>' + invs.map(x => '<div data-act="opLanEd" data-id="' + x.l.id + '" style="padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(x.l.desc || nomeCat(x.l.catId)) + '</b><b>' + brl(x.mensal) + '/mês</b></div><div class="note" style="margin:2px 0 0">Total ' + brl(num(x.l.valor)) + ' · mês ' + x.feitos + ' de ' + x.mm.n + ' · falta diluir ' + brl(num(x.l.valor) - x.mensal * x.feitos) + '</div></div>').join('') + '</div>';
    /* evolução 8 meses */
    const ms = []; for (let i = 7; i >= 0; i--) ms.push(mAdd(mCur(), -i));
    const catIds = new Set(); ms.forEach(x => (C.porCat.get(x) || new Map()).forEach((_, id) => catIds.add(id)));
    const lst = [...catIds]; const cor = id => COR[lst.indexOf(id) % COR.length];
    if (lst.length) {
      h += '<div class="card" style="margin-top:12px"><h3>Evolução mensal</h3>' + vbars(ms.map(x => ({ m: x, on: x === m, parts: [...(C.porCat.get(x) || new Map()).entries()].map(([id, v]) => ({ v, c: cor(id), n: nomeCat(id) })) })), k) +
        legenda(lst.map(id => ({ c: cor(id), n: nomeCat(id) }))) + '</div>';
      const rr = ms.map(x => ({ l: mLb(x), v: C.rate.has(x) ? C.rate.get(x) : 0 })).filter(r => r.v > 0);
      if (rr.length > 1) h += '<div class="card" style="margin-top:12px"><h3>Custo por cabeça · dia</h3>' + hbars(rr, v => brl(v)) + '</div>';
    }
    
    return h;
  }

  function opLanc(C, m) {
    const it = (C.itens.get(m) || []).slice().sort((a, b) => (b.o.data || '') < (a.o.data || '') ? -1 : 1);
    if (!it.length) return '<div class="card empty">Nenhum custo neste mês.</div>';
    let h = '<div class="card" style="padding:4px 14px">';
    it.forEach(x => {
      const o = x.o;
      if (x.tipo === 'lan') {
        const mm = lanMeses(o);
        h += '<div data-act="opLanEd" data-id="' + o.id + '" style="display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid var(--line);cursor:pointer"><div><b>' + esc(o.desc || nomeCat(o.catId)) + '</b><div class="note" style="margin:2px 0 0">' + fmtData(o.data) + ' · ' + esc(nomeCat(o.catId)) + (mm.n > 1 ? ' · rateio ' + mm.n + ' meses (total ' + brl(num(o.valor)) + ')' : '') + '</div></div><b style="white-space:nowrap">' + brl(x.v) + '</b></div>';
      } else if (x.tipo === 'ss') {
        const pr = byId(of('sp'), o.prodId);
        h += '<div style="display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid var(--line)"><div><b>Sanidade · ' + esc(pr ? pr.nome : 'produto') + '</b><div class="note" style="margin:2px 0 0">' + fmtData(o.data) + ' · ' + fmt(num(o.qtd), 2) + ' ' + esc(pr ? pr.un : '') + (o.obs ? ' · ' + esc(o.obs) : '') + ' · do estoque</div></div><b style="white-space:nowrap">' + brl(x.v) + '</b></div>';
      } else {
        const mq = byId(of('maq'), o.maqId);
        h += '<div style="display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-bottom:1px solid var(--line)"><div><b>Abastecimento · ' + esc(mq ? mq.nome : 'sem máquina') + '</b><div class="note" style="margin:2px 0 0">' + fmtData(o.data) + ' · ' + fmt(num(o.litros), 0) + ' L · do estoque de diesel</div></div><b style="white-space:nowrap">' + brl(x.v) + '</b></div>';
      }
    });
    return h + '</div><p class="note">Mostra o que pesa neste mês (o rateio de compras grandes aparece em cada mês que ele cobre).</p>';
  }

  function opDiesel(C, m) {
    const di = C.di;
    let h = '<div class="stats"><div class="card stat"><div class="l">Estoque</div><div class="v">' + fmt(di.estoque, 0) + ' <small>L</small></div><div class="s">' + brl(di.valorEstoque) + '</div></div>' +
      '<div class="card stat"><div class="l">Preço médio</div><div class="v">' + (di.pmGeral ? brl(di.pmGeral) : '—') + '<small>/L</small></div></div></div>';
    if (di.estoque < 0) h += '<div class="card" style="margin-top:12px;border-color:var(--red)"><b style="color:var(--red)">Estoque negativo</b><p class="note" style="margin:4px 0 0">Foram abastecidos ' + fmt(-di.estoque, 0) + ' L a mais do que as compras lançadas. Confira se falta lançar uma compra.</p></div>';
    h += '<div class="acts"><button class="btn" data-act="opDcNovo">+ Compra de diesel</button><button class="btn sec" data-act="opDaNovo">+ Abastecimento</button></div>';
    const porM = new Map(); di.ab.filter(x => ym(x.data) === m).forEach(x => { const r = porM.get(x.maqId || '') || { l: 0, v: 0 }; r.l += num(x.litros); r.v += di.custoAb(x); porM.set(x.maqId || '', r); });
    if (porM.size) h += '<div class="card" style="margin-top:12px"><h3>Por máquina · ' + mLb(m) + '</h3>' + hbars([...porM.entries()].map(([id, r]) => ({ l: (byId(of('maq'), id) || { nome: 'Sem máquina' }).nome, v: r.l, s: brl(r.v) })).sort((a, b) => b.v - a.v), v => fmt(v, 0) + ' L') + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>Compras</h3>' + (di.cp.length ? di.cp.slice().reverse().slice(0, 15).map(x => '<div data-act="opDcEd" data-id="' + x.id + '" style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer"><span>' + fmtData(x.data) + ' · ' + fmt(num(x.litros), 0) + ' L' + (x.forn ? ' · ' + esc(x.forn) : '') + '</span><b>' + brl(num(x.valor)) + '</b></div>').join('') : '<p class="note">Nenhuma compra lançada.</p>') + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>Abastecimentos</h3>' + (di.ab.length ? di.ab.slice().reverse().slice(0, 25).map(x => { const mq = byId(of('maq'), x.maqId); return '<div data-act="opDaEd" data-id="' + x.id + '" style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer"><span>' + fmtData(x.data) + ' · ' + esc(mq ? mq.nome : 'sem máquina') + ' · ' + fmt(num(x.litros), 0) + ' L</span><b>' + brl(di.custoAb(x)) + '</b></div>'; }).join('') : '<p class="note">Nenhum abastecimento lançado.</p>') + '</div>';
    return h + '<p class="note">O diesel entra no custo quando é abastecido (litros × preço médio das compras), não quando é comprado.</p>';
  }

  function opSan(C, m) {
    const si = C.si, P = prods();
    let h = '<div class="stats"><div class="card stat"><div class="l">Valor em estoque</div><div class="v">' + brl(si.valorEstoque) + '</div><div class="s">' + P.length + ' produto(s)</div></div>' +
      '<div class="card stat"><div class="l">Saídas em ' + mLb(m) + '</div><div class="v">' + brl(sum(si.sai.filter(x => ym(x.data) === m), x => si.custoSai(x))) + '</div></div></div>';
    h += '<div class="acts"><button class="btn" data-act="opScNovo">+ Compra</button><button class="btn sec" data-act="opSsNovo">+ Saída</button><button class="btn sec" data-act="opSpNovo">+ Produto</button></div>';
    h += '<div class="card" style="margin-top:12px"><h3>Estoque</h3>' + (P.length ? P.map(p => { const r = si.por.get(p.id); return '<div data-act="opSpEd" data-id="' + p.id + '" style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer"><span><b>' + esc(p.nome) + '</b><span class="note" style="display:block;margin:2px 0 0">' + (r.pm ? brl(r.pm) + '/' + esc(p.un) : 'sem compra') + '</span></span><b style="white-space:nowrap;color:' + (r.estoque < -0.0005 ? 'var(--red)' : '') + '">' + fmt(r.estoque, 2) + ' ' + esc(p.un) + '</b></div>'; }).join('') : '<p class="note">Cadastre os produtos (vacina, vermífugo, antibiótico...) em + Produto, depois lance as compras.</p>') + '</div>';
    if (P.some(p => si.por.get(p.id).estoque < -0.0005)) h += '<div class="card" style="margin-top:12px;border-color:var(--red)"><b style="color:var(--red)">Estoque negativo</b><p class="note" style="margin:4px 0 0">Saiu mais do que foi comprado em algum produto. Confira se falta lançar uma compra.</p></div>';
    const nm = id => { const p = byId(of('sp'), id); return p ? p.nome : 'produto'; }, un = id => { const p = byId(of('sp'), id); return p ? p.un : ''; };
    h += '<div class="card" style="margin-top:12px"><h3>Compras</h3>' + (si.cmp.length ? si.cmp.slice().reverse().slice(0, 15).map(x => '<div data-act="opScEd" data-id="' + x.id + '" style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer"><span>' + fmtData(x.data) + ' · ' + esc(nm(x.prodId)) + ' · ' + fmt(num(x.qtd), 2) + ' ' + esc(un(x.prodId)) + (x.forn ? ' · ' + esc(x.forn) : '') + '</span><b>' + brl(num(x.valor)) + '</b></div>').join('') : '<p class="note">Nenhuma compra lançada.</p>') + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>Saídas</h3>' + (si.sai.length ? si.sai.slice().reverse().slice(0, 25).map(x => '<div data-act="opSsEd" data-id="' + x.id + '" style="display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer"><span>' + fmtData(x.data) + ' · ' + esc(nm(x.prodId)) + ' · ' + fmt(num(x.qtd), 2) + ' ' + esc(un(x.prodId)) + (x.obs ? ' · ' + esc(x.obs) : '') + '</span><b>' + brl(si.custoSai(x)) + '</b></div>').join('') : '<p class="note">Nenhuma saída lançada.</p>') + '</div>';
    return h + '<p class="note">A sanidade entra no custo operacional quando o produto sai do estoque (quantidade × preço médio das compras), não quando é comprado. Fica só aqui: não altera o TIP nem a cobrança.</p>';
  }

  function opCad() {
    const cs = cats(), ms = maqs();
    let h = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Categorias</h3><button class="btn sm sec" data-act="opCatNova">+ Categoria</button></div>';
    if (!cs.length) h += '<p class="note">Crie as categorias do centro de custo (ex.: Casa-sede, Manutenção de cercas).</p><button class="btn line block" style="margin-top:8px" data-act="opCatSug">Criar categorias sugeridas</button>';
    else h += cs.map(c => '<div data-act="opCatEd" data-id="' + c.id + '" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);cursor:pointer"><b>' + esc(c.nome) + '</b><span class="note" style="margin:0">' + of('lan').filter(l => l.catId === c.id).length + ' lanç.</span></div>').join('');
    h += '</div><div class="card" style="margin-top:12px"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Máquinas</h3><button class="btn sm sec" data-act="opMaqNova">+ Máquina</button></div>';
    h += ms.length ? ms.map(c => '<div data-act="opMaqEd" data-id="' + c.id + '" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);cursor:pointer"><b>' + esc(c.nome) + '</b><span class="note" style="margin:0">' + fmt(sum(of('da').filter(x => x.maqId === c.id), x => num(x.litros)), 0) + ' L</span></div>').join('') : '<p class="note">Cadastre trator, caminhonete etc. para lançar o abastecimento.</p>';
    return h + '</div>';
  }

  /* ---------- PAINEL GERAL ---------- */
  VIEWS.geral = () => {
    const C = calc(), m = mesSel();
    const fornM = x => T.S.forn.reduce((s, f) => ym(f.data) === x ? s + num(f.valor) : s, 0);
    const sanM = x => T.SAN().reduce((s, e) => ym(e.data) === x ? s + num(e.valor) : s, 0);
    const opM = x => C.tot.get(x) || 0;
    const nut = fornM(m), san = sanM(m), op = opM(m), tot = nut + san + op, dd = (C.dias.get(m) || 0);
    let h = head('Painel geral', 'TIP (nutrição e sanidade) e operacional juntos') + mSel(C);
    h += '<div class="stats"><div class="card stat"><div class="l">Custo total do mês</div><div class="v">' + brl(tot) + '</div></div>' +
      '<div class="card stat"><div class="l">Por cabeça · dia</div><div class="v">' + (dd ? brl(tot / dd) : '—') + '</div><div class="s">' + fmt(cabMes(C, m), 0) + ' cabeças</div></div></div>';
    const parts = [['Nutrição (TIP)', nut, COR[0]], ['Sanidade (TIP)', san, COR[2]], ['Operacional', op, COR[1]]];
    h += '<div class="card" style="margin-top:12px"><h3>Composição · ' + mLb(m) + '</h3>' + hbars(parts.map(p => ({ l: p[0], v: p[1], c: p[2], s: tot ? fmt(p[1] / tot * 100, 0) + '%' : '' })), brl) + '</div>';
    const ms = []; for (let i = 7; i >= 0; i--) ms.push(mAdd(mCur(), -i));
    h += '<div class="card" style="margin-top:12px"><h3>Evolução mensal</h3>' + vbars(ms.map(x => ({ m: x, on: x === m, parts: [{ v: fornM(x), c: COR[0], n: 'Nutrição' }, { v: sanM(x), c: COR[2], n: 'Sanidade' }, { v: opM(x), c: COR[1], n: 'Operacional' }] })), k) + legenda(parts.map(p => ({ c: p[2], n: p[0] }))) + '</div>';
    const pc = C.porCat.get(m);
    if (pc && pc.size) h += '<div class="card" style="margin-top:12px"><h3>Operacional por categoria</h3>' + hbars([...pc.entries()].map(([id, v]) => ({ l: nomeCat(id), v })).sort((a, b) => b.v - a.v), brl) + '</div>';
    return h + '<div class="acts" style="margin-top:12px"><a class="btn sec" href="#painel">Abrir TIP</a><a class="btn sec" href="#op">Abrir Custo operacional</a></div><p class="note">Não inclui a compra dos animais. Nutrição e sanidade são os valores lançados no mês (fornecimento e sanidade).</p>';
  };

  /* ---------- formulários ---------- */
  const opt = (arr) => arr.map(x => [x.id, x.nome]);
  function mLan(id) {
    const l = id ? byId(of('lan'), id) : { data: hoje(), n: 1 }; if (!l) return;
    if (!cats().length) { toast('Crie uma categoria primeiro (aba Cadastros)'); F.tab = 'cad'; location.hash = '#op'; T.render(true); return; }
    const mm = l.data ? lanMeses(l) : { n: 1 };
    sheet('<h2>' + (id ? 'Custo' : 'Lançar custo') + '</h2><form data-form="opLan" data-id="' + (id || '') + '">' +
      fld('ol-d', 'Data', l.data, { type: 'date' }) + fld('ol-t', 'Descrição', l.desc || '', { txt: 1, ph: 'Ex.: Manutenção do trator' }) +
      '<div class="cfgrow">' + fld('ol-v', 'Valor total (R$)', l.valor == null ? '' : String(l.valor).replace('.', ',')) + fld('ol-n', 'Diluir em quantos meses', String(mm.n)) + '</div>' +
      selF('ol-c', 'Categoria', opt(cats()), l.catId || '') + fld('ol-f', 'Fornecedor (opcional)', l.forn || '', { txt: 1 }) +
      '<label for="ol-a" style="margin-top:8px">Encerrar o rateio antes (último mês, opcional)</label><input id="ol-a" type="month" value="' + esc(l.ateMes || '') + '"><p class="note" style="margin:6px 0 12px">Ex.: comprou para 3 meses e acabou em 2 — coloque o mês em que acabou. Em Investimentos, o valor é dividido pelos meses (ex.: carregadeira de R$ 200.000 em 60 meses = R$ 3.333,33 por mês).</p>' +
      '<button class="btn block">Salvar</button>' + (id ? '<button type="button" class="btn line block" style="margin-top:8px;color:var(--red)" data-act="opDel" data-id="' + id + '">Excluir</button>' : '') + '</form>');
  }
  FORMS.opLan = () => {
    const f = document.querySelector('[data-form=opLan]'), id = f.dataset.id;
    const data = document.getElementById('ol-d').value, v = impNum(document.getElementById('ol-v').value), n = Math.max(1, Math.round(impNum(document.getElementById('ol-n').value) || 1)), c = document.getElementById('ol-c').value, a = document.getElementById('ol-a').value;
    if (!data) return toast('Informe a data'); if (!(v > 0)) return toast('Informe o valor'); if (!c) return toast('Escolha a categoria');
    if (a && a < ym(data)) return toast('O último mês não pode ser antes da data do custo');
    const o = id ? byId(of('lan'), id) : novo({ t: 'lan' });
    Object.assign(o, { data, desc: document.getElementById('ol-t').value.trim(), valor: r2(v), n, catId: c, forn: document.getElementById('ol-f').value.trim(), ateMes: a || '' });
    if (!o.ateMes) delete o.ateMes; if (!o.forn) delete o.forn;
    T.save(); closeModal(); T.render(false); toast('Custo salvo');
  };
  function mCat(id) {
    const c = id ? byId(of('cat'), id) : { nome: '' }; if (!c) return;
    sheet('<h2>' + (id ? 'Categoria' : 'Nova categoria') + '</h2><form data-form="opCat" data-id="' + (id || '') + '">' + fld('oc-n', 'Nome', c.nome, { txt: 1, ph: 'Ex.: Casa-sede' }) + '<label style="display:flex;gap:8px;align-items:center;margin:4px 0 12px"><input type="checkbox" id="oc-i" ' + (c.inv ? 'checked' : '') + '> Categoria de investimento (diluir em muitos meses)</label>' + '<button class="btn block">Salvar</button>' + (id ? '<button type="button" class="btn line block" style="margin-top:8px;color:var(--red)" data-act="opDel" data-id="' + id + '">Excluir</button>' : '') + '</form>');
  }
  FORMS.opCat = () => {
    const id = document.querySelector('[data-form=opCat]').dataset.id, nome = document.getElementById('oc-n').value.trim();
    if (!nome) return toast('Informe o nome');
    if (cats().some(c => c.id !== id && c.nome.toLowerCase() === nome.toLowerCase())) return toast('Já existe uma categoria com esse nome');
    const o = id ? byId(of('cat'), id) : novo({ t: 'cat' }); o.nome = nome; if (document.getElementById('oc-i').checked) o.inv = true; else delete o.inv; T.save(); closeModal(); T.render(false);
  };
  function mMaq(id) {
    const c = id ? byId(of('maq'), id) : { nome: '' }; if (!c) return;
    sheet('<h2>' + (id ? 'Máquina' : 'Nova máquina') + '</h2><form data-form="opMaq" data-id="' + (id || '') + '">' + fld('om-n', 'Nome', c.nome, { txt: 1, ph: 'Ex.: Trator John Deere' }) + '<button class="btn block">Salvar</button>' + (id ? '<button type="button" class="btn line block" style="margin-top:8px;color:var(--red)" data-act="opDel" data-id="' + id + '">Excluir</button>' : '') + '</form>');
  }
  FORMS.opMaq = () => {
    const id = document.querySelector('[data-form=opMaq]').dataset.id, nome = document.getElementById('om-n').value.trim();
    if (!nome) return toast('Informe o nome');
    const o = id ? byId(of('maq'), id) : novo({ t: 'maq' }); o.nome = nome; T.save(); closeModal(); T.render(false);
  };
  function mDc(id) {
    const c = id ? byId(of('dc'), id) : { data: hoje() }; if (!c) return;
    sheet('<h2>' + (id ? 'Compra de diesel' : 'Compra de diesel') + '</h2><form data-form="opDc" data-id="' + (id || '') + '">' + fld('dc-d', 'Data', c.data, { type: 'date' }) +
      '<div class="cfgrow">' + fld('dc-l', 'Litros', c.litros == null ? '' : String(c.litros).replace('.', ',')) + fld('dc-v', 'Valor total (R$)', c.valor == null ? '' : String(c.valor).replace('.', ',')) + '</div>' + fld('dc-f', 'Fornecedor (opcional)', c.forn || '', { txt: 1 }) +
      '<button class="btn block">Salvar</button>' + (id ? '<button type="button" class="btn line block" style="margin-top:8px;color:var(--red)" data-act="opDel" data-id="' + id + '">Excluir</button>' : '') + '</form>');
  }
  FORMS.opDc = () => {
    const id = document.querySelector('[data-form=opDc]').dataset.id, data = document.getElementById('dc-d').value, l = impNum(document.getElementById('dc-l').value), v = impNum(document.getElementById('dc-v').value);
    if (!data) return toast('Informe a data'); if (!(l > 0)) return toast('Informe os litros'); if (!(v > 0)) return toast('Informe o valor');
    const o = id ? byId(of('dc'), id) : novo({ t: 'dc' }); Object.assign(o, { data, litros: l, valor: r2(v), forn: document.getElementById('dc-f').value.trim() }); if (!o.forn) delete o.forn;
    catDiesel(); T.save(); closeModal(); T.render(false); toast('Compra salva');
  };
  function mDa(id) {
    const c = id ? byId(of('da'), id) : { data: hoje() }; if (!c) return;
    if (!maqs().length) { toast('Cadastre uma máquina primeiro (aba Cadastros)'); F.tab = 'cad'; T.render(false); return; }
    sheet('<h2>Abastecimento</h2><form data-form="opDa" data-id="' + (id || '') + '">' + fld('da-d', 'Data', c.data, { type: 'date' }) + selF('da-m', 'Máquina', opt(maqs()), c.maqId || '') +
      fld('da-l', 'Litros', c.litros == null ? '' : String(c.litros).replace('.', ',')) + '<p class="note" id="da-av" style="margin:0 0 10px"></p>' +
      '<button class="btn block">Salvar</button>' + (id ? '<button type="button" class="btn line block" style="margin-top:8px;color:var(--red)" data-act="opDel" data-id="' + id + '">Excluir</button>' : '') + '</form>');
    const di = dieselInfo(); document.getElementById('da-av').textContent = 'Estoque atual: ' + fmt(di.estoque, 0) + ' L';
  }
  FORMS.opDa = () => {
    const id = document.querySelector('[data-form=opDa]').dataset.id, data = document.getElementById('da-d').value, m = document.getElementById('da-m').value, l = impNum(document.getElementById('da-l').value);
    if (!data) return toast('Informe a data'); if (!m) return toast('Escolha a máquina'); if (!(l > 0)) return toast('Informe os litros');
    const o = id ? byId(of('da'), id) : novo({ t: 'da' }); Object.assign(o, { data, maqId: m, litros: l });
    catDiesel(); T.save(); closeModal(); T.render(false); toast('Abastecimento salvo');
  };

  const UNS = [['dose', 'dose'], ['mL', 'mL'], ['frasco', 'frasco'], ['un', 'unidade'], ['kg', 'kg'], ['g', 'g'], ['L', 'L']];
  const optP = () => prods().map(p => [p.id, p.nome + ' (' + p.un + ')']);
  const dec = v => v == null ? '' : String(v).replace('.', ',');
  const delB = id => id ? '<button type="button" class="btn line block" style="margin-top:8px;color:var(--red)" data-act="opDel" data-id="' + id + '">Excluir</button>' : '';
  function mSp(id) {
    const c = id ? byId(of('sp'), id) : { nome: '', un: 'dose' }; if (!c) return;
    sheet('<h2>' + (id ? 'Produto' : 'Novo produto') + '</h2><form data-form="opSp" data-id="' + (id || '') + '">' + fld('sp-n', 'Nome', c.nome, { txt: 1, ph: 'Ex.: Vacina aftosa' }) + selF('sp-u', 'Unidade', UNS, c.un || 'dose') + '<button class="btn block">Salvar</button>' + delB(id) + '</form>');
  }
  FORMS.opSp = () => {
    const id = document.querySelector('[data-form=opSp]').dataset.id, nome = document.getElementById('sp-n').value.trim(), un = document.getElementById('sp-u').value;
    if (!nome) return toast('Informe o nome');
    if (prods().some(p => p.id !== id && p.nome.toLowerCase() === nome.toLowerCase())) return toast('Já existe um produto com esse nome');
    const o = id ? byId(of('sp'), id) : novo({ t: 'sp' }); Object.assign(o, { nome, un }); catSan(); T.save(); closeModal(); T.render(false); toast('Produto salvo');
  };
  function mSc(id) {
    const c = id ? byId(of('sc'), id) : { data: hoje() }; if (!c) return;
    if (!prods().length) { toast('Cadastre um produto primeiro (+ Produto)'); return mSp(''); }
    sheet('<h2>Compra de sanidade</h2><form data-form="opSc" data-id="' + (id || '') + '">' + fld('sc-d', 'Data', c.data, { type: 'date' }) + selF('sc-p', 'Produto', optP(), c.prodId || prods()[0].id) +
      '<div class="cfgrow">' + fld('sc-q', 'Quantidade', dec(c.qtd)) + fld('sc-v', 'Valor total (R$)', dec(c.valor)) + '</div>' + fld('sc-f', 'Fornecedor (opcional)', c.forn || '', { txt: 1 }) + '<button class="btn block">Salvar</button>' + delB(id) + '</form>');
  }
  FORMS.opSc = () => {
    const id = document.querySelector('[data-form=opSc]').dataset.id, data = document.getElementById('sc-d').value, p = document.getElementById('sc-p').value, q = impNum(document.getElementById('sc-q').value), v = impNum(document.getElementById('sc-v').value);
    if (!data) return toast('Informe a data'); if (!(q > 0)) return toast('Informe a quantidade'); if (!(v > 0)) return toast('Informe o valor');
    const o = id ? byId(of('sc'), id) : novo({ t: 'sc' }); Object.assign(o, { data, prodId: p, qtd: q, valor: r2(v), forn: document.getElementById('sc-f').value.trim() }); if (!o.forn) delete o.forn;
    catSan(); T.save(); closeModal(); T.render(false); toast('Compra salva');
  };
  function mSs(id) {
    const c = id ? byId(of('ss'), id) : { data: hoje() }; if (!c) return;
    if (!prods().length) { toast('Cadastre um produto primeiro (+ Produto)'); return mSp(''); }
    sheet('<h2>Saída de sanidade</h2><form data-form="opSs" data-id="' + (id || '') + '">' + fld('ss-d', 'Data', c.data, { type: 'date' }) + selF('ss-p', 'Produto', optP(), c.prodId || prods()[0].id) +
      fld('ss-q', 'Quantidade usada', dec(c.qtd)) + '<p class="note" id="ss-av" style="margin:0 0 10px"></p>' + fld('ss-o', 'Observação (opcional)', c.obs || '', { txt: 1, ph: 'Ex.: vacinação do lote 4' }) + '<button class="btn block">Salvar</button>' + delB(id) + '</form>');
    ssAv();
  }
  function ssAv() {
    const el = document.getElementById('ss-av'), sel = document.getElementById('ss-p'); if (!el || !sel) return;
    const r = sanInfo().por.get(sel.value); el.textContent = r ? 'Estoque atual: ' + fmt(r.estoque, 2) + ' ' + r.p.un + (r.pm ? ' · ' + brl(r.pm) + '/' + r.p.un : '') : '';
  }
  FORMS.opSs = () => {
    const id = document.querySelector('[data-form=opSs]').dataset.id, data = document.getElementById('ss-d').value, p = document.getElementById('ss-p').value, q = impNum(document.getElementById('ss-q').value);
    if (!data) return toast('Informe a data'); if (!(q > 0)) return toast('Informe a quantidade');
    const o = id ? byId(of('ss'), id) : novo({ t: 'ss' }); Object.assign(o, { data, prodId: p, qtd: q, obs: document.getElementById('ss-o').value.trim() }); if (!o.obs) delete o.obs;
    catSan(); T.save(); closeModal(); T.render(false); toast('Saída salva');
  };

  /* ---------- ações ---------- */
  Object.assign(ACT, {
    opTab: d => { F.tab = d.id; T.render(false); },
    opFech: d => { const x = of('fech').find(f => f.mes === d.id); if (x) T.S.op.docs = D().filter(o => o !== x); else novo({ t: 'fech', mes: d.id }); T.save(); T.render(false); toast(x ? 'Mês reaberto: volta ao valor fixo' : 'Mês fechado'); },
    opLanNovo: () => mLan(''), opLanEd: d => mLan(d.id),
    opCatNova: () => mCat(''), opCatEd: d => mCat(d.id),
    opMaqNova: () => mMaq(''), opMaqEd: d => mMaq(d.id),
    opSpNovo: () => mSp(''), opSpEd: d => mSp(d.id), opScNovo: () => mSc(''), opScEd: d => mSc(d.id), opSsNovo: () => mSs(''), opSsEd: d => mSs(d.id),
    opDcNovo: () => mDc(''), opDcEd: d => mDc(d.id), opDaNovo: () => mDa(''), opDaEd: d => mDa(d.id),
    opCatSug: () => { SUG.forEach(n => { if (!cats().some(c => c.nome === n)) { const o = novo({ t: 'cat', nome: n }); if (/diesel/i.test(n)) o.diesel = true; if (/^sanidade/i.test(n)) o.san = true; if (/^investimento/i.test(n)) o.inv = true; } }); T.save(); T.render(false); toast('Categorias criadas'); },
    opDel: (d, t) => {
      if (!t.dataset.arm) { t.dataset.arm = 1; t.textContent = 'Toque de novo para confirmar'; return; }
      const o = byId(D(), d.id); if (!o) return;
      if (o.t === 'cat' && (of('lan').some(l => l.catId === o.id) || o.diesel && of('da').length || o.san && of('ss').length)) { toast('Esta categoria tem lançamentos. Mude os lançamentos antes.'); delete t.dataset.arm; t.textContent = 'Excluir'; return; }
      if (o.t === 'sp' && (of('sc').some(x => x.prodId === o.id) || of('ss').some(x => x.prodId === o.id))) { toast('Este produto tem compras ou saídas. Exclua esses lançamentos antes.'); delete t.dataset.arm; t.textContent = 'Excluir'; return; }
      if (o.t === 'maq' && of('da').some(a => a.maqId === o.id)) { toast('Esta máquina tem abastecimentos. Exclua ou mude antes.'); delete t.dataset.arm; t.textContent = 'Excluir'; return; }
      T.S.op.docs = D().filter(x => x.id !== d.id); T.save(); closeModal(); T.render(false); toast('Excluído');
    }
  });
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'ol-c') { const c = byId(of('cat'), e.target.value), n = document.getElementById('ol-n'); if (c && c.inv && n && (num(n.value) || 1) <= 1) n.value = String(MESES_INV); } if (e.target && e.target.id === 'ss-p') ssAv(); if (e.target && e.target.id === 'op-mes') { F.mes = e.target.value; T.render(false); } });

  window.OP = { bar, opAnimal, opReal, docs: () => D(), rev: () => 1 };
  T.TITULOS.op = 'Custo operacional'; T.TITULOS.geral = 'Painel geral';
  T.render(false);
})();
