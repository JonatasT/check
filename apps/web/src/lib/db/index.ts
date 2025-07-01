import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente do .env.local
dotenv.config({ path: '.env.local' });

if (!process.env.POSTGRES_URL && (!process.env.POSTGRES_HOST || !process.env.POSTGRES_USER || !process.env.POSTGRES_PASSWORD || !process.env.POSTGRES_DATABASE || !process.env.POSTGRES_PORT)) {
  throw new Error('Database connection string or individual parameters must be set in .env.local. Please set POSTGRES_URL or all of POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DATABASE, POSTGRES_PORT.');
}

let pool: Pool;

if (process.env.POSTGRES_URL) {
  pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    // ssl: {
    //   rejectUnauthorized: false, // Adicionar isso se estiver usando NeonDB ou similar com SSL
    // },
  });
} else {
  pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
  });
}

// Exporta a instância do Drizzle conectada ao pool do PostgreSQL
export const db = drizzle(pool);

// Idealmente, você também exportaria os schemas aqui quando eles forem criados
// export * as schema from './schema';
// E então, você poderia usar db.query.users.findMany() por exemplo.
// Para usar db.select().from(users) você não precisa disso aqui, apenas importar as tabelas do schema.

console.log("Database client initialized.");

// Opcional: Testar a conexão
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client for connection test', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      return console.error('Error executing query for connection test', err.stack);
    }
    console.log('Database connection test successful:', result.rows);
  });
});
