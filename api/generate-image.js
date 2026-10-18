export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({error:'Método no permitido'});
  if (process.env.ENABLE_PUBLIC_AI !== 'true') return res.status(503).json({error:'Generación desactivada para evitar costes.'});
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt || prompt.length > 1200) return res.status(400).json({error:'Escribe una descripción de 1 a 1200 caracteres.'});
  const originalKey = process.env.GEMINI_API_KEY || '';
  // Evita saltos de línea y espacios accidentales al copiar claves desde Word.
  const key = originalKey.replace(/\s+/g, '');
  if (!key) return res.status(503).json({error:'Falta GEMINI_API_KEY en la configuración.'});
  if (!/^[\x21-\x7E]+$/.test(key)) {
    console.error('Gemini configuration error: API key contains non-ASCII characters');
    return res.status(503).json({error:'La clave de Gemini contiene caracteres no válidos. Revísala en Vercel.'});
  }
  const model = 'gemini-2.5-flash-image';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {'Content-Type':'application/json', 'x-goog-api-key': key},
      body: JSON.stringify({
        contents: [{parts:[{text:prompt}]}],
        generationConfig:{responseModalities:['IMAGE']}
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiCode = String(data?.error?.status || 'unknown').slice(0,70);
      console.error('Gemini API HTTP error', {status:response.status, apiCode});
      return res.status(502).json({error:`Gemini respondió HTTP ${response.status} (${apiCode}). Revisa modelo, permisos o cuota.`});
    }
    const inline = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
    if (!inline) {
      console.error('Gemini response has no image', {finishReason:data.candidates?.[0]?.finishReason || 'unknown'});
      return res.status(502).json({error:'Gemini respondió, pero no devolvió ninguna imagen.'});
    }
    const mime = inline.mimeType || 'image/png';
    if (!['image/png','image/jpeg','image/webp'].includes(mime)) return res.status(502).json({error:'Formato de imagen no compatible.'});
    return res.status(200).json({image:`data:${mime};base64,${inline.data}`});
  } catch(error) {
    // Solo diagnóstico técnico; nunca registra la clave ni la petición completa.
    console.error('Gemini network failure', {
      name: String(error?.name || 'unknown').slice(0,50),
      message: String(error?.message || 'unknown').slice(0,160),
      causeCode: String(error?.cause?.code || 'none').slice(0,70)
    });
    return res.status(502).json({error:'La conexión con Gemini falló. Consulta los registros de Vercel para ver el motivo técnico.'});
  } finally {
    clearTimeout(timeout);
  }
}
