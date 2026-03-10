import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useChats, useSession } from './lib/state'
import VoiceBubble from './components/VoiceBubble'
import ToastHost from './components/ToastHost'
import { disablePush, ensurePushEnabled, getPushStatus, isProbablyIosStandalone } from './lib/push'
import { toast } from './lib/toast'

type Tab = 'chats' | 'settings'

export default function App() {
  const session = useSession()
  const chats = useChats(session.me)
  const [tab, setTab] = useState<Tab>('chats')
  const [mobileView, setMobileView] = useState<'sidebar' | 'chat'>('sidebar')
  const [chatSearch, setChatSearch] = useState('')
  const [serviceOk, setServiceOk] = useState<boolean>(true)
  const [editChats, setEditChats] = useState(false)
  const [loginMode, setLoginMode] = useState<'link' | 'code'>('link')
  const [loginHint, setLoginHint] = useState<string>('')
  const [tgDeepLink, setTgDeepLink] = useState<string>('')
  const [pushEnabled, setPushEnabled] = useState<boolean>(false)
  const [pushLoading, setPushLoading] = useState<boolean>(false)

  const activeChat = useMemo(
    () => chats.chats.find((x) => x.id === chats.activeChatId) || null,
    [chats.chats, chats.activeChatId],
  )

  const messagesRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)

  function scrollToBottom(behavior: ScrollBehavior = 'auto') {
    const el = messagesRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }

  // Service health indicator (green/red dot)
  useEffect(() => {
    let cancelled = false

    async function ping() {
      try {
        const res = await fetch('https://api.notificbot.ru/health', { cache: 'no-store' })
        const ok = res.ok
        if (!cancelled) setServiceOk(ok)
      } catch {
        if (!cancelled) setServiceOk(false)
      }
    }

    ping()
    const t = setInterval(ping, 15_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  // Push status
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!session.me) {
        setPushEnabled(false)
        return
      }
      const r = await getPushStatus().catch(() => null)
      if (!cancelled) setPushEnabled(!!r?.enabled)
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.me?.id])

  // Important: don't auto-jump into a chat on refresh.
  // We switch to chat view only when user taps a chat.

  // Autoscroll logic: stick to bottom only if user is already near bottom.
  useEffect(() => {
    // When opening a chat, jump to bottom.
    if (chats.activeChatId) {
      stickToBottomRef.current = true
      // next tick
      setTimeout(() => scrollToBottom('auto'), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats.activeChatId])

  useEffect(() => {
    if (!chats.activeChatId) return
    if (!stickToBottomRef.current) return
    setTimeout(() => scrollToBottom('smooth'), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats.activeMessages.length])

  return (
    <div className="app">
      <ToastHost />
      {!session.me ? (
        <div style={{ position: 'fixed', top: 14, right: 14, zIndex: 50 }}>
          <div
            title={serviceOk ? 'Сервис работает' : 'Сервис недоступен'}
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: serviceOk ? '#20E070' : '#FF3B30',
              boxShadow: serviceOk
                ? '0 0 0 6px rgba(32,224,112,0.12)'
                : '0 0 0 6px rgba(255,59,48,0.12)',
            }}
          />
        </div>
      ) : null}

      <header className="topbar" style={!session.me ? { display: 'none' } : undefined}>
        <div className="brand" style={{ gap: 10 }}>
          {session.me && mobileView === 'chat' ? (
            <button
              onClick={() => setMobileView('sidebar')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 12,
              }}
              title="Назад"
            >
              ←
            </button>
          ) : null}

          {/* Login header: R logo + online dot */}
          {!session.me ? (
            <>
              <img src="/mini_logo.svg" alt="Raka" style={{ width: 28, height: 28 }} />
            </>
          ) : (
            <>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  overflow: 'hidden',
                }}
                title="avatar"
              >
                {session.me?.avatarPath ? (
                  <img
                    src={`https://api.notificbot.ru${session.me.avatarPath}`}
                    alt="me"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : null}
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div className="title" style={{ fontSize: 16 }}>
                  {mobileView === 'chat' ? activeChat?.peer?.phone || 'Чат' : 'Чаты'}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div
            title={serviceOk ? 'Сервис работает' : 'Сервис недоступен'}
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: serviceOk ? '#20E070' : '#FF3B30',
              boxShadow: serviceOk
                ? '0 0 0 6px rgba(32,224,112,0.12)'
                : '0 0 0 6px rgba(255,59,48,0.12)',
            }}
          />
        </div>
      </header>

      {!session.me ? (
        <main className="layout no-tabbar" style={{ padding: 0, maxWidth: 'none' }}>
          <section
            className="chat"
            style={{
              width: '100%',
              borderRadius: 0,
              border: 0,
              background: 'transparent',
              boxShadow: 'none',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '100%', maxWidth: 360, padding: 24, textAlign: 'center' }}>
              <img src="/logo.png" alt="Raka" style={{ width: '72%', maxWidth: 260, height: 'auto', margin: '0 auto 18px' }} />
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 20 }}>
                private messenger
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={async () => {
                    // If we already started a TG login session, open Telegram again with the same sessionId.
                    if (session.tgLoginSessionId) {
                      const link = `https://t.me/authorization_raka_bot?start=${session.tgLoginSessionId}`
                      setLoginMode('code')
                      setTgDeepLink(link)
                      window.location.href = link
                      return
                    }

                    setLoginMode('code')
                    setLoginHint('')
                    setTgDeepLink('')

                    const r = await session.startTelegramLogin()
                    if (!r?.ok) {
                      setLoginHint('Не удалось начать вход')
                      return
                    }
                    const linkHttps = `https://t.me/authorization_raka_bot?start=${r.sessionId}`
                    const linkTg = `tg://resolve?domain=authorization_raka_bot&start=${r.sessionId}`
                    setTgDeepLink(linkHttps)
                    // Prefer tg:// to reliably deliver start payload in Telegram app.
                    window.location.href = linkTg
                    setTimeout(() => {
                      // fallback
                      window.location.href = linkHttps
                    }, 400)
                  }}
                  style={{ padding: '14px 16px', borderRadius: 16, fontSize: 16 }}
                >
                  Войти
                </button>
              </div>


              {loginHint ? (
                <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.72)', fontSize: 13 }}>
                  {loginHint}
                </div>
              ) : null}

              {tgDeepLink ? (
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <a href={tgDeepLink} style={{ color: 'rgba(255,255,255,0.85)' }}>
                    Открыть Telegram
                  </a>
                </div>
              ) : null}


              {loginMode === 'code' ? (
                <div style={{ marginTop: 16, textAlign: 'left' }}>
                  <div className="composer" style={{ gap: 8, marginTop: 10 }}>
                    <input
                      placeholder="123456"
                      value={session.authCode}
                      onChange={(e) => session.setAuthCode(e.target.value)}
                    />
                    <button onClick={() => session.verifyTelegramLogin(session.authCode)}>Войти</button>
                  </div>

                  {session.status ? <div className="bubble them">{session.status}</div> : null}
                </div>
              ) : null}
            </div>
          </section>
        </main>
      ) : (
        <main className={['layout', mobileView === 'sidebar' ? 'mobile-show-sidebar' : 'mobile-show-chat'].join(' ')}>
          {tab === 'chats' ? (
            <>
              <aside className="sidebar">
            <div className="sidebarHeader" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Чаты</span>
              <button
                onClick={() => setEditChats((v) => !v)}
                style={{ padding: '8px 10px' }}
                title="Редактировать"
              >
                {editChats ? 'Готово' : 'Изм.'}
              </button>
            </div>

            <div className="topSearch">
              <input
                placeholder="Поиск"
                value={chatSearch}
                onChange={(e) => setChatSearch(e.target.value)}
              />
            </div>

            {/* Start new chat via search: type phone in search, tap result */}
            {(() => {
              const q = chatSearch.trim().replace(/[\s\-()]/g, '')
              if (!q) return null
              if (!q.startsWith('+')) return null
              if (q.length < 8) return null

              return (
                <div
                  className="chatItem"
                  style={{ cursor: 'pointer' }}
                  onClick={async () => {
                    chats.setPeerPhone(q)
                    await chats.createDirect()
                    setChatSearch('')
                  }}
                >
                  <div className="avatar">+</div>
                  <div className="chatMeta" style={{ flex: 1, minWidth: 0 }}>
                    <div className="chatName">{q}</div>
                    <div className="chatLast">Начать чат</div>
                  </div>
                </div>
              )
            })()}

            {chats.chats
              .filter((c) => {
                const q = chatSearch.trim().toLowerCase()
                if (!q) return true
                const name = (c.peer?.phone || '').toLowerCase()
                const last = (c.lastMessage?.text || '').toLowerCase()
                return name.includes(q) || last.includes(q)
              })
              .map((c) => (
                <div
                  key={c.id}
                  className={['chatItem', chats.activeChatId === c.id ? 'active' : ''].join(' ')}
                  onClick={() => {
                    if (editChats) return
                    chats.setActiveChatId(c.id)
                    setMobileView('chat')
                  }}
                >
                  {editChats ? (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        const yes = confirm('Удалить чат у всех?')
                        if (!yes) return
                        const r = await fetch(`https://api.notificbot.ru/chats/${c.id}`, {
                          method: 'DELETE',
                          headers: { Authorization: `Bearer ${localStorage.getItem('raka_token') || ''}` },
                        })
                        const j = await r.json().catch(() => null)
                        if (!j?.ok) {
                          alert('Не удалось удалить чат')
                          return
                        }
                        await chats.loadChats()
                        if (chats.activeChatId === c.id) chats.setActiveChatId(null)
                      }}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(255,59,48,0.18)',
                        color: 'rgba(255,255,255,0.9)',
                      }}
                      title="Удалить"
                    >
                      −
                    </button>
                  ) : (
                    <div className="avatar" style={{ borderRadius: 999, overflow: 'hidden' }}>
                      {c.peer?.avatarPath ? (
                        <img
                          src={`https://api.notificbot.ru${c.peer.avatarPath}`}
                          alt="peer"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        '•'
                      )}
                    </div>
                  )}
                  <div className="chatMeta" style={{ flex: 1, minWidth: 0 }}>
                    <div className="chatName">{c.peer?.name || c.peer?.phone || `Chat ${c.id.slice(0, 6)}`}</div>
                    <div className="chatLast">
                      {(() => {
                        const lm = c.lastMessage
                        if (!lm) return ''
                        const isMe = lm.senderId === session.me?.id
                        const text = lm.text?.trim()
                        const preview = text
                          ? text
                          : lm.mediaKind === 'voice'
                            ? '🎤 голосовое'
                            : lm.mediaKind === 'photo'
                              ? '📷 фото'
                              : lm.mediaPath
                                ? '📎 медиа'
                                : ''
                        return `${isMe ? 'Вы: ' : ''}${preview}`
                      })()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 64, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                    {c.lastMessage?.createdAt
                      ? new Date(c.lastMessage.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      : c.updatedAt
                        ? new Date(c.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                        : ''}

                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
                      {(() => {
                        const unread = c.unreadCount || 0
                        if (unread > 0) {
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                minWidth: 18,
                                height: 18,
                                padding: '0 6px',
                                borderRadius: 999,
                                background: 'rgba(25,163,254,0.18)',
                                border: '1px solid rgba(25,163,254,0.35)',
                                color: 'rgba(255,255,255,0.92)',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )
                        }

                        const lm = c.lastMessage
                        if (!lm) return ''
                        const isMe = lm.senderId === session.me?.id
                        if (!isMe) return ''

                        const peerReadAt = c.peerLastReadAt ? new Date(c.peerLastReadAt) : null
                        const msgAt = new Date(lm.createdAt)
                        const read = !!(peerReadAt && msgAt <= peerReadAt)
                        return read ? '✓✓' : '✓'
                      })()}
                    </div>
                  </div>
                </div>
              ))}
              </aside>

              <section className="chat">
            <div className="chatHeader">
              <div className="chatTitle">
                {(() => {
                  const c = chats.chats.find((x) => x.id === chats.activeChatId)
                  if (!c) return 'Чат не выбран'
                  return c.peer?.name || c.peer?.phone || `Chat ${c.id.slice(0, 6)}`
                })()}
              </div>
              <div className="chatStatus">ws: {chats.wsStatus}</div>
            </div>

            <div
              className="messages"
              ref={messagesRef}
              onScroll={(e) => {
                const el = e.currentTarget
                const gap = el.scrollHeight - el.scrollTop - el.clientHeight
                // if within 80px from bottom - consider "at bottom"
                stickToBottomRef.current = gap < 80
              }}
            >
              {chats.activeMessages.map((m) => {
                const isMe = m.senderId === session.me?.id
                const time = new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                const checks = (() => {
                  if (!isMe) return ''
                  const peerReadAt = activeChat?.peerLastReadAt ? new Date(activeChat.peerLastReadAt) : null
                  const msgAt = new Date(m.createdAt)
                  const read = !!(peerReadAt && msgAt <= peerReadAt)
                  return read ? '✓✓' : '✓'
                })()

                return (
                  <div key={m.id} className={['bubble', isMe ? 'me' : 'them'].join(' ')}>
                    {m.mediaPath && (m.mediaKind === 'photo' || !m.mediaKind) ? (
                      <img
                        className="msgImage"
                        src={`https://api.notificbot.ru${m.mediaPath}`}
                        alt="media"
                      />
                    ) : null}

                    {m.mediaPath && m.mediaKind === 'voice' ? (
                      <VoiceBubble
                        src={`https://api.notificbot.ru${m.mediaPath}`}
                        durationMs={m.mediaDurationMs}
                        isMe={isMe}
                      />
                    ) : null}

                    {m.text ? <div style={{ whiteSpace: 'pre-wrap', marginTop: m.mediaPath ? 8 : 0 }}>{m.text}</div> : null}

                    <div className="msgMeta">
                      <span>{time}</span>
                      {checks ? <span style={{ fontSize: 12 }}>{checks}</span> : null}
                    </div>
                  </div>
                )
              })}
            </div>

            {chats.photoFile ? (
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img
                    src={URL.createObjectURL(chats.photoFile)}
                    alt="preview"
                    style={{ width: 54, height: 54, borderRadius: 12, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.12)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0, color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>
                    Фото готово к отправке
                  </div>
                  <button onClick={() => chats.setPhotoFile(null)} style={{ padding: '10px 12px' }}>
                    ✕
                  </button>
                </div>
              </div>
            ) : null}

            <div className="composer tg" style={{ gap: 10 }}>
              <label className="iconBtn" title="Добавить" style={{ cursor: chats.activeChatId ? 'pointer' : 'not-allowed' }}>
                +
                <input
                  type="file"
                  accept="image/*"
                  disabled={!chats.activeChatId}
                  onChange={(e) => chats.setPhotoFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
              </label>

              <div className="composerMid">
                {chats.voiceStatus === 'recording' ? (
                  <div className="recBadge" title="Идёт запись">
                    <span className="recDot" />
                    <span className="recText">
                      Запись {(() => {
                        const s = Math.max(0, Math.floor((chats.voiceDurationMs || 0) / 1000))
                        const mm = String(Math.floor(s / 60)).padStart(1, '0')
                        const ss = String(s % 60).padStart(2, '0')
                        return `${mm}:${ss}`
                      })()}
                    </span>
                  </div>
                ) : null}

                <input
                  className="tgInput"
                  placeholder={chats.voiceStatus === 'ready' ? 'Голосовое готово — отправь или удали' : 'Aa'}
                  value={chats.composer}
                  onChange={(e) => chats.setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') chats.sendMessage()
                  }}
                  disabled={!chats.activeChatId || chats.voiceStatus !== 'idle'}
                />
              </div>

              {chats.voiceStatus === 'idle' ? (
                <button
                  onClick={chats.startVoiceRecording}
                  disabled={!chats.activeChatId}
                  title="Запись голосового"
                  style={{ padding: '10px 12px', borderRadius: 14 }}
                >
                  🎙️
                </button>
              ) : null}

              {chats.voiceStatus === 'recording' ? (
                <button
                  onClick={chats.stopVoiceRecording}
                  disabled={!chats.activeChatId}
                  style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(255,59,48,0.18)' }}
                  title="Остановить"
                >
                  ⏹
                </button>
              ) : null}

              {chats.voiceStatus === 'ready' ? (
                <>
                  <button
                    onClick={chats.sendVoice}
                    disabled={!chats.activeChatId || chats.voiceBusy}
                    style={{ padding: '10px 12px', borderRadius: 14, background: 'rgba(32,224,112,0.14)' }}
                    title="Отправить голосовое"
                  >
                    {chats.voiceBusy ? 'Отправка…' : '⬆️'}
                  </button>
                  <button
                    onClick={chats.startVoiceRecording}
                    disabled={!chats.activeChatId || chats.voiceBusy}
                    style={{ padding: '10px 12px', borderRadius: 14 }}
                    title="Перезаписать"
                  >
                    ↺
                  </button>
                  <button
                    onClick={chats.cancelVoice}
                    disabled={!chats.activeChatId || chats.voiceBusy}
                    style={{ padding: '10px 12px', borderRadius: 14 }}
                    title="Удалить"
                  >
                    🗑
                  </button>
                </>
              ) : null}

              <button
                className="sendBtn"
                onClick={chats.sendMessage}
                disabled={!chats.activeChatId || chats.voiceStatus !== 'idle'}
                title={chats.voiceStatus !== 'idle' ? 'Сначала отправь/отмени голосовое' : 'Отправить'}
              >
                ➤
              </button>
            </div>
              </section>
            </>
          ) : (
            <section className="chat" style={{ width: '100%' }}>
              <div className="chatHeader">
                <div className="chatTitle">Настройки</div>
                <div className="chatStatus">профиль</div>
              </div>

              <div className="messages" style={{ gap: 12 }}>
                <div className="chatItem" style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                  <div className="avatar" style={{ width: 54, height: 54, borderRadius: 999, overflow: 'hidden' }}>
                    {session.me?.avatarPath ? (
                      <img
                        src={`https://api.notificbot.ru${session.me.avatarPath}`}
                        alt="avatar"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      'R'
                    )}
                  </div>
                  <div className="chatMeta" style={{ flex: 1, minWidth: 0 }}>
                    <div className="chatName">{session.me?.name || 'Без имени'}</div>
                    <div className="chatLast">{session.me?.phone}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label className="chatItem" style={{ cursor: 'pointer', flex: 1, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                    <div className="chatMeta">
                      <div className="chatName">Аватар</div>
                      <div className="chatLast">Загрузить (до 3MB)</div>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        if (file.size > 3 * 1024 * 1024) {
                          toast('Файл больше 3MB', 'error')
                          return
                        }

                        const token = localStorage.getItem('raka_token')
                        const fd = new FormData()
                        fd.append('file', file)
                        const res = await fetch('https://api.notificbot.ru/media/avatar', {
                          method: 'POST',
                          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                          body: fd,
                        })
                        const json = await res.json().catch(() => null)
                        if (json?.ok && json.avatarPath) {
                          await session.updateMe({ avatarPath: json.avatarPath })
                          toast('Аватар обновлён', 'success')
                        } else {
                          toast('Не удалось загрузить аватар', 'error')
                        }
                      }}
                    />
                  </label>

                  <div className="chatItem" style={{ flex: 1, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                    <div className="chatMeta">
                      <div className="chatName">Уведомления</div>
                      <div className="chatLast">вкл/выкл (внутри приложения)</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={session.me?.notificationsEnabled ?? true}
                      onChange={async (e) => {
                        await session.updateMe({ notificationsEnabled: e.target.checked })
                      }}
                    />
                  </div>

                  <div className="chatItem" style={{ flex: 1, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                    <div className="chatMeta" style={{ flex: 1, minWidth: 0 }}>
                      <div className="chatName">Push (PWA)</div>
                      <div className="chatLast">
                        {pushEnabled ? 'включены' : 'выключены'}
                        {!isProbablyIosStandalone() ? ' (на iOS нужны "На экран домой")' : ''}
                      </div>
                    </div>
                    <button
                      disabled={pushLoading}
                      onClick={async () => {
                        setPushLoading(true)
                        try {
                          if (pushEnabled) {
                            await disablePush()
                            setPushEnabled(false)
                          } else {
                            const ok = await ensurePushEnabled()
                            if (ok) setPushEnabled(true)
                          }
                        } finally {
                          setPushLoading(false)
                        }
                      }}
                    >
                      {pushLoading ? '…' : pushEnabled ? 'Выключить' : 'Включить'}
                    </button>
                  </div>
                </div>

                <div className="chatItem" style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                  <div className="chatMeta" style={{ flex: 1, minWidth: 0 }}>
                    <div className="chatName">Имя пользователя</div>
                    <div className="chatLast">Нажми, чтобы изменить</div>
                  </div>
                  <button
                    onClick={async () => {
                      const name = prompt('Имя пользователя', session.me?.name || '')
                      if (!name) return
                      await session.updateMe({ name })
                    }}
                  >
                    Изм.
                  </button>
                </div>

                <div className="chatItem" style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                  <div className="chatMeta" style={{ flex: 1, minWidth: 0 }}>
                    <div className="chatName">Очистка кэша</div>
                    <div className="chatLast">Не разлогинивает</div>
                  </div>
                  <button
                    onClick={() => {
                      chats.setActiveChatId(null)
                      chats.setComposer('')
                      chats.setPhotoFile(null)
                      alert('Готово')
                    }}
                  >
                    Очистить
                  </button>
                </div>

                <div className="chatItem" style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
                  <div className="chatMeta" style={{ flex: 1, minWidth: 0 }}>
                    <div className="chatName">Выход</div>
                    <div className="chatLast">Выйти из аккаунта</div>
                  </div>
                  <button onClick={session.logout}>Выйти</button>
                </div>
              </div>
            </section>
          )}

          <nav className="tabbar">
            <button
              className={tab === 'chats' ? 'active' : ''}
              onClick={() => {
                setTab('chats')
                setMobileView('sidebar')
              }}
            >
              <img className="icon" src="/icons/chat.svg" alt="" />
            </button>
            <button
              className={tab === 'settings' ? 'active' : ''}
              onClick={() => {
                setTab('settings')
                setMobileView('chat')
              }}
            >
              <img className="icon" src="/icons/settings.svg" alt="" />
            </button>
          </nav>
        </main>
      )}
    </div>
  )
}
