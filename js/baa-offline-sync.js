/* BAA M41 — offline learning queue.
   Uses IndexedDB for durable local queueing and exposes a small API for pages.
   Server synchronization is attempted only when a configured endpoint exists. */
(function(global){'use strict';
const DB='baa_offline_v1',STORE='queue';
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function enqueue(payload){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');const row={id:`off_${Date.now()}_${Math.random().toString(36).slice(2)}`,createdAt:new Date().toISOString(),payload};tx.objectStore(STORE).put(row);tx.oncomplete=()=>resolve(row);tx.onerror=()=>reject(tx.error);});}
async function list(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function flush(endpoint,fetchImpl=fetch){if(!endpoint)return {ok:false,error:'NO_SYNC_ENDPOINT',sent:0};const rows=await list();let sent=0;for(const row of rows){const res=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row.payload)});if(!res.ok)break;const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(row.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});sent++;}return {ok:true,error:null,sent,remaining:(await list()).length};}
global.BAAOfflineSync={enqueue,list,flush};
})(window);
