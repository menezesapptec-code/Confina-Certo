/* ===== Suporte com IA — módulo separado do TIP Control =====
   Só LÊ os dados (fatos resumidos) e pergunta ao servidor (/api/pergunta). Não altera nada. */
(function () {
  'use strict';
  const T = window.TIP;
  if (!T || !T.diagSuporte) return;
  const { esc, toast, VIEWS, ACT, head } = T;
  const SUPORTE_WA = ''; /* número do suporte com DDI+DDD (ex.: 5566999999999). Vazio = só compartilha/baixa o arquivo */

  let CH = [];          /* conversa: {r:'u'|'a', t} */
  let BUSY = false, TXT = '';
  const SUG = ['Por que o consumo real do cocho está alto num pasto?', 'Por que um animal está sem custo de nutrição?', 'Como funciona o cálculo da cobrança?', 'Por que apareceu "sobra maior que o trato"?'];

  const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split(/\n{2,}/).map(p => {
    const ls = p.split('\n');
    if (ls.every(l => /^\s*[-•*]\s+/.test(l))) return '<ul style="margin:6px 0 6px 18px">' + ls.map(l => '<li>' + l.replace(/^\s*[-•*]\s+/, '') + '</li>').join('') + '</ul>';
    return '<p style="margin:6px 0">' + ls.join('<br>') + '</p>';
  }).join('');

  VIEWS.sup = () => {
    let h = head('Suporte', 'Pergunte o que está acontecendo no sistema. A resposta usa os dados da sua fazenda.', '');
    h += '<div class="card"><div id="sp-chat">' + (CH.length ? CH.map(m => m.r === 'u'
      ? '<div style="margin:10px 0 10px 30px;padding:10px 12px;border-radius:12px;background:var(--green);color:#f4efe6">' + esc(m.t).replace(/\n/g, '<br>') + '</div>'
      : '<div style="margin:10px 30px 10px 0;padding:6px 12px;border-radius:12px;border:1px solid var(--line)">' + md(m.t) + '</div>').join('')
      : '<p class="note" style="margin:0 0 8px">Exemplos de pergunta (toque para usar):</p><div class="chips" style="flex-wrap:wrap">' + SUG.map((s, i) => '<button class="chip" data-act="spSug" data-id="' + i + '">' + esc(s) + '</button>').join('') + '</div>')
      + (BUSY ? '<p class="note" style="margin:10px 0">Analisando os dados da fazenda…</p>' : '') + '</div>'
      + '<textarea id="sp-q" rows="3" placeholder="Escreva sua dúvida. Ex.: o animal 457 está sem nutrição no lote Cobra, por quê?" style="width:100%;margin-top:10px;box-sizing:border-box">' + esc(TXT) + '</textarea>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn" data-act="spEnviar"' + (BUSY ? ' disabled' : '') + '>Perguntar</button>'
      + '<button class="btn sec" data-act="spSuporte">Enviar para o suporte</button>'
      + (CH.length ? '<button class="btn line" data-act="spLimpa">Nova conversa</button>' : '') + '</div>'
      + '<p class="note" style="margin:10px 0 0">A resposta é uma explicação automática com base nos seus dados e pode errar. Se parecer erro do sistema, toque em <b>Enviar para o suporte</b>: o diagnóstico vai junto para a equipe corrigir.</p></div>';
    return h;
  };

  const redesenha = () => { const q = document.getElementById('sp-q'); if (q) TXT = q.value; T.render(false); const c = document.getElementById('sp-chat'); if (c && c.lastElementChild) c.lastElementChild.scrollIntoView({ block: 'nearest' }); };

  document.addEventListener('input', e => { if (e.target && e.target.id === 'sp-q') TXT = e.target.value; });

  async function perguntar() {
    const q = document.getElementById('sp-q'); const txt = ((q && q.value) || TXT || '').trim();
    if (!txt || BUSY) return toast(txt ? 'Aguarde a resposta' : 'Escreva a pergunta');
    BUSY = true; const antes = CH.slice(); CH.push({ r: 'u', t: txt }); TXT = ''; redesenha();
    try {
      const token = await T.getToken();
      if (!token) throw new Error('Entre na sua conta (modo online) para usar o suporte.');
      const r = await fetch('/api/pergunta', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ pergunta: txt, historico: antes, fatos: T.diagSuporte(txt) }) });
      let j = {}; try { j = await r.json(); } catch (e) { }
      if (!r.ok) throw new Error(j.erro || (r.status === 404 ? 'Suporte ainda não está ativo neste endereço.' : 'O suporte não respondeu agora.'));
      CH.push({ r: 'a', t: j.resposta });
    } catch (e) {
      CH.push({ r: 'a', t: 'Não consegui responder: ' + (e.message || e) });
    }
    BUSY = false; redesenha();
  }

  async function enviarSuporte() {
    const ult = [...CH].reverse().find(m => m.r === 'u');
    const rel = { gerado: new Date().toISOString(), conversa: CH, diagnostico: T.diagSuporte(ult ? ult.t : ''), dadosCompletos: null };
    const nome = 'suporte-' + (T.S.cfg && T.S.cfg.fazenda ? String(T.S.cfg.fazenda).toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'fazenda') + '-' + T.hoje() + '.json';
    const blob = new Blob([JSON.stringify(rel, null, 1)], { type: 'application/json' });
    const resumo = 'Suporte TIP Control' + (ult ? '\nDúvida: ' + ult.t : '') + '\n(segue o arquivo do diagnóstico)';
    try {
      const f = new File([blob], nome, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Suporte TIP Control', text: resumo }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    toast('Arquivo baixado. Envie para o suporte pelo WhatsApp.');
    if (SUPORTE_WA) setTimeout(() => window.open('https://wa.me/' + SUPORTE_WA + '?text=' + encodeURIComponent(resumo), '_blank'), 500);
  }

  Object.assign(ACT, {
    spEnviar: perguntar,
    spSuporte: enviarSuporte,
    spLimpa: () => { CH = []; TXT = ''; BUSY = false; T.render(false); },
    spSug: (d) => { TXT = SUG[+(d.id || d.dataset && d.dataset.id)] || ''; T.render(false); }
  });
  T.TITULOS.sup = 'Suporte';
})();
