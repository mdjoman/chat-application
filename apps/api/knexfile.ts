import type { Knex } from 'knex';
import { env } from './src/config/env.js';

const base: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    timezone: 'Z',
  },
  pool: {
    min: env.MYSQL_POOL_MIN,
    max: env.MYSQL_POOL_MAX,
  },
  migrations: {
    directory: './src/db/migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './src/db/seeds',
    extension: 'ts',
  },
};

export default base;
