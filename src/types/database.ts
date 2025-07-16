
export type AppRole = 'user' | 'admin';
export type ItemType = 'lost' | 'found';
export type ItemStatus = 'active' | 'claimed' | 'archived';
export type ClaimStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  username: string;
  full_name?: string;
  role: AppRole;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  title: string;
  description: string;
  image_url?: string;
  category: string;
  tags: string[];
  location: string;
  status: ItemStatus;
  type: ItemType;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface Claim {
  id: string;
  item_id: string;
  claimant_id: string;
  message: string;
  status: ClaimStatus;
  created_at: string;
  updated_at: string;
  items?: Item;
  profiles?: Profile;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  item_id: string;
  message: string;
  read: boolean;
  created_at: string;
  updated_at: string;
  items?: Item;
  profiles?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}
