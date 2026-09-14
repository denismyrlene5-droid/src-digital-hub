/* global self, caches */
const CACHE="src-hub-shell-v5",ASSETS=["/","/hub.css?v=29","/hub-data.js?v=10","/hub-shell.js?v=13","/assets/ucc-wise-src-logo.jpg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET"||new URL(event.request.url).pathname.startsWith("/api/")||new URL(event.request.url).pathname.startsWith("/admin")||new URL(event.request.url).pathname.startsWith("/nominee-photo/"))return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(()=>caches.match(event.request)));});
