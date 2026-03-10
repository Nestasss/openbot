import { api, getApiUrl } from './api'
import { toast } from './toast'

function urlBase64ToUint8Array(base64String: string) {
  // https://www.rfc-editor.org/rfc/rfc4648
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export async function ensurePushEnabled() {
  if (!('serviceWorker' in navigator)) {
    toast('Service Worker не поддерживается в этом браузере', 'error')
    return false
  }
  if (!('PushManager' in window)) {
    toast('Push не поддерживается в этом браузере', 'error')
    return false
  }

  // iOS requires installed PWA for push.
  // Still safe to request permission; if unsupported, it will fail.

  const reg = await navigator.serviceWorker.ready

  // ask permission
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') {
    toast('Разрешение на уведомления не выдано', 'error')
    return false
  }

  // Get VAPID public key from backend (preferred, so we don't hardcode)
  const pk = await api<any>('/push/vapid-public-key')
  const publicKey = pk?.ok ? pk.publicKey : ''
  if (!publicKey) {
    toast('На сервере не настроены VAPID ключи', 'error')
    return false
  }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const r = await api<any>('/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  })

  if (r?.ok) {
    toast('Уведомления включены', 'success')
    return true
  }

  toast('Не удалось включить уведомления', 'error')
  return false
}

export async function disablePush() {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) {
    toast('Уведомления уже выключены', 'info')
    return
  }

  await api<any>('/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => null)

  await sub.unsubscribe().catch(() => null)
  toast('Уведомления выключены', 'info')
}

export async function getPushStatus() {
  return await api<any>('/push/status')
}

export function isProbablyIosStandalone() {
  const nav: any = navigator
  const standalone = nav.standalone === true
  return standalone
}

export function apiUrl() {
  return getApiUrl()
}
