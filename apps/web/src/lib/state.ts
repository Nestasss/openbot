import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chat, Message, User } from './types';
import { api, clearToken, setToken } from './api';
import { connectSocket, disconnectSocket } from './socket';

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

      if (r?.ok && r.accessToken) {
        setToken(r.accessToken);
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
      alert(r?.error === 'PEER_NOT_FOUND' ? 'Пользователь ещё не логинился. Пусть сначала войдёт.' : `Error: ${r?.error}`);
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

  async function startVoiceRecording() {
    if (!activeChatId) return;
    if (voiceStatus === 'recording') return;

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

      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        setVoiceBlob(blob);
        setVoiceMime(blob.type || rec.mimeType || mime || '');
        const dur = Math.min(Date.now() - voiceStartedAtRef.current, 180_000);
        setVoiceDurationMs(dur);
        setVoiceStatus('ready');

        // stop tracks
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        streamRef.current = null;
        mediaRecorderRef.current = null;

        if (voiceTimerRef.current) {
          window.clearInterval(voiceTimerRef.current);
          voiceTimerRef.current = null;
        }
      };

      setVoiceBlob(null);
      setVoiceDurationMs(0);
      setVoiceMime('');
      setVoiceStatus('recording');
      voiceStartedAtRef.current = Date.now();

      // Update duration timer + auto-stop at 180s
      if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = window.setInterval(() => {
        const dur = Date.now() - voiceStartedAtRef.current;
        setVoiceDurationMs(Math.min(dur, 180_000));
        if (dur >= 180_000) {
          stopVoiceRecording();
        }
      }, 200);

      rec.start();
    } catch (e: any) {
      setVoiceStatus('idle');
      alert('Не удалось получить доступ к микрофону');
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

  async function uploadVoice() {
    if (!voiceBlob) return null;

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
    if (json?.ok) return json as {
      ok: true;
      mediaKind: 'voice';
      mediaPath: string;
      mediaMime?: string;
      mediaSize?: number;
      mediaDurationMs?: number;
    };

    return null;
  }

  async function sendVoice() {
    if (!activeChatId) return;
    if (voiceStatus !== 'ready' || !voiceBlob) return;

    const up = await uploadVoice();
    if (!up?.ok) {
      alert('Не удалось загрузить голосовое');
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
        alert('Не удалось загрузить фото')
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
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    if (activeChatId) loadMessages(activeChatId);
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
    startVoiceRecording,
    stopVoiceRecording,
    sendVoice,
    setVoiceStatus,
    setVoiceBlob,

    wsStatus,
    loadChats,
  };
}
