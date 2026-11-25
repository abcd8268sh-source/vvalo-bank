import type { User } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type {
  AccountStatus,
  BankAccount,
  IbanDirectoryEntry,
  UserProfile,
} from '../types/banking';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  generateCandidateIban,
  generateTxId,
  isAdminEmail,
  isValidIban,
  normalizeIban,
  sanitizeDisplayName,
  sanitizeNote,
  VALIDATION_RULES,
} from './validation';

export async function ensureUserAccountInitialized(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const accountPath = `accounts/${user.uid}`;

  let userSnap;
  try {
    userSnap = await getDoc(doc(db, 'users', user.uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  let accountSnap;
  try {
    accountSnap = await getDoc(doc(db, 'accounts', user.uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, accountPath);
  }

  if (userSnap.exists() && accountSnap.exists()) {
    return;
  }

  // Generate unique unused VA42 IBAN
  let assignedIban = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateCandidateIban();
    try {
      const existing = await getDoc(doc(db, 'ibanDirectory', candidate));
      if (!existing.exists()) {
        assignedIban = candidate;
        break;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `ibanDirectory/${candidate}`);
    }
  }

  if (!assignedIban) {
    throw new Error('Could not allocate a unique virtual IBAN. Please try again.');
  }

  const displayName = sanitizeDisplayName(
    user.displayName || user.email?.split('@')[0] || 'Valo Member'
  );
  const email = (user.email || `${user.uid}@valo.local`).slice(0, 160);
  const welcomeTxId = generateTxId('welcome');

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'users', user.uid), {
      uid: user.uid,
      email,
      displayName,
      iban: assignedIban,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'ibanDirectory', assignedIban), {
      iban: assignedIban,
      ownerUid: user.uid,
      accountHolderName: displayName,
      createdAt: serverTimestamp(),
    });

    batch.set(doc(db, 'accounts', user.uid), {
      ownerUid: user.uid,
      iban: assignedIban,
      balanceCents: VALIDATION_RULES.WELCOME_BONUS_CENTS,
      currency: 'EUR',
      accountStatus: 'active',
      lastTxId: welcomeTxId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'transactions', welcomeTxId), {
      txId: welcomeTxId,
      type: 'topup',
      status: 'completed',
      senderUid: 'SYSTEM_VAULT',
      recipientUid: user.uid,
      senderIban: 'VA0000000000000000',
      recipientIban: assignedIban,
      senderName: 'Valo Play Treasury',
      recipientName: displayName,
      amountCents: VALIDATION_RULES.WELCOME_BONUS_CENTS,
      note: 'Welcome virtual balance',
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function lookupIbanRecipient(
  rawIban: string
): Promise<IbanDirectoryEntry | null> {
  const cleanIban = normalizeIban(rawIban);
  if (!isValidIban(cleanIban)) {
    return null;
  }

  const path = `ibanDirectory/${cleanIban}`;
  try {
    const snap = await getDoc(doc(db, 'ibanDirectory', cleanIban));
    if (!snap.exists()) {
      return null;
    }
    return snap.data() as IbanDirectoryEntry;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function sendIbanTransfer(params: {
  senderProfile: UserProfile;
  senderAccount: BankAccount;
  recipient: IbanDirectoryEntry;
  amountCents: number;
  note: string;
}): Promise<string> {
  const { senderProfile, senderAccount, recipient, amountCents, note } = params;
  const isAdmin = isAdminEmail(senderProfile.email);

  if (senderAccount.accountStatus !== 'active') {
    throw new Error('Your account is currently frozen. Unfreeze it in the Card tab to send funds.');
  }
  if (recipient.ownerUid === senderProfile.uid || recipient.iban === senderAccount.iban) {
    throw new Error('You cannot transfer funds to your own IBAN.');
  }
  const maxAllowed = isAdmin
    ? VALIDATION_RULES.MAX_ADMIN_TRANSFER_CENTS
    : VALIDATION_RULES.MAX_TRANSFER_CENTS;
  if (
    !Number.isInteger(amountCents) ||
    amountCents < VALIDATION_RULES.MIN_TRANSFER_CENTS ||
    amountCents > maxAllowed
  ) {
    throw new Error(
      isAdmin
        ? 'Transfer amount must be between €0.01 and €1,000,000,000.00.'
        : 'Transfer amount must be between €0.01 and €100,000.00.'
    );
  }
  if (!isAdmin && amountCents > senderAccount.balanceCents) {
    throw new Error('Insufficient virtual balance for this transfer.');
  }

  const txId = generateTxId('tx');
  const cleanNote = sanitizeNote(note);

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'transactions', txId), {
      txId,
      type: 'transfer',
      status: 'completed',
      senderUid: senderProfile.uid,
      recipientUid: recipient.ownerUid,
      senderIban: senderAccount.iban,
      recipientIban: recipient.iban,
      senderName: sanitizeDisplayName(senderProfile.displayName),
      recipientName: sanitizeDisplayName(recipient.accountHolderName),
      amountCents,
      note: cleanNote,
      createdAt: serverTimestamp(),
    });

    if (isAdmin) {
      // Admin holds unlimited funds: balance stays untouched, only lastTxId & updatedAt update
      batch.update(doc(db, 'accounts', senderProfile.uid), {
        lastTxId: txId,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(doc(db, 'accounts', senderProfile.uid), {
        balanceCents: increment(-amountCents),
        lastTxId: txId,
        updatedAt: serverTimestamp(),
      });
    }

    batch.update(doc(db, 'accounts', recipient.ownerUid), {
      balanceCents: increment(amountCents),
      lastTxId: txId,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return txId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `transactions/${txId}`);
  }
}

export async function claimVirtualTopUp(
  profile: UserProfile,
  account: BankAccount
): Promise<string> {
  if (account.accountStatus !== 'active') {
    throw new Error('Unfreeze your account before adding virtual funds.');
  }
  if (
    account.balanceCents + VALIDATION_RULES.TOPUP_AMOUNT_CENTS >
    VALIDATION_RULES.MAX_ACCOUNT_BALANCE_CENTS
  ) {
    throw new Error('Virtual balance cap (€1,000,000.00) reached.');
  }

  const txId = generateTxId('topup');

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'transactions', txId), {
      txId,
      type: 'topup',
      status: 'completed',
      senderUid: 'SYSTEM_VAULT',
      recipientUid: profile.uid,
      senderIban: 'VA0000000000000000',
      recipientIban: account.iban,
      senderName: 'Valo Play Treasury',
      recipientName: sanitizeDisplayName(profile.displayName),
      amountCents: VALIDATION_RULES.TOPUP_AMOUNT_CENTS,
      note: 'Virtual play-money top-up',
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'accounts', profile.uid), {
      balanceCents: increment(VALIDATION_RULES.TOPUP_AMOUNT_CENTS),
      lastTxId: txId,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return txId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `accounts/${profile.uid}`);
  }
}

export async function adminGrantFunds(params: {
  recipientUid: string;
  recipientIban: string;
  recipientName: string;
  amountCents: number;
  note?: string;
}): Promise<string> {
  const { recipientUid, recipientIban, recipientName, amountCents, note } = params;
  if (
    !Number.isInteger(amountCents) ||
    amountCents < VALIDATION_RULES.MIN_TRANSFER_CENTS ||
    amountCents > VALIDATION_RULES.MAX_ADMIN_TRANSFER_CENTS
  ) {
    throw new Error('Grant amount must be between €0.01 and €1,000,000,000.00.');
  }

  const txId = generateTxId('mint');
  const cleanNote = sanitizeNote(note || 'Admin treasury mint');

  try {
    const batch = writeBatch(db);

    batch.set(doc(db, 'transactions', txId), {
      txId,
      type: 'topup',
      status: 'completed',
      senderUid: 'SYSTEM_VAULT',
      recipientUid,
      senderIban: 'VA0000000000000000',
      recipientIban,
      senderName: 'Valo Admin Treasury',
      recipientName: sanitizeDisplayName(recipientName),
      amountCents,
      note: cleanNote,
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'accounts', recipientUid), {
      balanceCents: increment(amountCents),
      lastTxId: txId,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    return txId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `accounts/${recipientUid}`);
  }
}

export async function toggleAccountFreeze(
  uid: string,
  nextStatus: AccountStatus
): Promise<void> {
  const path = `accounts/${uid}`;
  try {
    await updateDoc(doc(db, 'accounts', uid), {
      accountStatus: nextStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateAccountHolderName(
  uid: string,
  iban: string,
  nextName: string
): Promise<void> {
  const cleanName = sanitizeDisplayName(nextName);
  const path = `users/${uid}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid), {
      displayName: cleanName,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'ibanDirectory', iban), {
      accountHolderName: cleanName,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveBeneficiaryContact(
  uid: string,
  recipient: IbanDirectoryEntry
): Promise<void> {
  const path = `users/${uid}/contacts/${recipient.iban}`;
  try {
    await setDoc(doc(db, 'users', uid, 'contacts', recipient.iban), {
      iban: recipient.iban,
      ownerUid: uid,
      name: sanitizeDisplayName(recipient.accountHolderName),
      addedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeBeneficiaryContact(
  uid: string,
  iban: string
): Promise<void> {
  const cleanIban = normalizeIban(iban);
  const path = `users/${uid}/contacts/${cleanIban}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'contacts', cleanIban));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
