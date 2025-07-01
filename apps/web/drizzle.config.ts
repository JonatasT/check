import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({
  path: '.env.local', // Vamos usar .env.local para consistência com Next.js
});

const dbCredentials = {
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
};

if (!dbCredentials.host || !dbCredentials.port || !dbCredentials.user || !dbCredentials.password || !dbCredentials.database) {
  console.log(dbCredentials);
  throw new Error('Missing database credentials in .env.local. Please ensure POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DATABASE are set.');
}

export default {
  schema: './src/lib/db/schema', // Apontando para um diretório onde os schemas serão agrupados
  out: './src/lib/db/migrations',
  dialect: 'postgresql', // Especificando o dialeto como PostgreSQL
  dbCredentials,
  verbose: true,
  strict: true,
} satisfies Config;
