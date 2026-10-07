import knexFactory, { type Knex } from 'knex';
import { env } from '../config/env.js';

export function createKnex(): Knex {
  return knexFactory({
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
      afterCreate: (conn: any, done: (err: Error | null, c: any) => void) => {
        conn.query('SET time_zone = "+00:00";', (err: Error | null) => done(err, conn));
      },
    },
    
    acquireConnectionTimeout: 10_000,
  });

}
