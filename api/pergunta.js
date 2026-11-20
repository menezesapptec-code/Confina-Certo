// Função da Vercel: recebe a pergunta do app, confere o login (Firebase) e chama o Claude.
// Variáveis de ambiente (Vercel > Settings > Environment Variables):
//   ANTHROPIC_API_KEY  (obrigatória)   ANTHROPIC_MODEL (opcional, padrão claude-sonnet-5-5)
const REGRAS = require('./regras.js');
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAcceP2bbrjFOsRk4PfliLxqjCYdY-bwys';

async function quemE(token) {
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: token })
  });
  if (!r.ok) return null;
  const j = await r.json();
  return (j.users && j.users[0]) || null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ erro: 'Suporte ainda não configurado (falta a chave).' });
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ erro: 'Entre na sua conta para usar o suporte.' });
  let usuario = null;
  try { usuario = await quemE(token); } catch (e) { usuario = null; }
  if (!usuario) return res.status(401).json({ erro: 'Sessão inválida. Saia e entre de novo.' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const pergunta = String(b.pergunta || '').slice(0, 1500).trim();
  if (!pergunta) return res.status(400).json({ erro: 'Escreva a pergunta.' });
  const fatos = JSON.stringify(b.fatos || {}).slice(0, 60000);
  const hist = (Array.isArray(b.historico) ? b.historico : []).slice(-6)
    .filter(m => m && (m.r === 'u' || m.r === 'a') && typeof m.t === 'string')
    .map(m => ({ role: m.r === 'u' ? 'user' : 'assistant', content: m.t.slice(0, 2500) }));
  while (hist.length && hist[0].role !== 'user') hist.shift();
  // evita dois papéis iguais seguidos
  const msgs = [];
  hist.forEach(m => { if (!msgs.length || msgs[msgs.length - 1].role !== m.role) msgs.push(m); });
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
  msgs.push({ role: 'user', content: 'FATOS DA FAZENDA (dados do sistema agora):\n' + fatos + '\n\nPERGUNTA:\n' + pergunta });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 900,
        system: [{ type: 'text', text: REGRAS, cache_control: { type: 'ephemeral' } }],
        messages: msgs
      })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ erro: 'O suporte não respondeu agora. Tente de novo em instantes.' });
    const txt = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    return res.status(200).json({ resposta: txt || 'Não consegui responder. Tente reformular a pergunta.' });
  } catch (e) {
    return res.status(502).json({ erro: 'Falha de conexão com o suporte.' });
  }
};
