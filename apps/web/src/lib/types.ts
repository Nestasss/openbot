export type User = {
  id: string;
  phone: string;
  name?: string | null;
  avatarPath?: string | null;
  notificationsEnabled?: boolean;
  createdAt: string;
};

export type Chat = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  peer?: { id: string; phone: string; name?: string | null; avatarPath?: string | null } | null;
  participants: { id: string; phone: string }[];
  lastMessage?: {
    id: string;
    senderId: string;
    text?: string | null;
    mediaPath?: string | null;
    createdAt: string;
  } | null;
  myLastReadAt?: string | null;
  peerLastReadAt?: string | null;
  unreadCount?: number;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  text?: string | null;
  mediaPath?: string | null;
  createdAt: string;
};
