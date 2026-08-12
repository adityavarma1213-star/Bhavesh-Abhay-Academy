/* BAA OS — durable offline request queue.
   Supported authenticated state-sync requests are queued in IndexedDB when
   connectivity is unavailable and replayed when the browser is online.
   The server remains authoritative: replay uses the original endpoint and
   credentials; failures stay queued. No grading result is created offline. */
(function(global){
'use strict';
const DB='baa_offline_sync_v1', STORE='requests', MAX=100;
let memory=[];
function open(){return new Promise((resolve,reject)=>{if(!global.indexedDB)return reject(new Error('IDB_UNAVAILABLE'));const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IDB_OPEN_FAILED'));});}
async function all(){try{const db=await open();return await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),q=tx.objectStore(STORE).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error);});}catch(_){return memory.slice();}}
async function put(item){item.id=item.id||`off_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;try{const db=await open();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(item);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch(_){memory.push(item);if(memory.length>MAX)memory=memory.slice(-MAX);}return item.id;}
async function remove(id){try{const db=await open();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch(_){memory=memory.filter(x=>x.id!==id);}}
async function enqueue(url,options){const o=options||{};const createdAt=new Date().toISOString();const item={id:null,url,method:o.method||'POST',headers:{...(o.headers||{'Content-Type':'application/json'})},body:o.body||null,createdAt,attempts:0};item.id=`off_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;item.headers['X-BAA-Operation-Id']=item.id;item.headers['X-BAA-Operation-Created-At']=createdAt;return put(item);}
async function flush(){if(global.navigator&&global.navigator.onLine===false)return {ok:false,remaining:(await all()).length};const rows=await all();let sent=0;for(const item of rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){try{const r=await global.fetch(item.url,{method:item.method,headers:item.headers,body:item.body,credentials:'include'});if(r.ok){await remove(item.id);sent++;}else if(r.status>=400&&r.status<500&&r.status!==408&&r.status!==429){await remove(item.id);}else break;}catch(_){break;}}return {ok:true,sent,remaining:(await all()).length};}
function start(){if(global.addEventListener){global.addEventListener('online',()=>flush());}setTimeout(()=>flush(),1500);}
global.BAAOfflineSync={enqueue,flush,pending:all,start};start();
})(window);
