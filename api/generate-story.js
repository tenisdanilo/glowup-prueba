// GlowUp Studio AI — Idea a video V4. CommonJS para Vercel.
// Mantener ENABLE_PUBLIC_AI=false fuera de pruebas controladas.
const respond = (res, status, payload) => res.status(status).json(payload);
const ranges = {3:[360,450],5:[600,750],10:[1200,1500],15:[1800,2200]};

// Cuenta exclusivamente la narracion, nunca las descripciones visuales.
function extractNarration(story) {
  const lines = story.split(/\r?\n/);
  let inNarration = false;
  const paragraphs = [];
  for (const line of lines) {
    const cleaned = line.replace(/\*\*/g,'').trim();
    if (/^(?:NARRACI[ÓO]N|VOZ EN OFF)\s*:/i.test(cleaned)) {
      inNarration = true;
      const after = cleaned.replace(/^(?:NARRACI[ÓO]N|VOZ EN OFF)\s*:/i,'').trim();
      if (after) paragraphs.push(after);
      continue;
    }
    if (/^(?:IMAGEN EN PANTALLA|PROMPT VISUAL|ESCENA\s+\d+|HECHOS A VERIFICAR|COMPROBACI[ÓO]N FINAL|T[ÍI]TULO|NOTA DE RIGOR|FUENTES A CONSULTAR)\b/i.test(cleaned)) {
      inNarration = false;
    }
    if (inNarration && cleaned && !/^[-=]{3,}$/.test(cleaned)) paragraphs.push(cleaned);
  }
  return paragraphs.join(' ');
}
function countWords(value) {
  return (value.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) || []).length;
}

// Comprobaciones locales: no generan llamadas adicionales a la API.
function auditStory(story, words, minimum, maximum) {
  const checks=[];
  const matches=(pattern)=>[...story.matchAll(pattern)].length;
  const scenes=matches(/^\s*\*{0,2}ESCENA\s+\d+/gim);
  const narrations=matches(/^\s*\*{0,2}(?:NARRACI[ÓO]N|VOZ EN OFF)\s*:/gim);
  const images=matches(/^\s*\*{0,2}IMAGEN EN PANTALLA\s*:/gim);
  const prompts=matches(/^\s*\*{0,2}PROMPT VISUAL\s*:/gim);
  if (words===0) checks.push('No se han podido identificar los bloques de narración.');
  else if (words<minimum) checks.push(`Narración insuficiente: ${words} palabras; objetivo mínimo ${minimum}.`);
  else if (words>maximum) checks.push(`Narración demasiado larga: ${words} palabras; máximo ${maximum}.`);
  if (!scenes) checks.push('No se detectaron escenas numeradas.');
  if (scenes && narrations!==scenes) checks.push(`Estructura: ${scenes} escenas y ${narrations} encabezados de narración.`);
  if (scenes && images!==scenes) checks.push(`Estructura: ${scenes} escenas y ${images} secciones de imagen.`);
  if (scenes && prompts!==scenes) checks.push(`Estructura: ${scenes} escenas y ${prompts} prompts visuales.`);
  if (!/HECHOS A VERIFICAR/i.test(story)) checks.push('Falta la sección de hechos a verificar.');
  if (!/FUENTES A CONSULTAR/i.test(story)) checks.push('Falta la sección de fuentes a consultar.');
  if (!/CONTEXTO Y RECREACIONES/i.test(story)) checks.push('Falta identificar el contexto y las recreaciones.');
  return checks;
}

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return respond(res,405,{error:'Método no permitido'});
  if (process.env.ENABLE_PUBLIC_AI !== 'true') return respond(res,503,{error:'Generación desactivada. Activa temporalmente la IA solo para pruebas protegidas.'});
  const apiKey=(process.env.CLAVE_API_DE_OPENAI || '').trim();
  if (!apiKey) return respond(res,503,{error:'Falta configurar CLAVE_API_DE_OPENAI en Vercel.'});

  const body=typeof req.body==='string' ? (()=>{try{return JSON.parse(req.body)}catch{return {}}})() : (req.body || {});
  const topic=typeof body.topic==='string' ? body.topic.trim() : '';
  if (topic.length < 10 || topic.length > 1800) return respond(res,400,{error:'Escribe una idea entre 10 y 1800 caracteres.'});
  const format=['documental','historia','educativo','short'].includes(body.format)?body.format:'documental';
  const tone=['cinematografico','cercano','sereno','dinamico'].includes(body.tone)?body.tone:'cinematografico';
  const duration=[3,5,10,15].includes(Number(body.duration))?Number(body.duration):5;
  const [minimum,maximum]=ranges[duration];

  const instructions=`Eres guionista documental y editor de rigor factual para creadores de YouTube en español. Entrega un GUION COMPLETO LISTO PARA NARRAR, nunca un esquema. Respeta estos requisitos:
1. APERTURA: comienza en una acción observable, sorprendente y concreta que plantee una pregunta real o contraste verificable. Evita introducciones genéricas del amanecer, frases motivacionales, saludos, "imagina esto", "detente un segundo", "en este vídeo" y suspense fabricado.
2. NARRACIÓN: planifica primero la longitud total y distribuye suficientes palabras por escena. Redacta párrafos completos con acciones, detalles específicos, progresión dramática y transiciones humanas. Evita párrafos vacíos, resúmenes y moralejas abstractas. Las palabras de narración deben sumar ENTRE ${minimum} Y ${maximum}; las indicaciones para imágenes no cuentan. Ajusta cantidad y longitud de escenas.
3. RIGOR: si es historia, fija o declara el periodo y contexto elegidos. No atribuyas a personajes ficticios cargos, privilegios o eventos incompatibles con su condición; no presentes diálogos inventados como citas históricas. Distingue hechos consolidados, generalizaciones y recreaciones. No inventes fuentes, personas históricas, fechas ni citas.
4. PERSONAJES: si usas personajes ficticios, identifícalos AL INICIO como "recreación ficticia basada en prácticas documentadas". Repite rasgos, ropa y estatus social de forma coherente. Evita mezclar experiencias de diferentes clases sociales como si fueran típicas de toda la sociedad.
5. VISUALES: cada escena debe describir lo que la cámara mostraría, con época, arquitectura, materiales, vestimenta, encuadre, luz y continuidad de personajes. Los prompts deben ser concretos y útiles para generar imágenes 16:9; no prometas que ya se han generado.
6. FORMATO FIJO (sin tablas): TÍTULO; CONTEXTO Y RECREACIONES (1-3 líneas); luego escenas numeradas y temporizadas. En CADA escena coloca exactamente los encabezados 'NARRACIÓN:', 'IMAGEN EN PANTALLA:' y 'PROMPT VISUAL:' en líneas propias, seguidos de sus párrafos. Finaliza con 'HECHOS A VERIFICAR:' incluyendo afirmaciones específicas y 'FUENTES A CONSULTAR:' con tipos de fuentes, sin inventar referencias. NO declares tu propio recuento de palabras; el sistema lo calculará.
7. Escribe todo en español. No incluyas código, instrucciones de API ni explicaciones técnicas. Prioriza la narración sobre los prompts si el espacio es limitado.`;
  const prompt=`IDEA: ${topic}\nFORMATO: ${format}\nDURACIÓN SOLICITADA: ${duration} minutos\nESTILO: ${tone}\nEXTENSIÓN OBLIGATORIA DE NARRACIÓN: ${minimum}-${maximum} palabras (solo bloques NARRACIÓN). Narra lo suficiente para ese tiempo. Si el tema es histórico, delimita el periodo y marca claramente las recreaciones.`;

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),90000);
  try {
    const response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'gpt-4o-mini',temperature:0.55,max_tokens:({3:3400,5:5100,10:9300,15:13500})[duration],messages:[{role:'system',content:instructions},{role:'user',content:prompt}]}),
      signal:controller.signal
    });
    const data=await response.json().catch(()=>null);
    if (!response.ok) {
      console.error('OpenAI story failed',{status:response.status,code:data?.error?.code||'unknown'});
      return respond(res,502,{error:response.status===429?'Límite o cuota de OpenAI alcanzado. Revisa el saldo y los límites.':`OpenAI no pudo preparar el guion (HTTP ${response.status}). Revisa los registros de Vercel.`});
    }
    const story=data?.choices?.[0]?.message?.content;
    if (typeof story!=='string'||!story.trim()) return respond(res,502,{error:'OpenAI no devolvió un guion válido.'});
    const narration=extractNarration(story);
    const words=countWords(narration);
    const footer=words===0?'AVISO DE CONTROL: No se pudieron identificar los bloques NARRACIÓN para contar las palabras.':
      words<minimum?`AVISO DE DURACIÓN: se han contado ${words} palabras de narración, menos de las ${minimum} mínimas previstas. El guion probablemente será demasiado corto.`:
      words>maximum?`AVISO DE DURACIÓN: se han contado ${words} palabras de narración, más de las ${maximum} máximas previstas. El guion probablemente será demasiado largo.`:
      `CONTROL DE DURACIÓN: ${words} palabras de narración contadas por el servidor; dentro del objetivo de ${minimum}-${maximum} palabras.`;
    const checks=auditStory(story,words,minimum,maximum);
    const audit=checks.length ? `CONTROL DE CALIDAD (revisión necesaria):\n- ${checks.join('\n- ')}` : 'CONTROL DE CALIDAD: estructura y extensión superan las comprobaciones automáticas.';
    const result=`${story.trim()}\n\n---\n${footer}\n\n${audit}\nNota: Estas comprobaciones no certifican la exactitud histórica ni la calidad literaria; contrasta el contenido con fuentes fiables antes de publicar.`;
    return respond(res,200,{story:result});
  } catch(error) {
    console.error('Story connection failed',{type:error?.name||'unknown'});
    return respond(res,502,{error:error?.name==='AbortError'?'La generación superó el tiempo máximo de espera.':'Error de conexión al generar el guion. Consulta los registros de Vercel.'});
  } finally {clearTimeout(timer);}
};
