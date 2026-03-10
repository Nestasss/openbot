import { useEffect, useMemo, useRef, useState } from 'react'

export function formatMmSs(ms?: number | null) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000))
  const mm = String(Math.floor(s / 60)).padStart(1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export default function VoiceBubble({
  src,
  durationMs,
  isMe,
}: {
  src: string
  durationMs?: number | null
  isMe: boolean
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)

  const [playing, setPlaying] = useState(false)
  const [currentMs, setCurrentMs] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const totalMs = useMemo(() => {
    // Prefer backend duration if present, else fallback to element duration once loaded.
    return durationMs || 0
  }, [durationMs])

  function stopRaf() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }

  function tick() {
    const a = audioRef.current
    if (a) setCurrentMs(a.currentTime * 1000)
    rafRef.current = requestAnimationFrame(tick)
  }

  async function toggle() {
    const a = audioRef.current
    if (!a) return

    try {
      if (a.paused) {
        await a.play()
      } else {
        a.pause()
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const onPlay = () => {
      setPlaying(true)
      stopRaf()
      rafRef.current = requestAnimationFrame(tick)
    }
    const onPause = () => {
      setPlaying(false)
      stopRaf()
    }
    const onEnded = () => {
      setPlaying(false)
      stopRaf()
      setCurrentMs(0)
    }
    const onLoadedMetadata = () => {
      setLoaded(true)
      setLoadError(false)
    }
    const onError = () => {
      setLoadError(true)
    }
    const onTime = () => {
      // keep in sync for non-raf updates
      setCurrentMs(a.currentTime * 1000)
    }

    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    a.addEventListener('loadedmetadata', onLoadedMetadata)
    a.addEventListener('error', onError)
    a.addEventListener('timeupdate', onTime)

    return () => {
      stopRaf()
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('loadedmetadata', onLoadedMetadata)
      a.removeEventListener('error', onError)
      a.removeEventListener('timeupdate', onTime)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // If backend didn't provide durationMs, use audio metadata once loaded.
  const effectiveTotalMs = useMemo(() => {
    const a = audioRef.current
    const metaMs = loaded && a?.duration ? a.duration * 1000 : 0
    return totalMs || metaMs || 0
  }, [totalMs, loaded, src])

  const progress = effectiveTotalMs > 0 ? clamp(currentMs / effectiveTotalMs, 0, 1) : 0

  return (
    <div className={['voice', isMe ? 'me' : 'them'].join(' ')}>
      <audio ref={audioRef} preload="metadata" src={src} />

      <button className="voiceBtn" onClick={toggle} title={playing ? 'Пауза' : 'Воспроизвести'}>
        {playing ? '⏸' : '▶'}
      </button>

      <div className="voiceBody">
        <div className="voiceBar">
          <div className="voiceBarBg" />
          <div className="voiceBarFg" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>

        <div className="voiceMeta">
          <span className="voiceTime">{formatMmSs(playing ? currentMs : effectiveTotalMs || durationMs || 0)}</span>
          {loadError ? <span className="voiceErr">не удалось загрузить</span> : null}
        </div>
      </div>
    </div>
  )
}
