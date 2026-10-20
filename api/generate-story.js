export default async function handler(req, res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
 if(process.env.ENABLE_PUBLIC_AI!=='true')return res.status(503).json({error:'La IA está desactivada en esta versión de pruebas.'});
 const {topic,format,duration,tone}=req.body||{};
 const validFormats=['documental','historia','educativo','short'],validTones=['cinematografico','cercano','sereno','dinamico'];
 if(typeof topic!=='string'||topic.trim().length<10||topic.length>1800||!validFormats.includes(format)||!validTones.includes(tone)||![3,5,10,15].includes(duration))return res.status(400).json({error:'Revisa la idea y las opciones seleccionadas.'});
 const key=process.env.CLAVE_API_DE_OPENAI||process.env.OPENAI_API_KEY;
 if(!key)return res.status(503).json({error:'Falta configurar OpenAI.'});
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
 try {
  const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',temperature:0.65,max_tokens:2600,messages:[
   {role:'system',content:'Eres guionista audiovisual especializado en vídeos narrados de YouTube en español. Entrega un PLAN DE PRODUCCIÓN, no finjas crear un vídeo. Responde con texto plano legible, encabezados sencillos, sin Markdown complejo. Incluye: 1) TÍTULO y gancho inicial; 2) SINOPSIS; 3) ESTRUCTURA por escenas numeradas (hasta 8), cada escena con duración estimada, texto de narración concreto, descripción de imagen para IA y sugerencia de montaje; 4) CIERRE; 5) LISTA DE RECURSOS. Mantén la duración orientativa, señala que el guion es un primer borrador sujeto a revisión, no inventes citas o hechos cuando no estés seguro.'},
   {role:'user',content:`Idea: ${topic.trim()}\nFormato: ${format}\nDuración aproximada: ${duration} minutos\nEstilo: ${tone}. Evita prometer un vídeo final: entrega guion y plan de escenas.`}
  ]})});
  const data=await response.json();if(!response.ok){console.error('Story OpenAI status',response.status);return res.status(502).json({error:'El servicio de guiones no respondió correctamente.'})}
  return res.status(200).json({story:data.choices?.[0]?.message?.content||''});
 } catch(e){console.error('Story backend failure',e.name);return res.status(502).json({error:'No se ha podido conectar con OpenAI.'})}finally{clearTimeout(timer)}
}
