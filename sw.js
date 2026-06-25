// sw.js - Chill OS 离线信使 (Service Worker)
const CACHE = 'chill-os-v2';
const PRE_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './1android-chrome-192x192.png',
  './1android-chrome-512x512.png',
  './1apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/@phosphor-icons/web',
  'https://unpkg.com/fflate@0.8.2/umd/index.js',
  'https://unpkg.com/mammoth@1.6.0/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

// ── 安装：预缓存核心文件 ──
self.addEventListener('install', (event) => {
  console.log('[Chill OS] PWA 安装中…');
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.allSettled(PRE_CACHE.map(url =>
        cache.add(url).catch(() => console.warn('[SW] 预缓存失败:', url))
      ));
    }).then(() => self.skipWaiting())
  );
});

// ── 激活：清理旧缓存 ──
self.addEventListener('activate', (event) => {
  console.log('[Chill OS] PWA 已激活');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── 请求拦截：缓存优先，网络兜底 ──
self.addEventListener('fetch', (event) => {
  // 跳过 chrome-extension 和非 GET
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  // API 调用 / supabase / 天气等 —— 只用网络
  if (/api\.|supabase|open-meteo|elevenlabs|minimax|xiaomimimo|novelai|geocoding/.test(event.request.url)) {
    return; // 不缓存，直连
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      // 缓存命中 → 立即返回，同时后台更新
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      return cached || fetchPromise || new Response('离线状态，请连接网络', { status: 503 });
    })
  );
});

// ── 云端推送通知 ──
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const options = {
      body: payload.body || '发来了一条新消息',
      icon: payload.icon || '1apple-touch-icon.png',
      badge: '1apple-touch-icon.png',
      vibrate: [200, 100, 200],
      data: { url: payload.url || './' }
    };
    event.waitUntil(
      self.registration.showNotification(payload.title || 'Chill OS', options)
    );
  } catch (err) {
    console.error('[Chill OS] 推送解析失败:', err);
  }
});

// ── 点击通知 → 打开/聚焦页面 ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data?.url || './');
    })
  );
});

// ── 前台存活时的后台通知 ──
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'SHOW_NOTIFICATION') return;
  const { title, body, icon } = event.data;
  self.registration.showNotification(title || 'Chill OS', {
    body: body || '发来了一条新消息',
    icon: icon || '1apple-touch-icon.png',
    badge: '1apple-touch-icon.png',
    vibrate: [200, 100, 200],
    tag: event.data.tag || ('msg-' + Date.now()),
    renotify: true,
    data: { url: './' }
  });
});
