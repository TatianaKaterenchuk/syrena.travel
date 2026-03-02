import { Timestamp } from 'firebase/firestore';

export type AccountStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  email: string;
  photoURL: string;
  bio: string;
  referralSource?: string;
  placesCount: number;
  friendsCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isAdmin?: boolean;
  status?: AccountStatus;
  expoPushToken?: string;
}

export interface Friend {
  uid: string;
  displayName: string;
  username: string;
  photoURL: string;
  addedAt: Timestamp;
  status: 'pending' | 'accepted';
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  toUid: string;
  fromName: string;
  fromPhoto: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp;
}
