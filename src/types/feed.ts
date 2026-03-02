import { Timestamp } from 'firebase/firestore';

export type FeedItemType = 'new_place' | 'review' | 'friend_added' | 'place_saved';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  actorId: string;
  actorName: string;
  actorPhoto: string;
  placeId?: string;
  placeName?: string;
  placeImageURL?: string;
  targetUserId?: string;
  targetUserName?: string;
  createdAt: Timestamp;
  visibility: string[];
}
