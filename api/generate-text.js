export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'Método no permitido'});
  if (process.env.ENABLE_PUBLIC_AI !== 'true') return res.status(503).json({error:'Generación desactivada hasta configurar límites de uso y control de acceso.'});
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt || prompt.length > 2000) return res.status(400).json({error:'Escribe un mensaje de 1 a 2000 caracteres.'});
  const key = process.env.CLAVE_API_DE_OPENAI || process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({error:'Falta configurar la clave privada de OpenAI en Vercel.'});
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{Authorization:`Bearer ${key}`, 'Content-Type':'application/json'},
        body:JSON.stringify({model:process.env.OPENAI_MODEL || 'gpt-4o-mini', max_tokens:800,
          messages:[{role:'user',content:prompt}]}),
        signal:controller.signal
      });
    } finally { clearTimeout(timeout); }
    const data = await response.json();
    if (!response.ok) {
      console.error('OpenAI error status', response.status);
      return res.status(502).json({error:'OpenAI no pudo completar la solicitud. Comprueba la configuración y el saldo.'});
    }
    return res.status(200).json({text:data.choices?.[0]?.message?.content || ''});
  } catch(error) {
    console.error('OpenAI request failed', error.name);
    return res.status(502).json({error:'No se pudo conectar con OpenAI. Inténtalo de nuevo.'});
  }
}
