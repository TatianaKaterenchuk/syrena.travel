import { Timestamp } from 'firebase/firestore';

export interface Conversation {
  id: string;
  participants: string[]; // [uid1, uid2]
  participantNames: Record<string, string>; // { uid: displayName }
  participantPhotos: Record<string, string>; // { uid: photoURL }
  lastMessage: string;
  lastMessageAt: Timestamp;
  lastMessageFromUid: string;
  unreadBy: string[]; // UIDs that haven't read latest message
}

export interface Message {
  id: string;
  conversationId: string;
  fromUid: string;
  text: string;
  createdAt: Timestamp;
}
