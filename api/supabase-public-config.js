// Only public configuration may be returned from this endpoint.
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) || !key.startsWith('sb_publishable_')) {
    return res.status(503).json({ error: 'Configuración pública de Supabase incompleta' });
  }
  return res.status(200).json({ supabaseUrl: url.replace(/\/$/, ''), supabasePublishableKey: key });
};
