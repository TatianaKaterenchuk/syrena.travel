import { create } from 'zustand';
import { Timestamp } from 'firebase/firestore';
import { Friend, FriendRequest } from '../types';
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  where,
} from '../services/firebase/firestore';

interface FriendsState {
  friends: Friend[];
  requests: FriendRequest[];
  sentRequests: FriendRequest[];
  isLoading: boolean;
}

interface FriendsActions {
  fetchFriends: (userId: string) => Promise<void>;
  sendRequest: (fromUid: string, fromName: string, fromPhoto: string, toUid: string, toName: string) => Promise<void>;
  acceptRequest: (requestId: string, request: FriendRequest, acceptorName?: string, acceptorPhoto?: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendDocId: string) => Promise<void>;
  getMutualFriends: (otherUserId: string) => Promise<Friend[]>;
}

export const useFriendsStore = create<FriendsState & FriendsActions>((set, get) => ({
  friends: [],
  requests: [],
  sentRequests: [],
  isLoading: false,

  fetchFriends: async (userId: string) => {
    set({ isLoading: true });
    try {
      const [allFriends, incomingRequests, outgoingRequests] = await Promise.all([
        getDocuments<Friend>('friends', [
          where('userId', '==', userId),
        ]),
        getDocuments<FriendRequest>('friendRequests', [
          where('toUid', '==', userId),
        ]),
        getDocuments<FriendRequest>('friendRequests', [
          where('fromUid', '==', userId),
        ]),
      ]);
      // Sort & filter client-side to avoid composite index requirements
      const friends = allFriends.sort((a, b) => {
        const aTime = a.addedAt?.toMillis?.() ?? 0;
        const bTime = b.addedAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      const requests = incomingRequests.filter((r) => r.status === 'pending');
      const sentRequests = outgoingRequests.filter((r) => r.status === 'pending');
      set({ friends, requests, sentRequests, isLoading: false });
    } catch (error) {
      console.error('Error fetching friends:', error);
      set({ friends: [], requests: [], sentRequests: [], isLoading: false });
    }
  },

  sendRequest: async (fromUid, fromName, fromPhoto, toUid, toName) => {
    try {
      // Check for existing request in either direction to prevent duplicates
      const [outgoing, incoming] = await Promise.all([
        getDocuments<FriendRequest>('friendRequests', [
          where('fromUid', '==', fromUid),
          where('toUid', '==', toUid),
        ]),
        getDocuments<FriendRequest>('friendRequests', [
          where('fromUid', '==', toUid),
          where('toUid', '==', fromUid),
        ]),
      ]);

      const allExisting = [...outgoing, ...incoming];
      if (allExisting.some((r) => r.status === 'pending')) {
        return; // Pending request already exists
      }

      // Also check if already friends
      const { friends } = get();
      if (friends.some((f) => f.uid === toUid)) {
        return; // Already friends
      }

      const id = await createDocument('friendRequests', {
        fromUid,
        toUid,
        fromName,
        fromPhoto,
        status: 'pending',
      });
      const newRequest: FriendRequest = {
        id,
        fromUid,
        toUid,
        fromName,
        fromPhoto,
        status: 'pending' as const,
        createdAt: Timestamp.fromMillis(Date.now()),
      };
      set((state) => ({
        sentRequests: [...state.sentRequests, newRequest],
      }));
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  },

  acceptRequest: async (requestId, request, acceptorName?: string, acceptorPhoto?: string) => {
    try {
      // Check if already friends to prevent duplicates (check both directions)
      const [existingForAcceptor, existingForSender] = await Promise.all([
        getDocuments<Friend>('friends', [
          where('userId', '==', request.toUid),
          where('uid', '==', request.fromUid),
        ]),
        getDocuments<Friend>('friends', [
          where('userId', '==', request.fromUid),
          where('uid', '==', request.toUid),
        ]),
      ]);

      await updateDocument('friendRequests', requestId, { status: 'accepted' });

      // Create friend doc for the ACCEPTOR (so they see the sender in their list)
      if (existingForAcceptor.length === 0) {
        const friendDataForAcceptor = {
          uid: request.fromUid,
          displayName: request.fromName,
          username: request.fromName.toLowerCase().replace(/\s+/g, ''),
          photoURL: request.fromPhoto,
          status: 'accepted' as const,
          userId: request.toUid,
        };
        await createDocument('friends', friendDataForAcceptor);
        set((state) => ({
          friends: [...state.friends, { ...friendDataForAcceptor, addedAt: Timestamp.fromMillis(Date.now()) } as Friend],
          requests: state.requests.filter((r) => r.id !== requestId),
        }));
      } else {
        set((state) => ({
          requests: state.requests.filter((r) => r.id !== requestId),
        }));
      }

      // Create friend doc for the SENDER (so they see the acceptor in their list)
      if (existingForSender.length === 0) {
        const friendDataForSender = {
          uid: request.toUid,
          displayName: acceptorName || 'Friend',
          username: (acceptorName || 'friend').toLowerCase().replace(/\s+/g, ''),
          photoURL: acceptorPhoto || '',
          status: 'accepted' as const,
          userId: request.fromUid,
        };
        await createDocument('friends', friendDataForSender);
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      throw error;
    }
  },

  rejectRequest: async (requestId) => {
    try {
      await updateDocument('friendRequests', requestId, { status: 'rejected' });
      set((state) => ({
        requests: state.requests.filter((r) => r.id !== requestId),
      }));
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      throw error;
    }
  },

  removeFriend: async (friendUid) => {
    try {
      const { friends } = get();
      const friendObj = friends.find((f) => f.uid === friendUid) as any;
      const myUid = friendObj?.userId || (friends[0] as any)?.userId;

      // Delete MY friend doc (so I no longer see them)
      if (friendObj?.id) {
        await deleteDocument('friends', friendObj.id);
      } else {
        const docs = await getDocuments<Friend>('friends', [
          where('uid', '==', friendUid),
        ]);
        for (const d of docs) {
          await deleteDocument('friends', (d as any).id);
        }
      }

      // Delete THEIR friend doc (so they no longer see me)
      if (myUid) {
        const theirDocs = await getDocuments<Friend>('friends', [
          where('userId', '==', friendUid),
          where('uid', '==', myUid),
        ]);
        for (const d of theirDocs) {
          await deleteDocument('friends', (d as any).id);
        }
      }

      // Clean up old friend requests between us so re-friending works
      if (myUid) {
        const [reqA, reqB] = await Promise.all([
          getDocuments<FriendRequest>('friendRequests', [
            where('fromUid', '==', myUid),
            where('toUid', '==', friendUid),
          ]),
          getDocuments<FriendRequest>('friendRequests', [
            where('fromUid', '==', friendUid),
            where('toUid', '==', myUid),
          ]),
        ]);
        for (const r of [...reqA, ...reqB]) {
          if (r.status === 'accepted') {
            await deleteDocument('friendRequests', (r as any).id || r.id);
          }
        }
      }

      set((state) => ({
        friends: state.friends.filter((f) => f.uid !== friendUid),
      }));
    } catch (error) {
      console.error('Error removing friend:', error);
      throw error;
    }
  },

  getMutualFriends: async (otherUserId: string) => {
    try {
      const { friends: myFriends } = get();
      if (myFriends.length === 0) return [];

      // Fetch the other user's friends from Firestore
      const otherFriends = await getDocuments<Friend>('friends', [
        where('userId', '==', otherUserId),
      ]);

      // Build a Set of the other user's friend UIDs for fast lookup
      const otherFriendUids = new Set(otherFriends.map((f) => f.uid));

      // Return my friends who are also friends of the other user
      return myFriends.filter((f) => otherFriendUids.has(f.uid));
    } catch (error) {
      console.error('Error getting mutual friends:', error);
      return [];
    }
  },
}));
