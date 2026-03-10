import { useEffect, useRef, useState } from 'react'
import type { ToastKind } from '../lib/toast'
import './ToastHost.css'

type ToastItem = { id: string; message: string; kind: ToastKind }

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, number>>({})

  useEffect(() => {
    const onToast = (e: any) => {
      const message = String(e?.detail?.message || '')
      const kind = (e?.detail?.kind || 'info') as ToastKind
      if (!message) return

      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`
      const it: ToastItem = { id, message, kind }
      setItems((prev) => [...prev, it].slice(-3))

      // auto-dismiss
      if (timers.current[id]) window.clearTimeout(timers.current[id])
      timers.current[id] = window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id))
        delete timers.current[id]
      }, kind === 'error' ? 5000 : 3200)
    }

    window.addEventListener('raka_toast', onToast)
    return () => window.removeEventListener('raka_toast', onToast)
  }, [])

  if (!items.length) return null

  return (
    <div className="toastHost">
      {items.map((t) => (
        <div key={t.id} className={['toast', `toast-${t.kind}`].join(' ')}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
