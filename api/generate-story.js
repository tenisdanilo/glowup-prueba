// GlowUp Studio AI — prototipo protegido de Idea a vídeo.
// Mantener ENABLE_PUBLIC_AI=false hasta realizar pruebas controladas.
const json=(res,status,payload)=>res.status(status).json(payload);
module.exports = async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return json(res,405,{error:'Método no permitido'});
 if(process.env.ENABLE_PUBLIC_AI!=='true')return json(res,503,{error:'Generación desactivada hasta configurar límites de uso y control de acceso.'});
 const apiKey=(process.env.CLAVE_API_DE_OPENAI||'').trim();
 if(!apiKey)return json(res,503,{error:'Falta configurar CLAVE_API_DE_OPENAI en Vercel.'});
 const body=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return {}}})():(req.body||{});
 const topic=typeof body.topic==='string'?body.topic.trim():'';
 const validFormats=['documental','historia','educativo','short'];
 const validTones=['cinematografico','cercano','sereno','dinamico'];
 const format=validFormats.includes(body.format)?body.format:'documental';
 const tone=validTones.includes(body.tone)?body.tone:'cinematografico';
 const duration=[3,5,10,15].includes(Number(body.duration))?Number(body.duration):5;
 if(topic.length<10||topic.length>1800)return json(res,400,{error:'Escribe una idea entre 10 y 1800 caracteres.'});
 const words={3:[360,450],5:[600,750],10:[1200,1500],15:[1800,2200]}[duration];
 const instructions=`Eres un guionista documental profesional y director creativo especializado en YouTube en español. Debes entregar un GUION LISTO PARA NARRAR, no un esquema ni una lista de consejos.
REGLAS ESTRICTAS:
- Escribe una NARRACIÓN COMPLETA, con frases literarias naturales, acciones y detalles concretos; evita fórmulas vacías, saludos al espectador, resúmenes del propio vídeo, y frases como "en este vídeo exploraremos".
- Abre directamente en una situación visual concreta e intrigante; mantén un hilo narrativo fluido y un cierre satisfactorio.
- Para cada escena, escribe por separado: número y duración aproximada; NARRACIÓN (párrafos completos que puedan leerse literalmente en voz alta); IMAGEN EN PANTALLA (descripción específica); PROMPT VISUAL (fotografía/ilustración cinematográfica, escenario, época, encuadre, luz, personajes y continuidad visual). Evita repetir la misma imagen en todas las escenas.
- Solo las palabras dentro de NARRACIÓN cuentan para el objetivo de longitud; no sustituyas la narración por viñetas o sinopsis.
- Si hay historia, ciencia o hechos reales: no inventes citas textuales, personas documentadas, fechas, ni eventos; separa expresamente en una sección final HECHOS A VERIFICAR las afirmaciones inciertas. Puedes usar una escena cotidiana plausible como reconstrucción, pero identifícala como recreación, no como un suceso comprobado.
- Mantén los mismos personajes y rasgos entre escenas cuando reaparezcan. No prometas generar vídeos ni imágenes: describes cómo producirlos.
- Termina con una sección titulada 'COMPROBACIÓN FINAL' que indique el número aproximado de palabras de narración, los puntos a verificar y si hay recreaciones.
- No incluyas código, instrucciones de llamadas a API ni explicaciones técnicas.
La prioridad es que el creador pueda copiar directamente cada bloque de NARRACIÓN en una herramienta de voz.`;
 const prompt=`IDEA DEL USUARIO:\n${topic}\n\nFORMATO: ${format}\nDURACIÓN: ${duration} minutos\nESTILO: ${tone}\n
Objetivo de extensión: ENTRE ${words[0]} Y ${words[1]} PALABRAS SOLO DE NARRACIÓN (sin contar títulos, prompts ni notas). Elige suficientes escenas para sostener esa duración. Entrega, en este orden: TÍTULO; NARRACIÓN POR ESCENAS con tiempos, texto íntegro para voz e indicaciones visuales; CIERRE dentro de la última escena; HECHOS A VERIFICAR; COMPROBACIÓN FINAL. Escribe todo en español. Si necesitas ahorrar espacio, acorta las indicaciones visuales, pero NUNCA conviertas la narración en un esquema.`;
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),90000);
 try{
  const response=await fetch('https://api.openai.com/v1/chat/completions',{
   method:'POST',headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
   body:JSON.stringify({model:'gpt-4o-mini',temperature:0.7,max_tokens:({3:3400,5:5100,10:9300,15:13500})[duration],messages:[{role:'system',content:instructions},{role:'user',content:prompt}]}),signal:controller.signal
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){
   console.error('OpenAI story request failed',{status:response.status,code:data?.error?.code||'unknown'});
   return json(res,502,{error:response.status===429?'OpenAI ha alcanzado un límite de cuota. Comprueba tu saldo y límites.':'OpenAI no pudo preparar el guion (HTTP '+response.status+'). Revisa los registros de Vercel.'});
  }
  const story=data?.choices?.[0]?.message?.content;
  if(typeof story!=='string'||!story.trim())return json(res,502,{error:'OpenAI no devolvió un guion válido.'});
  return json(res,200,{story:story.trim()});
 }catch(error){
  console.error('Story connection failed',{type:error?.name||'unknown'});
  return json(res,502,{error:error?.name==='AbortError'?'La generación tardó demasiado. Vuelve a intentar más tarde.':'Error de conexión al generar el guion. Consulta los registros de Vercel.'});
 }finally{clearTimeout(timer)}
}
