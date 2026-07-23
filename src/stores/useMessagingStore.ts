import { create } from 'zustand';
import { Conversation, Message } from '../types';
import { Timestamp } from 'firebase/firestore';
import {
  getDocuments,
  createDocument,
  updateDocument,
  subscribeToDocuments,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Unsubscribe,
} from '../services/firebase/firestore';
import { sendPushToUser } from '../services/notifications';

interface MessagingState {
  conversations: Conversation[];
  messages: Record<string, Message[]>; // keyed by conversationId
  isLoading: boolean;
  unreadCount: number;

  fetchConversations: (uid: string) => Promise<void>;
  subscribeConversations: (uid: string) => Unsubscribe;
  fetchMessages: (conversationId: string) => Promise<void>;
  subscribeMessages: (conversationId: string) => Unsubscribe;
  sendMessage: (
    conversationId: string,
    fromUid: string,
    fromName: string,
    text: string,
    recipientUid: string,
  ) => Promise<void>;
  getOrCreateConversation: (
    uid: string,
    uidName: string,
    uidPhoto: string,
    recipientUid: string,
    recipientName: string,
    recipientPhoto: string,
  ) => Promise<string>; // returns conversationId
  markAsRead: (conversationId: string, uid: string) => Promise<void>;
  computeUnread: (uid: string) => void;
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  conversations: [],
  messages: {},
  isLoading: false,
  unreadCount: 0,

  fetchConversations: async (uid: string) => {
    set({ isLoading: true });
    try {
      const convos = await getDocuments<Conversation>('conversations', [
        where('participants', 'array-contains', uid),
      ]);
      // Sort client-side — newest first
      convos.sort((a, b) => {
        const aTime = a.lastMessageAt?.toMillis?.() ?? 0;
        const bTime = b.lastMessageAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      set({ conversations: convos });
      get().computeUnread(uid);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  subscribeConversations: (uid: string) => {
    return subscribeToDocuments<Conversation>(
      'conversations',
      [where('participants', 'array-contains', uid)],
      (convos) => {
        // Sort client-side — newest first
        const sorted = [...convos].sort((a, b) => {
          const aTime = a.lastMessageAt?.toMillis?.() ?? 0;
          const bTime = b.lastMessageAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
        set({ conversations: sorted });
        get().computeUnread(uid);
      },
      (error) => console.error('[subscribeConversations] error:', error),
    );
  },

  fetchMessages: async (conversationId: string) => {
    try {
      // Limit server-side — long threads used to download EVERY message
      // and then throw away all but 100 client-side.
      const msgs = await getDocuments<Message>('messages', [
        where('conversationId', '==', conversationId),
        orderBy('createdAt', 'desc'),
        limit(100),
      ]);
      set((state) => ({
        messages: { ...state.messages, [conversationId]: msgs },
      }));
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  },

  subscribeMessages: (conversationId: string) => {
    return subscribeToDocuments<Message>(
      'messages',
      [
        where('conversationId', '==', conversationId),
        orderBy('createdAt', 'desc'),
        limit(100),
      ],
      (msgs) => {
        // Firestore is the source of truth — replace everything
        set((state) => ({
          messages: { ...state.messages, [conversationId]: msgs },
        }));
      },
      (error) => console.error('[subscribeMessages] error:', error),
    );
  },

  sendMessage: async (conversationId, fromUid, fromName, text, recipientUid) => {
    const trimmed = text.trim();

    // Optimistic update: add message to local state immediately
    const tempId = 'temp-' + Date.now();
    const tempMessage: Message = {
      id: tempId,
      conversationId,
      fromUid,
      text: trimmed,
      createdAt: Timestamp.now(),
    };
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [tempMessage, ...(state.messages[conversationId] || [])],
      },
    }));

    try {
      // Create the message in Firestore (createdAt added automatically by createDocument)
      await createDocument('messages', {
        conversationId,
        fromUid,
        text: trimmed,
      });

      // Update conversation with last message info
      await updateDocument('conversations', conversationId, {
        lastMessage: trimmed,
        lastMessageAt: serverTimestamp(),
        lastMessageFromUid: fromUid,
        unreadBy: [recipientUid],
      });

      // Send push notification to recipient
      const preview = trimmed.length > 80 ? trimmed.slice(0, 80) + '...' : trimmed;
      sendPushToUser(recipientUid, fromName, preview, {
        type: 'message',
        conversationId,
        fromUid,
        fromName,
      });
    } catch (error) {
      // Remove optimistic message on error
      set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: (state.messages[conversationId] || []).filter(
            (m) => m.id !== tempId,
          ),
        },
      }));
      console.error('Error sending message:', error);
      throw error;
    }
  },

  getOrCreateConversation: async (
    uid,
    uidName,
    uidPhoto,
    recipientUid,
    recipientName,
    recipientPhoto,
  ) => {
    try {
      // Check if conversation already exists
      const existing = await getDocuments<Conversation>('conversations', [
        where('participants', 'array-contains', uid),
      ]);

      const found = existing.find((c) => c.participants.includes(recipientUid));
      if (found) return found.id;

      // Create new conversation
      const id = await createDocument('conversations', {
        participants: [uid, recipientUid],
        participantNames: { [uid]: uidName, [recipientUid]: recipientName },
        participantPhotos: { [uid]: uidPhoto, [recipientUid]: recipientPhoto },
        lastMessage: '',
        lastMessageAt: serverTimestamp(),
        lastMessageFromUid: '',
        unreadBy: [],
      });

      return id;
    } catch (error) {
      console.error('Error getting/creating conversation:', error);
      throw error;
    }
  },

  markAsRead: async (conversationId, uid) => {
    try {
      const convo = get().conversations.find((c) => c.id === conversationId);
      if (!convo) return;
      if (!convo.unreadBy?.includes(uid)) return;

      const newUnreadBy = convo.unreadBy.filter((u) => u !== uid);
      await updateDocument('conversations', conversationId, {
        unreadBy: newUnreadBy,
      });
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  },

  computeUnread: (uid: string) => {
    const count = get().conversations.filter((c) => c.unreadBy?.includes(uid)).length;
    set({ unreadCount: count });
  },
}));
