# Security Specification — Valo Bank (Virtual IBAN Banking)

## 1. Data Invariants
1. **PII Isolation**: User email addresses exist only in `/users/{userId}` and are readable exclusively by `request.auth.uid == userId`. `/ibanDirectory/{iban}` exposes only `iban`, `ownerUid`, `accountHolderName`, and `createdAt` via exact `get` lookups (no blanket `list`).
2. **Account Ownership & Privacy**: `/accounts/{userId}` can only be read (`get` or `list`) by `request.auth.uid == userId`. Peer transfers credit the recipient blindly via atomic batch updates without granting read access to the recipient's balance.
3. **Atomic Balance Conservation**: Every peer transfer (`type == 'transfer'`) must atomically create `/transactions/{txId}`, debit `/accounts/{senderUid}` by exact `amountCents`, and credit `/accounts/{recipientUid}` by exact `amountCents`, verified via `getAfter()` and `existsAfter()`.
4. **Non-Negative Balances**: `balanceCents` is strictly an integer `>= 0`. Frozen accounts (`accountStatus == 'frozen'`) cannot debit or receive transfers.
5. **Immutable Financial Ledger**: `/transactions/{txId}` documents cannot be updated or deleted once created.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must equal `request.time`.
7. **Master Gate on Subcollections**: `/users/{userId}/contacts/{contactIban}` requires the parent `/users/{userId}` document to exist and ownership to match `request.auth.uid == userId`.

## 2. The "Dirty Dozen" Attack Payloads
1. **PII Blanket Read**: Unauthenticated or non-owner `get` / `list` on `/users/{otherUid}` -> `PERMISSION_DENIED`.
2. **Directory Scraping**: `list` query on `/ibanDirectory` without `where('ownerUid', '==', auth.uid)` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection**: Create `/users/{uid}` with extra field `isAdmin: true` or `role: 'admin'` -> `PERMISSION_DENIED` (`keys().hasOnly(...)`).
4. **Arbitrary Balance Inflation**: Create `/accounts/{uid}` with `balanceCents: 999999999` instead of `100000` -> `PERMISSION_DENIED`.
5. **Negative / Overdraft Debit**: Update `/accounts/{uid}` to `balanceCents: -500` -> `PERMISSION_DENIED`.
6. **Unbacked Peer Credit**: Update `/accounts/{victimUid}` to steal or credit money without an atomic matching `/transactions/{txId}` and matching sender debit -> `PERMISSION_DENIED`.
7. **Peer Account Drain**: Update `/accounts/{victimUid}` with `balanceCents < existing().balanceCents` -> `PERMISSION_DENIED`.
8. **Self-Transfer Forgery**: Create `/transactions/{txId}` with `senderUid == recipientUid` for `type == 'transfer'` -> `PERMISSION_DENIED`.
9. **Ledger Tampering**: Update or delete an existing `/transactions/{txId}` -> `PERMISSION_DENIED`.
10. **Spoofed Timestamp**: Create `/transactions/{txId}` with client-backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
11. **ID Poisoning / Resource Exhaustion**: Create document with 1.5KB path ID or invalid characters -> `PERMISSION_DENIED` (`isValidId` / `isValidIbanId`).
12. **Unverified Email Write**: Attempt any write with `request.auth.token.email_verified == false` -> `PERMISSION_DENIED`.
