// src/config/postgres.ts
import { Sequelize } from 'sequelize';

const {
  PG_HOST     = 'localhost',
  PG_PORT     = '5432',
  PG_DB       = 'fintech_db',
  PG_USER     = 'postgres',
  PG_PASSWORD = '',
  NODE_ENV    = 'development',
} = process.env;

export const sequelize = new Sequelize({
  dialect:  'postgres',
  host:     PG_HOST,
  port:     parseInt(PG_PORT, 10),
  database: PG_DB,
  username: PG_USER,
  password: PG_PASSWORD,

  logging: NODE_ENV === 'development' ? console.log : false,

  pool: {
    max:     10,
    min:     2,
    acquire: 30_000,
    idle:    10_000,
  },

  dialectOptions: {
    timezone: '+00:00',   // Always store TIMESTAMPTZ in UTC
  },
});

export async function connectPostgres(): Promise<void> {
  await sequelize.authenticate();
  console.log('✅ PostgreSQL connected via Sequelize');
}