export type ToastKind = 'info' | 'error' | 'success'

export function toast(message: string, kind: ToastKind = 'info') {
  try {
    window.dispatchEvent(new CustomEvent('raka_toast', { detail: { message, kind } }))
  } catch {
    // ignore
  }
}
