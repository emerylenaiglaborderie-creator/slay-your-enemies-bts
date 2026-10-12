/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { REMINDER_TAG, checkAndNotify } from './reminders/check'
import { createDexieStorage } from './storage/dexie'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> }

type PeriodicSyncEvent = ExtendableEvent & { tag: string }

// Hors ligne : l'app entière est mise en cache, toutes les routes servent index.html.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))
self.skipWaiting()
clientsClaim()

// Réveil périodique par le navigateur (Chrome, Edge, app installée) : rappel app fermée.
self.addEventListener('periodicsync', (event) => {
  const sync = event as PeriodicSyncEvent
  if (sync.tag !== REMINDER_TAG) return
  sync.waitUntil(checkAndNotify(createDexieStorage(), (title, options) => self.registration.showNotification(title, options)))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | null)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients[0]
      if (client) return client.navigate(url).then((c) => c?.focus())
      return self.clients.openWindow(url).then(() => undefined)
    }),
  )
})
