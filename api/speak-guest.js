// BAA OS — guest AI Tutor voice backend.
// The Student OS is intentionally usable without an account. This endpoint
// rate-limits by IP and does not require a session.
export const config = { runtime: 'nodejs' };
import { consumeAiRateLimit } from './_lib/ai-rate-limit.js';

const MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_TEXT_CHARS = 3000;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;
const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const ALLOWED_VOICES = new Set(['Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe','Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome','Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux','Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia','Sadaltager','Sulafat']);
const DEFAULT_VOICE = 'Achird';

function ip(req){const f=String(req.headers.get('x-forwarded-for')||'').split(',')[0].trim();return f||req.headers.get('x-real-ip')||'unknown';}
function cors(req){return {'Access-Control-Allow-Origin':process.env.ALLOWED_ORIGIN||'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};}
function err(req,status,message){return new Response(JSON.stringify({error:message}),{status,headers:{'Content-Type':'application/json',...cors(req)}});}
function base64ToBytes(b64){const bin=atob(b64);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;}
function pcmToWav(pcmBytes){const blockAlign=CHANNELS*(BIT_DEPTH/8),byteRate=SAMPLE_RATE*blockAlign,dataSize=pcmBytes.length;const buffer=new ArrayBuffer(44+dataSize),view=new DataView(buffer);const w=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};w(0,'RIFF');view.setUint32(4,36+dataSize,true);w(8,'WAVE');w(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,CHANNELS,true);view.setUint32(24,SAMPLE_RATE,true);view.setUint32(28,byteRate,true);view.setUint16(32,blockAlign,true);view.setUint16(34,BIT_DEPTH,true);w(36,'data');view.setUint32(40,dataSize,true);const out=new Uint8Array(buffer);out.set(pcmBytes,44);return out;}
async function call(payload,key,attempt=0){const c=new AbortController(),t=setTimeout(()=>c.abort(),REQUEST_TIMEOUT_MS);try{const r=await fetch(GEMINI_TTS_URL,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key,'Api-Revision':'2026-05-20'},body:JSON.stringify(payload),signal:c.signal});clearTimeout(t);if(!r.ok&&r.status>=500&&attempt<MAX_RETRIES){await new Promise(x=>setTimeout(x,400*Math.pow(2,attempt)));return call(payload,key,attempt+1);}return r;}catch(e){clearTimeout(t);if(attempt<MAX_RETRIES){await new Promise(x=>setTimeout(x,400*Math.pow(2,attempt)));return call(payload,key,attempt+1);}throw new Error(e?.name==='AbortError'?'upstream timeout':'upstream network error');}}

export default async function handler(req){
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=='POST')return err(req,405,'Method not allowed');
 const key=process.env.GEMINI_API_KEY;if(!key)return err(req,500,'Server is missing GEMINI_API_KEY');
 try{const r=await consumeAiRateLimit('speak-guest',ip(req),{windowSeconds:300,maxRequests:20});if(r.limited)return err(req,429,'Too many voice requests — please wait a moment.');}catch{return err(req,503,'AI rate-limit service is temporarily unavailable.');}
 let body;try{body=await req.json();}catch{return err(req,400,'Invalid JSON body');}
 const text=typeof body?.text==='string'?body.text.trim():'';if(!text)return err(req,400,'text is required');
 const voice=typeof body?.voice==='string'&&ALLOWED_VOICES.has(body.voice)?body.voice:DEFAULT_VOICE;
 const payload={model:MODEL,input:text.slice(0,MAX_TEXT_CHARS),response_format:{type:'audio'},generation_config:{speech_config:[{voice}]}};
 let upstream;try{upstream=await call(payload,key);}catch(e){return err(req,502,e.message||'Failed to reach the voice service');}
 if(!upstream.ok){let detail='Voice service error';try{const x=await upstream.json();detail=(Array.isArray(x)?x[0]?.error:x?.error)?.message||detail;}catch{}return err(req,upstream.status||502,detail);}
 let data;try{data=await upstream.json();}catch{return err(req,502,'Voice service returned an unreadable response');}
 const base64Pcm=data?.output_audio?.data; if(!base64Pcm)return err(req,502,"The AI didn't return any audio — try again.");
 return new Response(pcmToWav(base64ToBytes(base64Pcm)),{status:200,headers:{'Content-Type':'audio/wav','Cache-Control':'no-store',...cors(req)}});
}
