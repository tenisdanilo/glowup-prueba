export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'Método no permitido'});
  if (process.env.ENABLE_PUBLIC_AI !== 'true') return res.status(503).json({error:'Generación desactivada hasta configurar límites de uso y control de acceso.'});
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt || prompt.length > 1200) return res.status(400).json({error:'Describe la imagen en 1 a 1200 caracteres.'});
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({error:'Falta configurar GEMINI_API_KEY en Vercel.'});
  const model = 'gemini-3.1-flash-image';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method:'POST',
        headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['TEXT','IMAGE']}}),
        signal:controller.signal
      });
    } finally { clearTimeout(timeout); }
    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini error status',response.status);
      return res.status(502).json({error:'Gemini no ha podido generar la imagen. Revisa acceso, cuota y facturación.'});
    }
    const item = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    if (!item) return res.status(502).json({error:'Gemini no devolvió ninguna imagen.'});
    const mime = item.inlineData.mimeType || 'image/png';
    if (!['image/png','image/jpeg','image/webp'].includes(mime)) return res.status(502).json({error:'Formato de imagen no compatible.'});
    return res.status(200).json({image:`data:${mime};base64,${item.inlineData.data}`});
  } catch(error) {
    console.error('Gemini request failed',error.name);
    return res.status(502).json({error:'No se pudo conectar con Gemini. Inténtalo más tarde.'});
  }
}
