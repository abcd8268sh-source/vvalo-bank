import type { Timestamp } from 'firebase/firestore';

export type AccountStatus = 'active' | 'frozen';
export type TransactionType = 'transfer' | 'topup';
export type TransactionStatus = 'completed';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  iban: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface IbanDirectoryEntry {
  iban: string;
  ownerUid: string;
  accountHolderName: string;
  createdAt: Timestamp | null;
}

export interface BankAccount {
  ownerUid: string;
  iban: string;
  balanceCents: number;
  currency: 'EUR';
  accountStatus: AccountStatus;
  lastTxId: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface TransactionRecord {
  txId: string;
  type: TransactionType;
  status: TransactionStatus;
  senderUid: string;
  recipientUid: string;
  senderIban: string;
  recipientIban: string;
  senderName: string;
  recipientName: string;
  amountCents: number;
  note: string;
  createdAt: Timestamp | null;
}

export interface SavedContact {
  iban: string;
  ownerUid: string;
  name: string;
  addedAt: Timestamp | null;
}

export type AppTab = 'home' | 'send' | 'activity' | 'card' | 'admin';
