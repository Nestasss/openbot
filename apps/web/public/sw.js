self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    try {
      data = { body: event.data ? event.data.text() : '' }
    } catch {
      data = {}
    }
  }

  const title = data.title || 'Raka'
  const options = {
    body: data.body || 'Новое сообщение',
    icon: '/logo.png',
    badge: '/logo.png',
    data: data.data || {},
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const chatId = event.notification?.data?.chatId
  const url = chatId ? `/?chat=${encodeURIComponent(chatId)}` : '/'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('/') && 'focus' in client) return client.focus()
        }
        if (clients.openWindow) return clients.openWindow(url)
      }),
  )
})
