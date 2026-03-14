Building a digital wallet is a great backend exercise. The “hard parts” you listed are exactly what prevent money bugs like double spending or ghost transactions. Let’s break them down simply.

1. Idempotency Keys (Prevent Double Spending)
The Problem

Sometimes a request gets sent multiple times:

User double-clicks “Send”

Network retries

Mobile app resends after timeout

Without protection, this can cause multiple transfers.

Example of a dangerous situation:

User sends ₦2000
Request accidentally sent 2 times

Result:
Wallet A: -₦4000
Wallet B: +₦4000
The Idea

Each transfer request includes a unique key:

Idempotency-Key: abc123xyz

Your backend stores this key.
If the same key appears again → ignore or return the original result.

Simple MongoDB Model
const IdempotencySchema = new mongoose.Schema({
  key: String,
  response: Object,
  createdAt: Date
});
Example Express Middleware
async function checkIdempotency(req, res, next) {
  const key = req.headers["idempotency-key"];

  if (!key) return res.status(400).send("Missing key");

  const existing = await Idempotency.findOne({ key });

  if (existing) {
    return res.json(existing.response); // return previous result
  }

  req.idempotencyKey = key;
  next();
}

After the transaction succeeds:

await Idempotency.create({
  key: req.idempotencyKey,
  response: result
});

Now duplicate requests cannot execute again.

2. Ledger Entries (Financial Audit Trail)
The Problem

Wallet balance alone is not trustworthy.

Bad example:

Wallet A balance: ₦8,000

Where did it come from?
Was it correct?
Was something reversed?

You must track every change.

The Idea

A ledger records every balance movement.

Think of it like a bank statement.

Example ledger:

wallet	type	amount	before	after
A	debit	2000	10000	8000
B	credit	2000	3000	5000
Ledger Schema
const LedgerSchema = new mongoose.Schema({
  walletId: String,
  type: "debit" | "credit",
  amount: Number,
  balanceBefore: Number,
  balanceAfter: Number,
  reference: String,
  createdAt: Date
});
Example Entry Creation
await Ledger.create({
  walletId: sender._id,
  type: "debit",
  amount: 2000,
  balanceBefore: 10000,
  balanceAfter: 8000,
  reference: txId
});

Now every transaction is traceable forever.

If something breaks you can reconstruct balances from ledger history.

3. Atomic Debit/Credit (Prevent Partial Transfers)
The Problem

A transfer has two operations:

1 debit sender
2 credit receiver

But what if the server crashes between them?

Example failure:

Debit A: -2000  ✅
Credit B: +2000 ❌ failed

Now ₦2000 disappears.

The Idea

Use a database transaction so both happen together or not at all.

BEGIN
debit sender
credit receiver
COMMIT

If anything fails → ROLLBACK

MongoDB Transaction Example
const session = await mongoose.startSession();
session.startTransaction();

try {

  sender.balance -= amount;
  await sender.save({ session });

  receiver.balance += amount;
  await receiver.save({ session });

  await session.commitTransaction();

} catch (err) {

  await session.abortTransaction();

}

Result:

Debit succeeds + Credit succeeds → COMMIT
Debit succeeds + Credit fails → ROLLBACK

No broken balances.

4. DB Locks (Prevent Race Conditions)
The Problem

Two transfers may run at the same time.

Example:

Wallet A balance = ₦3000

Transfer 1: send ₦2000
Transfer 2: send ₦2000

Both requests read balance = 3000.

Result:

A sends ₦4000
Balance = -₦1000
The Idea

Lock the wallet during the transaction so only one transfer runs at a time.

In SQL you would use:

SELECT * FROM wallets
WHERE id = ?
FOR UPDATE

This locks the row.

MongoDB Equivalent

Use transactions + conditional updates.

Example safe update:

const sender = await Wallet.findOneAndUpdate(
  {
    _id: senderId,
    balance: { $gte: amount }
  },
  {
    $inc: { balance: -amount }
  },
  { session }
);

Meaning:

Only update if balance >= amount

So race conditions fail safely.

Putting It All Together (Transfer Flow)

Your endpoint flow becomes:

POST /transfer
Step 1

Check idempotency key

Step 2

Start DB transaction

Step 3

Lock wallets / validate balance

Step 4

Debit sender

Step 5

Credit receiver

Step 6

Write ledger entries

Step 7

Commit transaction

Step 8

Store idempotency response

Final result:

Safe transfer
No double spend
Full audit trail
Crash-safe
Race-condition safe
Reality Check (Why Fintech Backend is Hard)

A simple transfer actually involves:

Idempotency
Concurrency control
ACID transactions
Ledger accounting
Race condition protection
Audit logs
Reconciliation

This is why companies like
Stripe, Paystack, and Flutterwave treat payments as serious infrastructure.

✅ If you want, I can also show you the real production-grade architecture for this wallet (controllers, services, transaction manager, ledger engine).

It’s the difference between a portfolio project and a fintech-grade backend.

Commit transaction; to where, explain: Audit logs
Reconciliation

Got it — let’s break this down step by step, keeping it simple and concrete.

1️⃣ Commit Transaction; – To Where?

When you do:

await session.commitTransaction();

You’re telling the database:

“Everything in this transaction is valid — make it permanent.”

Context

A transaction groups multiple operations:

Debit sender

Credit receiver

Write ledger entries

If anything fails:

await session.abortTransaction();

→ Rollback everything so no partial changes remain.

So the commit goes to the database (MongoDB or SQL), and ensures atomicity: either all happen, or none happen.

Think of it like clicking “Confirm” on a bank transfer — the DB won’t finalize the money movement until commit.

2️⃣ Audit Logs
What It Is

Audit logs are extra records of everything that happened, for review later.

Who did what

When

How much

From which wallet

To which wallet

Status (success/fail)

Example Schema
const AuditLogSchema = new mongoose.Schema({
  action: String, // e.g., 'transfer'
  userId: String,
  walletId: String,
  amount: Number,
  status: "success" | "fail",
  reference: String,
  timestamp: Date
});
Example Log Entry
await AuditLog.create({
  action: "transfer",
  userId: sender._id,
  walletId: sender._id,
  amount: 2000,
  status: "success",
  reference: txId,
  timestamp: new Date()
});

Why it matters:

Investigate fraud

Track mistakes

Satisfy compliance regulations (banks must keep logs for years)

3️⃣ Reconciliation
What It Is

Reconciliation = matching ledger & balances to ensure no money is missing or duplicated.

Ledger says: Wallet A debited ₦2,000

Wallet balance says: ₦8,000

Do these numbers match? ✅

How It Works in Practice

A nightly script might:

// sum all ledger debits/credits per wallet
const ledgerSum = await Ledger.aggregate([
  { $match: { walletId: wallet._id } },
  { $group: { _id: "$walletId", balance: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", { $multiply: ["$amount", -1] }] } } } }
]);

if (ledgerSum.balance !== wallet.balance) {
  console.error("Reconciliation mismatch for wallet", wallet._id);
}

Goal: Ensure ledger = real balances.
If it doesn’t, something went wrong — maybe a failed transaction, or a ghost debit.

TL;DR Analogy
Concept	Bank Analogy
Transaction Commit	Press “Confirm” — money actually moves
Audit Log	Bank statement copy you keep for review
Reconciliation	Accountant checking that statement matches account balances

If you want, I can make a tiny end-to-end Node.js transfer snippet showing:

Idempotency key

Transaction commit

Ledger entry

Audit log creation

Reconciliation check

…all in one flow, so you can see it in code.

Do you want me to do that?

walk me through a prd for creating this project(express, node), walk me through the routes needed, there should be a search user(wallet) route and a display wallet route

Absolutely — let’s walk through a PRD (Product Requirements Document) for a small fintech-style digital wallet project built with Node.js + Express + MongoDB. I’ll keep it practical so you can go straight into coding.

PRD: Digital Wallet API
Project Overview

Create a backend system to:

Manage users

Manage wallets (balances)

Handle transfers safely

Provide ledger/audit logs for traceability

Support searching users and viewing wallet info

Tech stack:

Node.js + Express (TypeScript recommended)

MongoDB

Docker (optional)

Mongoose for models

Core Models
1. User
{
  _id: ObjectId,
  name: string,
  email: string,
  phone: string,
  createdAt: Date,
}
2. Wallet
{
  _id: ObjectId,
  userId: ObjectId,
  balance: number,
  currency: string,
  createdAt: Date,
}
3. Ledger / Transaction
{
  _id: ObjectId,
  walletId: ObjectId,
  type: "debit" | "credit",
  amount: number,
  balanceBefore: number,
  balanceAfter: number,
  reference: string, // transaction id
  createdAt: Date
}
4. Idempotency Key
{
  key: string,
  response: Object,
  createdAt: Date
}
5. Audit Log
{
  action: string,
  userId: ObjectId,
  walletId: ObjectId,
  amount: number,
  status: "success" | "fail",
  reference: string,
  timestamp: Date
}
API Routes

Here’s the route map for your Express app:

Route	Method	Purpose
/users	POST	Create a user
/users/:id	GET	Get user details
/wallets	POST	Create a wallet for a user
/wallets/:id	GET	Display wallet info (balance, user, etc)
/wallets/search	GET	Search wallet by userId, email, phone
/transfer	POST	Transfer money between wallets
/ledger/:walletId	GET	View all transactions of a wallet
/audit/:walletId	GET	View audit logs for wallet
Route Details / Flow
1️⃣ Create User
POST /users
Body: { name, email, phone }
2️⃣ Get User
GET /users/:id
3️⃣ Create Wallet
POST /wallets
Body: { userId, currency, initialBalance }
4️⃣ Display Wallet
GET /wallets/:id
Response: {
  walletId,
  userId,
  userName,
  balance,
  currency
}
5️⃣ Search Wallet
GET /wallets/search?email=abc@domain.com
or /wallets/search?phone=08012345678
or /wallets/search?userId=...

Response Example:

[
  {
    "walletId": "64f8a1...",
    "userName": "John Doe",
    "balance": 5000,
    "currency": "NGN"
  }
]
6️⃣ Transfer Money
POST /transfer
Headers: { "Idempotency-Key": "unique-key-123" }
Body: {
  senderWalletId,
  receiverWalletId,
  amount
}

Flow:

Check idempotency key

Start DB transaction

Lock sender & receiver wallets

Debit sender

Credit receiver

Create ledger entries

Create audit log

Commit transaction

Save idempotency response

7️⃣ Get Wallet Ledger
GET /ledger/:walletId

Returns all debit/credit movements for a wallet.

8️⃣ Get Wallet Audit Logs
GET /audit/:walletId

Returns all audit logs (for compliance and traceability).

Extras / Nice-to-Have

Pagination for ledger & audit log routes

Search filters (date range, type)

Error handling (insufficient funds, invalid wallet)

Reconciliation endpoint: checks wallet balance vs ledger sum

Folder Structure Suggestion
src/
  controllers/
    userController.ts
    walletController.ts
    transferController.ts
    ledgerController.ts
    auditController.ts
  models/
    User.ts
    Wallet.ts
    Ledger.ts
    AuditLog.ts
    IdempotencyKey.ts
  routes/
    userRoutes.ts
    walletRoutes.ts
    transferRoutes.ts
    ledgerRoutes.ts
    auditRoutes.ts
  services/
    transferService.ts
    reconciliationService.ts
  app.ts

If you want, I can draw the actual workflow for /transfer, /wallets/search, and /wallets/:id in a sequence diagram style showing how the request flows through idempotency, ledger, and DB locks.

Do you want me to do that next?