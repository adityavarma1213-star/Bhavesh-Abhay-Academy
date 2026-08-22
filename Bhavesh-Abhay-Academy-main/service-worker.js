/* BAA M41 — offline-first shell cache.
   Network-first for API requests; cache-first for static application assets.
   This is a real browser cache layer, not a claim of server synchronization. */
const CACHE='baa-os-static-v1';
const CORE=['./','./index.html','./student-os.html','./parent-os.html','./teacher-os.html','./teacher-review.html','./assessment.html','./homework-scanner.html','./knowledge-universe.html','./mathematics-world.html','./trust-privacy.html'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.pathname.startsWith('/api/')) return;
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;}).catch(()=>caches.match('./index.html'))));
});
