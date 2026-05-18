import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { getAccountDb } from '#account-db';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const FORMAT_PREFIX = 'v1';

function getMasterKey() {
  const raw = process.env.ACTUAL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ACTUAL_ENCRYPTION_KEY env var is required for encrypted secrets storage. Generate one with: openssl rand -base64 32',
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_LEN) {
    throw new Error(
      `ACTUAL_ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (got ${buf.length}). Regenerate with: openssl rand -base64 32`,
    );
  }
  return buf;
}

export function encryptValue(plaintext) {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${FORMAT_PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptValue(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(`${FORMAT_PREFIX}:`)) {
    throw new Error('Encrypted value has unexpected format');
  }
  const [, ivB64, tagB64, ctB64] = stored.split(':');
  const key = getMasterKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

let _db = null;
function db() {
  if (!_db) _db = getAccountDb();
  return _db;
}

export const encryptedSecretsService = {
  get(name) {
    const row = db().first(`SELECT value FROM secrets WHERE name = ?`, [name]);
    if (!row?.value) return null;
    return decryptValue(row.value);
  },
  set(name, value) {
    const encrypted = encryptValue(value);
    return db().mutate(
      `INSERT OR REPLACE INTO secrets (name, value) VALUES (?, ?)`,
      [name, encrypted],
    );
  },
  exists(name) {
    const row = db().first(`SELECT name FROM secrets WHERE name = ?`, [name]);
    return Boolean(row);
  },
  delete(name) {
    return db().mutate(`DELETE FROM secrets WHERE name = ?`, [name]);
  },
};
