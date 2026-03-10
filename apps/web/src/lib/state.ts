import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chat, Message, User } from './types';
import { api, clearToken, setRefreshToken, setToken } from './api';
import { connectSocket, disconnectSocket, emitPresenceActive } from './socket';
import { toast } from './toast';

export function useSession() {
  const [me, setMe] = useState<User | null>(null);
  const [authPhone, setAuthPhone] = useState('+7');
  const [authCode, setAuthCode] = useState('');
  const [status, setStatus] = useState<string>('');
  const [tgLinkCode, setTgLinkCode] = useState<string>('');
  const [tgLoginSessionId, setTgLoginSessionId] = useState<string>(() => localStorage.getItem('tg_login_session') || '');

  async function refreshMe() {
    const r = await api<any>('/users/me');
    if (r?.ok) setMe(r.user);
    else setMe(null);
  }

  async function updateMe(patch: { name?: string; notificationsEnabled?: boolean; avatarPath?: string }) {
    const r = await api<any>('/users/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (r?.ok) setMe(r.user);
    return r;
  }

  async function requestTelegramLink() {
    try {
      setStatus('Готовлю код привязки…');
      const r = await api<any>('/auth/request-telegram-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: authPhone }),
      });
      if (r?.ok && r.linkCode) {
        setTgLinkCode(r.linkCode);
        setStatus('Открой Telegram и нажми Start в боте — привязка выполнится автоматически.');
      } else {
        setStatus(`Error: ${r?.error || 'REQUEST_FAILED'}`);
      }
      return r;
    } catch (e: any) {
      setStatus(`Network error: ${e?.message || e}`);
      return null;
    }
  }

  async function startTelegramLogin() {
    try {
      setStatus('Открываю Telegram…');
      const r = await api<any>('/auth/start-telegram-login', {
        method: 'POST',
      });
      if (r?.ok && r.sessionId) {
        setTgLoginSessionId(r.sessionId);
        localStorage.setItem('tg_login_session', r.sessionId);
        return r as { ok: true; sessionId: string };
      }
      setStatus(`Error: ${r?.error || 'START_FAILED'}`);
      return null;
    } catch (e: any) {
      setStatus(`Network error: ${e?.message || e}`);
      return null;
    }
  }

  async function verifyTelegramLogin(code: string) {
    try {
      setStatus('Проверяю…');
      const sessionId = tgLoginSessionId;
      if (!sessionId) {
        setStatus('Сначала нажми «Войти»');
        return null;
      }
      const r = await api<any>('/auth/verify-telegram-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, code }),
      });

      if (r?.ok && r.accessToken && r.refreshToken) {
        setToken(r.accessToken);
        setRefreshToken(r.refreshToken);
        localStorage.removeItem('tg_login_session');
        setTgLoginSessionId('');
        await refreshMe();
        setStatus('Вы вошли');
        return r;
      }

      setStatus(`Error: ${r?.error || 'VERIFY_FAILED'}`);
      return r;
    } catch (e: any) {
      setStatus(`Network error: ${e?.message || e}`);
      return null;
    }
  }

  function logout() {
    clearToken();
    setMe(null);
    disconnectSocket();
  }

  useEffect(() => {
    refreshMe();
  }, []);

  return {
    me,
    authPhone,
    setAuthPhone,
    authCode,
    setAuthCode,
    status,
    tgLinkCode,
    tgLoginSessionId,
    requestTelegramLink,
    startTelegramLogin,
    verifyTelegramLogin,
    logout,
    refreshMe,
    updateMe,
  };
}

export function useChats(me: User | null) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [peerPhone, setPeerPhone] = useState('+7');
  const [composer, setComposer] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  // Voice (PWA)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'recording' | 'ready'>('idle');
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceMime, setVoiceMime] = useState<string>('');
  const [voiceDurationMs, setVoiceDurationMs] = useState<number>(0);
  const [voiceBusy, setVoiceBusy] = useState<boolean>(false); // upload/send lock
  const voiceStartedAtRef = useRef<number>(0);
  const voiceTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [wsStatus, setWsStatus] = useState('');

  const activeMessages = useMemo(() => {
    if (!activeChatId) return [];
    return messages[activeChatId] || [];
  }, [messages, activeChatId]);

  async function loadChats() {
    const r = await api<any>('/chats');
    if (r?.ok) {
      setChats(r.chats);
      // Don't auto-select a chat on load; on mobile it causes an unwanted jump into the last chat.
      // User explicitly selects a chat.
    }
  }

  async function loadMessages(chatId: string) {
    const r = await api<any>(`/chats/${chatId}/messages?limit=50`);
    if (r?.ok) {
      setMessages((prev) => ({ ...prev, [chatId]: r.messages }));
      // opening chat marks it as read on backend, refresh chat list to update unread badges
      await loadChats();
    }
  }

  async function createDirect() {
    const r = await api<any>('/chats/direct', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: peerPhone }),
    });

    if (r?.ok) {
      await loadChats();
      setActiveChatId(r.chat.id);
      await loadMessages(r.chat.id);
      setPeerPhone('+7');
    } else {
      toast(
        r?.error === 'PEER_NOT_FOUND'
          ? 'Пользователь ещё не логинился. Пусть сначала войдёт.'
          : `Ошибка: ${r?.error || 'CREATE_CHAT_FAILED'}`,
        'error',
      );
    }
  }

  async function uploadPhoto() {
    if (!photoFile) return null;

    const fd = new FormData();
    fd.append('file', photoFile);

    const token = localStorage.getItem('raka_token');
    const res = await fetch(`${(import.meta as any).env?.VITE_API_URL || 'https://api.notificbot.ru'}/media/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) return json as { ok: true; mediaKind: 'photo'; mediaPath: string; mediaMime?: string; mediaSize?: number };
    return null;
  }

  const VOICE_MAX_MS = 180_000;
  const VOICE_MAX_BYTES = 20 * 1024 * 1024; // client-side guard (server may enforce differently)

  function formatMmSs(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(s / 60)).padStart(1, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function stopVoiceTracks() {
    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {
      // ignore
    }
    streamRef.current = null;
  }

  function pickVoiceMimeType() {
    const candidates = [
      // iOS Safari/Chrome often prefer mp4
      'audio/mp4',
      'audio/mp4;codecs=mp4a.40.2',
      // Android/Chrome
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ];

    const MR: any = (window as any).MediaRecorder;
    if (!MR?.isTypeSupported) return '';
    return candidates.find((t) => MR.isTypeSupported(t)) || '';
  }

  function explainMicError(e: any) {
    const name = e?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Нет доступа к микрофону. Разреши микрофон для сайта в настройках браузера/сайта и попробуй снова.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'Микрофон не найден. Подключи микрофон и попробуй снова.';
    }
    if (name === 'NotReadableError') {
      return 'Не удалось открыть микрофон (он занят другим приложением?). Закрой другие приложения, которые используют микрофон.';
    }
    if (name === 'SecurityError') {
      return 'Запись микрофона доступна только по HTTPS.';
    }
    return 'Не удалось получить доступ к микрофону.';
  }

  async function startVoiceRecording() {
    if (!activeChatId) return;
    if (voiceStatus === 'recording') return;
    if (voiceBusy) return;

    // if user already has a draft voice, starting recording means "re-record"
    if (voiceStatus === 'ready') {
      cancelVoice();
    }

    // Capability checks
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Этот браузер не поддерживает запись микрофона.', 'error');
      return;
    }
    if (!(window as any).MediaRecorder) {
      toast('MediaRecorder не поддерживается в этом браузере. Попробуй обновить iOS/браузер.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickVoiceMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaRecorderRef.current = rec;

      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data && (e.data as any).size > 0) chunks.push(e.data);
      };

      rec.onerror = (ev: any) => {
        console.error('MediaRecorder error', ev);
        toast('Ошибка записи голосового.', 'error');
        try {
          rec.stop();
        } catch {
          // ignore
        }
      };

      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });

        // cleanup timers/streams
        if (voiceTimerRef.current) {
          window.clearInterval(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
        mediaRecorderRef.current = null;
        stopVoiceTracks();

        const dur = Math.min(Date.now() - voiceStartedAtRef.current, VOICE_MAX_MS);

        if (!blob || (blob as any).size === 0) {
          setVoiceStatus('idle');
          setVoiceBlob(null);
          setVoiceDurationMs(0);
          setVoiceMime('');
          toast('Голосовое не записалось (пустой файл). Попробуй ещё раз.', 'error');
          return;
        }

        if ((blob as any).size > VOICE_MAX_BYTES) {
          setVoiceStatus('idle');
          setVoiceBlob(null);
          setVoiceDurationMs(0);
          setVoiceMime('');
          toast('Голосовое слишком большое. Попробуй записать короче.', 'error');
          return;
        }

        setVoiceBlob(blob);
        setVoiceMime(blob.type || rec.mimeType || mime || '');
        setVoiceDurationMs(dur);
        setVoiceStatus('ready');

        if (dur >= VOICE_MAX_MS) {
          // Inform about limit (we auto-stopped at max duration)
          console.log('Voice: reached max duration');
        }
      };

      setVoiceBlob(null);
      setVoiceDurationMs(0);
      setVoiceMime('');
      setVoiceStatus('recording');
      voiceStartedAtRef.current = Date.now();

      // Update duration timer + auto-stop at max duration
      if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = window.setInterval(() => {
        const dur = Date.now() - voiceStartedAtRef.current;
        setVoiceDurationMs(Math.min(dur, VOICE_MAX_MS));
        if (dur >= VOICE_MAX_MS) {
          // stop & hint
          try {
            stopVoiceRecording();
          } finally {
            toast(`Лимит голосового — 3 минуты. Запись остановлена (${formatMmSs(VOICE_MAX_MS)}).`, 'info');
          }
        }
      }, 200);

      rec.start();
    } catch (e: any) {
      // full cleanup
      if (voiceTimerRef.current) {
        window.clearInterval(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
      mediaRecorderRef.current = null;
      stopVoiceTracks();

      setVoiceStatus('idle');
      toast(explainMicError(e), 'error');
      console.error(e);
    }
  }

  function stopVoiceRecording() {
    if (voiceStatus !== 'recording') return;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
  }

  function cancelVoice() {
    // Cancel / delete current voice draft (and stop recording if active)
    try {
      if (voiceStatus === 'recording') stopVoiceRecording();
    } catch {
      // ignore
    }

    if (voiceTimerRef.current) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    mediaRecorderRef.current = null;
    stopVoiceTracks();

    setVoiceStatus('idle');
    setVoiceBlob(null);
    setVoiceDurationMs(0);
    setVoiceMime('');
    setVoiceBusy(false);
  }

  async function uploadVoice(): Promise<
    | null
    | {
        ok: true;
        mediaKind: 'voice';
        mediaPath: string;
        mediaMime?: string;
        mediaSize?: number;
        mediaDurationMs?: number;
      }
    | { ok: false; error: string }
  > {
    if (!voiceBlob) return null;

    if ((voiceBlob as any).size > VOICE_MAX_BYTES) {
      return { ok: false, error: 'VOICE_TOO_BIG' };
    }

    const fd = new FormData();
    // filename is mostly informational; backend will normalize to m4a anyway
    const ext = voiceMime.includes('mp4') ? 'm4a' : voiceMime.includes('ogg') ? 'ogg' : 'webm';
    fd.append('file', voiceBlob, `voice.${ext}`);

    const token = localStorage.getItem('raka_token');
    const res = await fetch(`${(import.meta as any).env?.VITE_API_URL || 'https://api.notificbot.ru'}/media/voice`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });

    const json = await res.json().catch(() => null);
    if (json?.ok) {
      return json as any;
    }

    // Standardize error shape
    const err = json?.error || (res.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'UPLOAD_FAILED');
    return { ok: false, error: err };
  }

  async function sendVoice() {
    if (!activeChatId) return;
    if (voiceStatus !== 'ready' || !voiceBlob) return;
    if (voiceBusy) return;

    setVoiceBusy(true);
    try {
      const up = await uploadVoice();

      if (!up) {
        toast('Не удалось загрузить голосовое (нет файла)', 'error');
        return;
      }

      if (!up.ok) {
        const msg =
          up.error === 'VOICE_TOO_LONG'
            ? 'Голосовое слишком длинное (лимит 3 минуты).'
            : up.error === 'PAYLOAD_TOO_LARGE' || up.error === 'VOICE_TOO_BIG'
              ? 'Голосовое слишком большое. Попробуй записать короче.'
              : up.error === 'UNAUTHORIZED'
                ? 'Сессия истекла. Перезайди в аккаунт.'
                : 'Не удалось загрузить голосовое.';
        toast(msg, 'error');
        return;
      }

      // clear locally before send to feel snappy
      setVoiceStatus('idle');
      setVoiceBlob(null);
      setVoiceDurationMs(0);
      setVoiceMime('');

      const r = await api<any>(`/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mediaKind: 'voice',
          mediaPath: up.mediaPath,
          mediaMime: up.mediaMime,
          mediaSize: up.mediaSize,
          mediaDurationMs: up.mediaDurationMs,
        }),
      });

      if (r?.ok) {
        setMessages((prev) => ({
          ...prev,
          [activeChatId]: [...(prev[activeChatId] || []), r.message],
        }));
      } else {
        toast(`Не удалось отправить сообщение: ${r?.error || 'SEND_FAILED'}`, 'error');
      }
    } finally {
      setVoiceBusy(false);
    }
  }

  async function sendMessage() {
    if (!activeChatId) return;

    const text = composer.trim();
    const hasText = !!text;
    const hasPhoto = !!photoFile;
    if (!hasText && !hasPhoto) return;

    setComposer('');

    let mediaPath: string | undefined;
    let mediaKind: 'photo' | undefined;
    let mediaMime: string | undefined;
    let mediaSize: number | undefined;

    if (hasPhoto) {
      const up = await uploadPhoto();
      if (!up) {
        toast('Не удалось загрузить фото', 'error')
        return;
      }
      mediaPath = up.mediaPath;
      mediaKind = 'photo';
      mediaMime = (up as any).mediaMime;
      mediaSize = (up as any).mediaSize;
      setPhotoFile(null);
    }

    const r = await api<any>(`/chats/${activeChatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: hasText ? text : undefined,
        mediaKind,
        mediaPath,
        mediaMime,
        mediaSize,
      }),
    });

    if (r?.ok) {
      setMessages((prev) => ({
        ...prev,
        [activeChatId]: [...(prev[activeChatId] || []), r.message],
      }));
    }
  }

  function onWsMessageNew(msg: Message) {
    setMessages((prev) => {
      const arr = prev[msg.chatId] || [];
      // avoid duplicates
      if (arr.some((m) => m.id === msg.id)) return prev;
      return { ...prev, [msg.chatId]: [...arr, msg] };
    });
  }

  // Cleanup voice recording if hook unmounts / user logs out
  useEffect(() => {
    return () => {
      try {
        cancelVoice();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!me) return;
    loadChats();

    setWsStatus('Connecting…');
    const s = connectSocket(onWsMessageNew);
    if (s) {
      s.on('connect', () => setWsStatus('online'));
      s.on('disconnect', () => setWsStatus('offline'));
    } else {
      setWsStatus('no token');
    }

    return () => {
      emitPresenceActive(null);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    if (activeChatId) loadMessages(activeChatId);
    // Tell backend which chat is currently open to suppress redundant push.
    emitPresenceActive(activeChatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  return {
    chats,
    activeChatId,
    setActiveChatId,
    activeMessages,
    peerPhone,
    setPeerPhone,
    createDirect,
    composer,
    setComposer,
    photoFile,
    setPhotoFile,
    sendMessage,

    // voice
    voiceStatus,
    voiceDurationMs,
    voiceBusy,
    startVoiceRecording,
    stopVoiceRecording,
    sendVoice,
    cancelVoice,
    setVoiceStatus,
    setVoiceBlob,

    wsStatus,
    loadChats,
  };
}
