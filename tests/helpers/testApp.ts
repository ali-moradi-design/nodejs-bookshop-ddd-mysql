import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import net from 'node:net';
import request from 'supertest';
import type { Express } from 'express';

export type TestAgent = ReturnType<typeof request>;

export type TestContext = {
  app: Express;
  request: TestAgent;
  /** Stop hook for mysql-memory-server (null when using TEST_DATABASE_URL / local). */
  stopMysql: (() => Promise<void>) | null;
  adminToken: string;
  adminRefresh: string;
};

let shared: TestContext | null = null;
let refs = 0;

function canConnect(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

async function ensureDatabaseUrl(): Promise<{ stopMysql: (() => Promise<void>) | null }> {
  const externalUri = process.env.TEST_DATABASE_URL?.trim();
  if (externalUri) {
    process.env.DATABASE_URL = externalUri;
    return { stopMysql: null };
  }

  // Prefer already-running local MySQL (matches .env.example) when available
  if (await canConnect('127.0.0.1', 3306)) {
    const uri = 'mysql://root:root@127.0.0.1:3306/bookstore_test';
    process.env.DATABASE_URL = uri;
    try {
      execSync('mysql -uroot -proot -h127.0.0.1 -e "CREATE DATABASE IF NOT EXISTS bookstore_test"', {
        stdio: 'ignore',
      });
    } catch {
      /* ignore — db push will surface auth/schema issues */
    }
    return { stopMysql: null };
  }

  // Hermetic fallback: mysql-memory-server (needs xz-utils + libaio)
  try {
    const { createDB } = await import('mysql-memory-server');
    const dataDir = path.resolve(process.cwd(), '.mysqldata/test');
    fs.mkdirSync(dataDir, { recursive: true });

    const db = await createDB({
      dbName: 'bookstore_test',
      logLevel: 'ERROR',
      version: process.env.MYSQLMS_VERSION ?? '8.0.x',
    });

    const uri = `mysql://${db.username}:@127.0.0.1:${db.port}/${db.dbName}`;
    process.env.DATABASE_URL = uri;

    return {
      stopMysql: async () => {
        try {
          await db.stop();
        } catch {
          /* ignore */
        }
      },
    };
  } catch (err) {
    console.warn(
      '[tests] mysql-memory-server failed:',
      err instanceof Error ? err.message : err,
    );
  }

  throw new Error(
    'No MySQL available for integration tests. Set TEST_DATABASE_URL, start local MySQL on 3306, or install deps for mysql-memory-server (xz-utils, libaio).',
  );
}

function migrateSchema(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set for migrate');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}

async function resetDatabase(): Promise<void> {
  const { prisma } = await import('../../src/infrastructure/persistence/prisma/client');
  const tables = await prisma.$queryRawUnsafe<{ TABLE_NAME: string }[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  );
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t.TABLE_NAME}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

export async function setupTestApp(): Promise<TestContext> {
  refs += 1;
  if (shared) return shared;

  const { stopMysql } = await ensureDatabaseUrl();
  migrateSchema();

  const { connectDb } = await import('../../src/infrastructure/config/db');
  await connectDb();
  await resetDatabase();

  const { runSeed } = await import('../../src/scripts/seed');
  await runSeed({ minimalBooks: true });

  const { default: app } = await import('../../src/app');
  const agent = request(app);

  const login = await agent
    .post('/api/v1/auth/login')
    .send({ email: 'admin@bookstore.local', password: 'Admin123!' })
    .expect(200);

  shared = {
    app,
    request: agent,
    stopMysql,
    adminToken: login.body.accessToken as string,
    adminRefresh: login.body.refreshToken as string,
  };
  return shared;
}

export async function teardownTestApp(): Promise<void> {
  refs = Math.max(0, refs - 1);
  if (refs > 0 || !shared) return;

  try {
    await resetDatabase();
  } catch {
    /* ignore */
  }
  try {
    const { disconnectPrisma } = await import('../../src/infrastructure/persistence/prisma/client');
    await disconnectPrisma();
  } catch {
    /* ignore */
  }
  try {
    if (shared.stopMysql) await shared.stopMysql();
  } catch {
    /* ignore */
  }
  shared = null;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export const shippingAddress = {
  fullName: 'Test User',
  line1: '1 Test St',
  city: 'Tehran',
  postalCode: '12345',
  country: 'IR',
};

export async function registerCustomer(
  agent: TestAgent,
  suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): Promise<{ accessToken: string; refreshToken: string; email: string; userId: string }> {
  const email = `customer_${suffix}@test.local`;
  const res = await agent
    .post('/api/v1/auth/register')
    .send({ name: 'Customer', email, password: 'Customer123!' })
    .expect(201);
  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    email,
    userId: res.body.user.id,
  };
}
