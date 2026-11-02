// GlowUp V7 — ampliación voluntaria de un guion. No se activa automáticamente.
const ranges={3:[360,450],5:[600,750],10:[1200,1500],15:[1800,2200]};
const respond=(res,status,value)=>res.status(status).json(value);
function countWords(s){return (s.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length;}
function narrationOf(s){const lines=s.split(/\r?\n/);let active=false;const chunks=[];for(const line of lines){const t=line.replace(/\*\*/g,'').trim();if(/^(NARRACI[ÓO]N|VOZ EN OFF)\s*:/i.test(t)){active=true;const p=t.replace(/^(NARRACI[ÓO]N|VOZ EN OFF)\s*:/i,'').trim();if(p)chunks.push(p);continue;}if(/^(ESCENA\s+\d+|IMAGEN EN PANTALLA|PROMPT VISUAL|HECHOS A VERIFICAR|FUENTES A CONSULTAR|CONTROL DE CALIDAD|AVISO DE DURACI[ÓO]N|CONTROL DE DURACI[ÓO]N|Nota:|---)/i.test(t)){active=false;}if(active&&t)chunks.push(t);}return chunks.join(' ');}
function stripAudit(s){return s.split(/\n\s*---\s*\n/)[0].trim();}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return respond(res,405,{error:'Método no permitido'});
 if(process.env.ENABLE_PUBLIC_AI!=='true')return respond(res,503,{error:'Generación desactivada para proteger los costes.'});
 const key=(process.env.CLAVE_API_DE_OPENAI||'').trim();if(!key)return respond(res,503,{error:'No está configurada la clave de OpenAI.'});
 const body=typeof req.body==='string'?(()=>{try{return JSON.parse(req.body)}catch{return {}}})():req.body||{};
 const duration=[3,5,10,15].includes(Number(body.duration))?Number(body.duration):5;
 const mode=body.mode==='creativo'?'creativo':'riguroso';
 const story=typeof body.story==='string'?stripAudit(body.story):'';
 if(story.length<150||story.length>42000)return respond(res,400,{error:'El guion debe tener entre 150 y 42000 caracteres.'});
 const [minimum,maximum]=ranges[duration];
 const before=countWords(narrationOf(story));
 if(!before)return respond(res,400,{error:'No se identificaron bloques NARRACIÓN en el guion.'});
 if(before>=minimum)return respond(res,400,{error:'El guion ya alcanza la duración mínima; no necesita ampliación.'});
 const target=Math.round(minimum+(maximum-minimum)*0.6);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{
  const rr=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({model:'gpt-4o-mini',temperature:0.35,max_tokens:({3:3600,5:5500,10:11000,15:15000})[duration],messages:[{role:'system',content:`Eres editor de guiones audiovisuales. Reescribe y AMPLÍA el guion completo dado por el usuario. Devuelve únicamente el documento final, sin preámbulo. Conserva exactamente la cantidad de escenas, el orden, la identidad de personajes, las acciones principales, los títulos de los bloques NARRACIÓN:, IMAGEN EN PANTALLA:, PROMPT VISUAL:, CONTEXTO Y RECREACIONES:, HECHOS A VERIFICAR: y FUENTES A CONSULTAR:. Amplía principalmente los bloques NARRACIÓN mediante acciones observables, detalles concretos y transiciones naturales. Total obligatorio de narración entre ${minimum} y ${maximum} palabras; apunta a ${target}. No cuentes los prompts visuales ni los encabezados. Sin frases genéricas ni anacronismos. ${mode==='riguroso'?'Separa con rigor hechos, inferencias y recreaciones; no inventes referencias bibliográficas ni afirmaciones históricas.':'Aclara qué hechos y personajes son inventados.'} No incluyas auditoría ni estimaciones de recuento.`},{role:'user',content:story}]} )});
  const data=await rr.json().catch(()=>null);
  if(!rr.ok){console.error('Expand failed',rr.status,data?.error?.code);return respond(res,502,{error:rr.status===429?'Límite o cuota de OpenAI alcanzado.':`No se pudo ampliar el guion (HTTP ${rr.status}).`});}
  const output=data?.choices?.[0]?.message?.content;
  if(typeof output!=='string'||!output.trim())return respond(res,502,{error:'La IA no devolvió una ampliación válida.'});
  const words=countWords(narrationOf(output));
  const note=words<minimum?`AVISO DE DURACIÓN: ${words} palabras narradas; aún por debajo del mínimo ${minimum}.`:(words>maximum?`AVISO DE DURACIÓN: ${words} palabras narradas; supera el máximo ${maximum}.`:`CONTROL DE DURACIÓN: ${words} palabras narradas; dentro del rango ${minimum}-${maximum}.`);
  return respond(res,200,{story:`${output.trim()}\n\n---\n${note}\nNota: verifica fuentes y exactitud histórica antes de publicar.`,quality:{words,minimum,maximum,expandedFrom:before}});
 }catch(e){console.error('Expand connection',e?.name);return respond(res,502,{error:e?.name==='AbortError'?'Se agotó el tiempo de espera.':'Error de conexión al ampliar el guion.'});}
 finally{clearTimeout(timer);}
};
