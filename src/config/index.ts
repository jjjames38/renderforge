import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { config as loadDotenv } from 'dotenv';

loadDotenv();

function loadConfigFile(): Record<string, any> {
  const paths = ['config.yaml', 'config.yml'];
  for (const p of paths) {
    if (existsSync(p)) {
      return parseYaml(readFileSync(p, 'utf-8')) ?? {};
    }
  }
  return {};
}

const file = loadConfigFile();

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  chromium: {
    wsEndpoint: process.env.CHROMIUM_WS ?? 'ws://localhost:3001',
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
    path: process.env.STORAGE_PATH ?? './data/assets',
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET ?? 'renderforge',
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
    },
  },
  db: {
    driver: (process.env.DB_DRIVER ?? 'sqlite') as 'sqlite' | 'pg',
    sqlitePath: process.env.SQLITE_PATH ?? './data/renderforge.db',
    pgUrl: process.env.DATABASE_URL,
  },
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    apiKeys: (process.env.API_KEYS ?? '').split(',').filter(Boolean),
    jwtSecret: process.env.JWT_SECRET ?? '',
  },
  create: file.create ?? {},
} as const;
