
# SendMeFunds — Backend API

> A production-grade REST API for a fintech wallet system — featuring ACID-compliant transactions, 
> double-entry bookkeeping, idempotency, role-based access control, and wallet audit infrastructure.
> Built with Node.js, TypeScript, and Express. Deployed on AWS EC2.

---

## Overview

SendMeFunds is a backend system that models core fintech wallet infrastructure. It handles user 
authentication, wallet lifecycle management, peer-to-peer transfers, ledger tracking, and 
administrative oversight — the kind of plumbing that sits under consumer-facing products like 
Paystack or Flutterwave.

The project has two implementations across two branches:

| Branch | Database | Approach |
|--------|----------|----------|
| `main` | MongoDB (Atlas) | ACID transactions simulated via MongoDB multi-document sessions on a replica set |
| `postgresql` | PostgreSQL | Native ACID transactions with raw SQL, `SELECT FOR UPDATE` row locking, and `DECIMAL(15,2)` money handling |

The PostgreSQL branch is the more production-appropriate implementation. The MongoDB branch exists 
as a deliberate exercise in understanding how ACID-like behaviour can be approached in a 
non-relational database — and where its limits are.

---

## Features

### Auth & Identity
- JWT-based authentication with separate access and refresh tokens
- Tokens delivered via **signed HTTP-only cookies** — no localStorage, no exposed tokens
- Automatic token refresh — if the access token expires, the refresh token silently issues a new one
- Passwords hashed with bcryptjs
- Super-admin accounts seeded automatically on server startup from environment variables

### Wallet System
- Wallet creation with automatic **1,000 NGN** initial credit (for immediate testing)
- PIN-protected wallet operations — PIN stored as a bcrypt hash, never in plaintext
- Wallet search by wallet ID, email address, or phone number
- Super-admin wallet funding with PIN verification

### Transfers
- Peer-to-peer transfers between any two wallets
- **Idempotency key support** — every transfer requires a unique `Idempotency-Key` header. Duplicate 
  requests return the original cached response without re-executing the transfer. Safe to retry.
- **Double-entry ledger** — every transfer produces two ledger entries: a debit on the sender 
  (`reference_debit`) and a credit on the receiver (`reference_credit`). Both sides are always recorded.
- Self-transfer prevention
- Insufficient funds rejection inside the locked transaction (not before it)

### ACID Transactions

**MongoDB branch:**
- Multi-document transactions via Mongoose sessions
- All reads and writes scoped to the session — invisible to other operations until committed
- Automatic rollback on any failure
- Requires a replica set — works out of the box on MongoDB Atlas

**PostgreSQL branch:**
- Native database transactions via Sequelize's transaction manager
- `SELECT ... FOR UPDATE` row locking on both wallets before any balance update — prevents 
  race conditions where two transfers hit the same wallet simultaneously
- Raw SQL queries via `sequelize.query()` — no ORM abstraction hiding what's happening
- `DECIMAL(15,2)` for all monetary values — no floating point arithmetic near money
- `JSONB` column for idempotency response storage
- Full rollback on failure — no partial writes, no orphaned ledger entries

### Audit & Reconciliation
- Audit logs for all wallet operations — creation, funding, transfers
- Ledger-based balance reconciliation — reconstruct any wallet's correct balance by replaying 
  its ledger history
- Single wallet reconciliation and batch reconciliation (all wallets in one transaction)
- Reconciliation restricted to admin and super-admin roles

### Role-Based Access Control
Three roles with distinct permissions:

| Permission | User | Admin | Super-Admin |
|------------|------|-------|-------------|
| Create wallet | ✅ | ✅ | ✅ |
| Transfer funds | ✅ | ✅ | ✅ |
| View own ledger | ✅ | ✅ | ✅ |
| Search any wallet | ❌ | ✅ | ✅ |
| View any audit log | ❌ | ✅ | ✅ |
| Fund wallets | ❌ | ❌ | ✅ |
| Reconcile balances | ❌ | ✅ | ✅ |
| Batch reconcile all | ❌ | ❌ | ✅ |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20 |
| Language | TypeScript |
| Framework | Express |
| Primary DB | MongoDB Atlas (Mongoose) |
| Financial DB | PostgreSQL (Sequelize + raw SQL) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Cookies | cookie-parser (signed cookies) |
| Process Manager | PM2 (production) |
| Deployment | AWS EC2 (Ubuntu) |

---

## Project Structure
```
├── app.ts                  # Entry point — server setup, middleware, route mounting
├── controllers/
│   ├── auth.ts             # Register, login, logout, update, delete, super-admin seeder
│   └── wallet.ts           # Wallet CRUD, fund, transfer, ledger, audit, reconciliation
├── middleware/
│   └── authentication.ts   # JWT verification, token refresh, role authorization
├── models/
│   ├── User.ts             # User schema + JWT and password methods
│   ├── wallet.ts           # Wallet schema + PIN hashing and comparison
│   ├── ledger.ts           # Ledger entry schema
│   ├── auditLog.ts         # Audit log schema
│   ├── Token.ts            # Refresh token schema
│   └── idempotencyKey.ts   # Idempotency key schema
├── routes/
│   ├── user.ts             # Auth routes
│   ├── wallet.ts           # Wallet routes
│   └── reconciliation.ts   # Reconciliation routes
├── utils/
│   └── index.ts            # JWT helpers, cookie attachment utilities
├── errors/
│   └── index.ts            # Custom error classes
└── types.d.ts              # Express Request augmentation (req.user)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB replica set for the `main` branch)
- PostgreSQL 14+ (for the `postgresql` branch)

### Installation
```bash
git clone https://github.com/yourusername/sendmefunds-backend.git
cd sendmefunds-backend
npm install
```

### Environment Variables

Create a `.env` file in the root directory:
```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/fintech_db?appName=Cluster0

# PostgreSQL (postgresql branch only)
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_password
PG_DATABASE=fintech_db

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=your_refresh_token_secret_here
REFRESH_TOKEN_EXPIRES_IN=7d

# Cookies
COOKIE_SECRET=your_cookie_secret_here

# Super Admin Seeding
SUPERADMIN_EMAIL1=superadmin1@example.com
SUPERADMIN_PASSWORD1=StrongPassword1!
SUPERADMIN_PHONE1=08000000001

SUPERADMIN_EMAIL2=superadmin2@example.com
SUPERADMIN_PASSWORD2=StrongPassword2!
SUPERADMIN_PHONE2=08000000002
```

### Run
```bash
# development (with hot reload)
npm run dev

# production
npm start
```

---

## API Reference

### Authentication
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/auth/register` | Public | Register a new user |
| POST | `/api/v1/auth/login` | Public | Login and receive auth cookies |
| POST | `/api/v1/auth/logout` | Authenticated | Invalidate tokens and clear cookies |
| PATCH | `/api/v1/auth/update` | Authenticated | Update name, email, or phone |
| DELETE | `/api/v1/auth/delete` | Authenticated | Delete account and associated tokens |

### Wallets
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/api/v1/wallets` | Authenticated | Create wallet (1,000 NGN auto-credited) |
| GET | `/api/v1/wallets` | Authenticated | Get your own wallet details |
| GET | `/api/v1/wallets/search` | Authenticated | Search wallet by ID, email, or phone |
| GET | `/api/v1/wallets/random` | Authenticated | Get a random set of wallets |
| POST | `/api/v1/wallets/fund` | Super-admin | Fund any wallet (PIN required) |
| POST | `/api/v1/wallets/transfer` | Authenticated | Transfer funds between wallets |
| GET | `/api/v1/wallets/ledger/:walletId` | Authenticated | View paginated ledger entries |
| GET | `/api/v1/wallets/audit/:walletId` | Authenticated | View audit logs for a wallet |

### Reconciliation
| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| GET | `/api/v1/reconciliation/:walletId/reconstruct` | Admin+ | Reconstruct single wallet balance from ledger |
| POST | `/api/v1/reconciliation/reconstruct-all` | Super-admin | Batch reconstruct all wallet balances |

---

## Request Examples

### Register
```bash
POST /api/v1/auth/register
Content-Type: application/json

{
  "name": "Shola Emmanuel",
  "email": "shola@example.com",
  "phone": "080........ ",
  "password": "SecurePassword1!"
}
```

### Transfer
```bash
POST /api/v1/wallets/transfer
Content-Type: application/json
Idempotency-Key: a3f9c1d2-unique-per-request

{
  "senderWalletId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "receiverWalletId": "64f1a2b3c4d5e6f7a8b9c0d2",
  "amount": 500,
  "pin": "1234"
}
```

### Fund Wallet (Super-admin)
```bash
POST /api/v1/wallets/fund?walletId=64f1a2b3c4d5e6f7a8b9c0d1
Content-Type: application/json

{
  "amount": 10000,
  "pin": "1234"
}
```

---

## Key Design Decisions

**Why both MongoDB and PostgreSQL?**
MongoDB was used first to understand how multi-document transactions behave in a non-relational 
context. PostgreSQL was introduced for the financial layer because native ACID transactions, row-level 
locking, and exact decimal arithmetic are non-negotiable for money movement.

**Why signed cookies instead of localStorage?**
HttpOnly signed cookies are not accessible to JavaScript — they cannot be stolen via XSS attacks. 
For an auth system, this is the correct default.

**Why idempotency keys?**
Network failures happen. Without idempotency, a client retry after a timeout could execute the same 
transfer twice. The `Idempotency-Key` header ensures that no matter how many times a request is 
retried, the transfer executes exactly once.

**Why double-entry ledger?**
Single-entry bookkeeping (just recording "transfer happened") makes it hard to audit, reconcile, or 
debug balance discrepancies. Double-entry records both sides of every transaction — it's the standard 
in financial systems for good reason.

---

## Deployment

Deployed on **AWS EC2** (Ubuntu 22.04), managed with PM2.
```bash
# SSH into instance
ssh -i your-key.pem ubuntu@your-ec2-public-ip

# install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# clone and install
git clone https://github.com/yourusername/sendmefunds-backend.git
cd sendmefunds-backend
npm install

# set up environment
nano .env

# run with PM2
npm install -g pm2
pm2 start npm --name "sendmefunds" -- start
pm2 save
pm2 startup
```

---

## Related

- **Frontend repo:** [sendmefunds-frontend]( https://github.com/shola-devv/sendMeFunds-Frontend.git)
- **Live demo:** [sholaemmanuel.dev](https://sholaemmanuel.dev)
- **Medium article:** [Medium article](https://medium.com/@olusholaemmanuelfayinminu/sendmefunds-how-i-built-a-wallet-system-for-a-fintech-app-and-deployed-it-to-aws-and-why-i-14c501e6fb61)

---

## Author

**Shola Emmanuel**
[sholaemmanuel.dev](https://sholaemmanuel.dev)
