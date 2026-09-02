// Minimal service worker: enough for installability, without ever serving a
// stale build. Vite fingerprints filenames under /assets, so those are safe to
// cache forever; the HTML shell is always fetched fresh when the network allows.

const CACHE = 'lift-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return   // never touch Supabase calls

  // Navigations: network first, cached shell only as an offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // Fingerprinted assets: cache first, they can never go stale.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(request, copy))
        return res
      }))
    )
    return
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)))
})
