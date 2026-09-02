/**
 * Temporary smoke test for token store (sqlite + optional keychain).
 * Run with env already set when ROLE=worker, or as driver with no ROLE.
 *
 * Driver:
 *   npx tsx scripts/token-store-smoke.ts
 *
 * Worker (spawned by driver):
 *   DOCKET_TOKEN_STORE=sqlite DOCKET_DATA_DIR=... DOCKET_DB_PATH=... \
 *     ROLE=sqlite npx tsx scripts/token-store-smoke.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const role = process.env.ROLE ?? 'driver';
const __dirname = dirname(fileURLToPath(import.meta.url));
const coreRoot = join(__dirname, '..');
const scriptPath = fileURLToPath(import.meta.url);

async function runSqliteWorker(): Promise<void> {
  const { getDb, closeDb } = await import('../src/db/index.js');
  const {
    getTokenStore,
    getTokenStoreMode,
    resetTokenStoreForTests,
  } = await import('../src/secrets/token-store.js');
  const { appConfig } = await import('../src/config.js');

  console.log(`[sqlite] tokenStore mode: ${getTokenStoreMode()}`);
  console.log(`[sqlite] dbPath: ${appConfig.dbPath}`);

  if (getTokenStoreMode() !== 'sqlite') {
    throw new Error(`Expected token store sqlite, got ${getTokenStoreMode()}`);
  }

  resetTokenStoreForTests();
  const db = getDb();
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO accounts (
        email, provider, access_token, refresh_token, token_expiry, created_at, updated_at
      ) VALUES (?, 'gmail', NULL, NULL, NULL, ?, ?)`,
    )
    .run(`smoke-sqlite-${now}@example.com`, now, now);
  const accountId = Number(info.lastInsertRowid);

  const store = getTokenStore();
  const tokens = {
    access_token: 'access-smoke-sqlite',
    refresh_token: 'refresh-smoke-sqlite',
    token_expiry: now + 3600_000,
  };

  await store.save(accountId, tokens);

  const row = db
    .prepare(
      `SELECT access_token, refresh_token, token_expiry FROM accounts WHERE id = ?`,
    )
    .get(accountId) as {
    access_token: string | null;
    refresh_token: string | null;
    token_expiry: number | null;
  };

  const loaded = await store.load(accountId, row);

  if (loaded.access_token !== tokens.access_token) {
    throw new Error(
      `access_token mismatch: ${loaded.access_token} !== ${tokens.access_token}`,
    );
  }
  if (loaded.refresh_token !== tokens.refresh_token) {
    throw new Error(
      `refresh_token mismatch: ${loaded.refresh_token} !== ${tokens.refresh_token}`,
    );
  }
  if (loaded.token_expiry !== tokens.token_expiry) {
    throw new Error(
      `token_expiry mismatch: ${loaded.token_expiry} !== ${tokens.token_expiry}`,
    );
  }

  // Partial save should preserve refresh_token
  await store.save(accountId, {
    access_token: 'access-smoke-sqlite-2',
    token_expiry: now + 7200_000,
  });
  const row2 = db
    .prepare(
      `SELECT access_token, refresh_token, token_expiry FROM accounts WHERE id = ?`,
    )
    .get(accountId) as {
    access_token: string | null;
    refresh_token: string | null;
    token_expiry: number | null;
  };
  const loaded2 = await store.load(accountId, row2);
  if (loaded2.access_token !== 'access-smoke-sqlite-2') {
    throw new Error('partial save access_token failed');
  }
  if (loaded2.refresh_token !== tokens.refresh_token) {
    throw new Error('partial save should keep existing refresh_token');
  }

  closeDb();
  console.log('[sqlite] PASS');
}

async function runKeychainWorker(): Promise<void> {
  // Verify keytar loads before touching DB/account
  try {
    const mod = await import('keytar');
    const keytar = (mod as { default?: unknown }).default ?? mod;
    if (
      !keytar ||
      typeof (keytar as { getPassword?: unknown }).getPassword !== 'function'
    ) {
      throw new Error('keytar API missing');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`[keychain] SKIP keytar unavailable: ${msg}`);
    process.exit(2); // special: skip
  }

  const { getDb, closeDb } = await import('../src/db/index.js');
  const {
    getTokenStore,
    getTokenStoreMode,
    resetTokenStoreForTests,
  } = await import('../src/secrets/token-store.js');
  const { appConfig } = await import('../src/config.js');

  console.log(`[keychain] tokenStore mode: ${getTokenStoreMode()}`);
  console.log(`[keychain] dbPath: ${appConfig.dbPath}`);

  if (getTokenStoreMode() !== 'keychain') {
    throw new Error(
      `Expected token store keychain, got ${getTokenStoreMode()}`,
    );
  }

  resetTokenStoreForTests();
  const db = getDb();
  const now = Date.now();
  const email = `smoke-keychain-${now}@example.com`;
  const info = db
    .prepare(
      `INSERT INTO accounts (
        email, provider, access_token, refresh_token, token_expiry, created_at, updated_at
      ) VALUES (?, 'gmail', NULL, NULL, NULL, ?, ?)`,
    )
    .run(email, now, now);
  const accountId = Number(info.lastInsertRowid);

  const store = getTokenStore();
  const tokens = {
    access_token: 'access-smoke-keychain',
    refresh_token: 'refresh-smoke-keychain',
    token_expiry: now + 3600_000,
  };

  await store.save(accountId, tokens);

  // SQLite columns should be cleared in keychain mode
  const row = db
    .prepare(
      `SELECT access_token, refresh_token, token_expiry FROM accounts WHERE id = ?`,
    )
    .get(accountId) as {
    access_token: string | null;
    refresh_token: string | null;
    token_expiry: number | null;
  };
  if (row.access_token != null || row.refresh_token != null) {
    throw new Error(
      `keychain mode should clear SQLite secrets, got access=${row.access_token} refresh=${row.refresh_token}`,
    );
  }

  const loaded = await store.load(accountId, row);
  if (loaded.access_token !== tokens.access_token) {
    throw new Error(
      `access_token mismatch: ${loaded.access_token} !== ${tokens.access_token}`,
    );
  }
  if (loaded.refresh_token !== tokens.refresh_token) {
    throw new Error(
      `refresh_token mismatch: ${loaded.refresh_token} !== ${tokens.refresh_token}`,
    );
  }
  if (loaded.token_expiry !== tokens.token_expiry) {
    throw new Error(
      `token_expiry mismatch: ${loaded.token_expiry} !== ${tokens.token_expiry}`,
    );
  }

  await store.delete(accountId);
  const afterDelete = await store.load(accountId, {
    access_token: null,
    refresh_token: null,
    token_expiry: null,
  });
  if (afterDelete.access_token || afterDelete.refresh_token) {
    throw new Error('keychain delete left tokens behind');
  }

  closeDb();
  console.log('[keychain] PASS');
}

function runWorker(
  workerRole: 'sqlite' | 'keychain',
  dataDir: string,
  extraEnv: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const env = {
    ...process.env,
    ...extraEnv,
    ROLE: workerRole,
    DOCKET_TOKEN_STORE: workerRole,
    DOCKET_DATA_DIR: dataDir,
    DOCKET_DB_PATH: join(dataDir, 'mail.sqlite'),
    // Avoid loading real OAuth secrets into this smoke
  };
  const tsxCli = join(coreRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const result = spawnSync(process.execPath, [tsxCli, scriptPath], {
    cwd: coreRoot,
    env,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function runDriver(): Promise<void> {
  const stamp = Date.now();
  const sqliteDir = mkdtempSync(join(tmpdir(), 'lm-test-sqlite-'));
  const keychainDir = mkdtempSync(join(tmpdir(), 'lm-test-keychain-'));
  // Also honor requested naming under /tmp
  const altSqlite = mkdtempSync(join('/tmp', `lm-test-${stamp}-`));

  let sqlitePass = false;
  let keychainResult: 'pass' | 'skip' | 'fail' = 'fail';

  try {
    console.log('=== SQLite token store smoke ===');
    console.log(`data dir: ${altSqlite}`);
    const sq = runWorker('sqlite', altSqlite);
    process.stdout.write(sq.stdout);
    process.stderr.write(sq.stderr);
    if (sq.status === 0) {
      sqlitePass = true;
      console.log('RESULT sqlite: PASS');
    } else {
      console.log(`RESULT sqlite: FAIL (exit ${sq.status})`);
    }

    console.log('\n=== Keychain token store smoke ===');
    // Probe keytar in driver first for clearer messaging
    let keytarOk = false;
    try {
      await import('keytar');
      keytarOk = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`[keychain] keytar not importable in driver: ${msg}`);
      keychainResult = 'skip';
    }

    if (keytarOk) {
      console.log(`data dir: ${keychainDir}`);
      const kc = runWorker('keychain', keychainDir);
      process.stdout.write(kc.stdout);
      process.stderr.write(kc.stderr);
      if (kc.status === 0) {
        keychainResult = 'pass';
        console.log('RESULT keychain: PASS');
      } else if (kc.status === 2) {
        keychainResult = 'skip';
        console.log('RESULT keychain: SKIP');
      } else {
        keychainResult = 'fail';
        console.log(`RESULT keychain: FAIL (exit ${kc.status})`);
      }
    } else {
      console.log('RESULT keychain: SKIP');
    }

    console.log('\n=== Summary ===');
    console.log(`sqlite store: ${sqlitePass ? 'PASS' : 'FAIL'}`);
    console.log(`keychain store: ${keychainResult.toUpperCase()}`);

    if (!sqlitePass || keychainResult === 'fail') {
      process.exitCode = 1;
    }
  } finally {
    for (const d of [sqliteDir, keychainDir, altSqlite]) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

async function main(): Promise<void> {
  if (role === 'sqlite') {
    await runSqliteWorker();
    return;
  }
  if (role === 'keychain') {
    await runKeychainWorker();
    return;
  }
  await runDriver();
}

main().catch((e) => {
  console.error('[smoke] fatal', e);
  process.exit(1);
});
