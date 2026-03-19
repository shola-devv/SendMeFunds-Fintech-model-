-- ============================================================
-- Migration: 001_initial_schema.sql
-- Creates all tables for the fintech PostgreSQL database
-- Run with: psql -U postgres -d fintech_db -f 001_initial_schema.sql
-- ============================================================

-- Enable UUID extension (optional but handy)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: users
-- Mirrors your MongoDB User model for PostgreSQL-side joins
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  mongo_id      VARCHAR(24) UNIQUE NOT NULL,   -- MongoDB ObjectId as string
  email         VARCHAR(255) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: wallets
-- DECIMAL(15,2) enforces exact money arithmetic — never FLOAT
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
  id            SERIAL PRIMARY KEY,
  mongo_id      VARCHAR(24) UNIQUE NOT NULL,   -- MongoDB ObjectId as string
  user_id       VARCHAR(24) NOT NULL,           -- references users.mongo_id
  balance       DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  currency      VARCHAR(10) NOT NULL DEFAULT 'NGN',
  pin_hash      VARCHAR(255),                   -- bcrypt hash of transaction PIN
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_wallets_mongo_id ON wallets(mongo_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id  ON wallets(user_id);

-- ============================================================
-- TABLE: ledgers
-- Double-entry: every transfer produces DEBIT + CREDIT rows
-- ============================================================
CREATE TABLE IF NOT EXISTS ledgers (
  id            SERIAL PRIMARY KEY,
  wallet_id     VARCHAR(24) NOT NULL,           -- references wallets.mongo_id
  type          VARCHAR(10) NOT NULL,            -- 'debit' | 'credit'
  amount        DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,          -- snapshot for audit trail
  reference     VARCHAR(255) UNIQUE NOT NULL,    -- e.g. tx_..._debit / tx_..._credit
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ledgers_amount_positive CHECK (amount > 0),
  CONSTRAINT ledgers_type_check CHECK (type IN ('debit', 'credit'))
);

CREATE INDEX IF NOT EXISTS idx_ledgers_wallet_id  ON ledgers(wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledgers_reference  ON ledgers(reference);
CREATE INDEX IF NOT EXISTS idx_ledgers_created_at ON ledgers(created_at);

-- ============================================================
-- TABLE: audit_logs
-- Immutable record of every significant action
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            SERIAL PRIMARY KEY,
  user_id       VARCHAR(24),                    -- actor (may be null for system events)
  action        VARCHAR(100) NOT NULL,           -- e.g. 'TRANSFER', 'LOGIN', 'PIN_CHANGE'
  entity        VARCHAR(100),                   -- e.g. 'wallet', 'user'
  entity_id     VARCHAR(255),                   -- the affected record's ID
  metadata      JSONB,                          -- arbitrary context (amounts, IPs, etc.)
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================
-- TABLE: idempotency_keys
-- Prevents duplicate transfers when clients retry requests
-- ============================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id            SERIAL PRIMARY KEY,
  key           VARCHAR(255) UNIQUE NOT NULL,
  user_id       VARCHAR(24) NOT NULL,
  request_hash  VARCHAR(255) NOT NULL,          -- hash of request body for validation
  response      JSONB NOT NULL,                 -- stored response to replay on duplicate
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key        ON idempotency_keys(key);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);