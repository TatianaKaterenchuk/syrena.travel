import { Timestamp } from 'firebase/firestore';

export interface Guide {
  id: string;
  /** Who added this recommendation */
  userId: string;
  userName: string;
  userPhoto: string;
  /** Tour guide / company info */
  name: string;
  city: string;
  country: string;
  description: string;
  websiteURL: string;
  photoURL: string;
  /** Likes */
  likesCount: number;
  likedBy: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
