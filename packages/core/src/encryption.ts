import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ALGO = "aes-256-gcm";

function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, "dfi-static-salt-v1", 32);
}

/** Loads DFI_ENCRYPTION_KEY from env, or generates+persists a per-install key at data/.dfi.key (0600). */
export function resolveEncryptionKey(keyFilePath = "./data/.dfi.key"): Buffer {
  const envKey = process.env.DFI_ENCRYPTION_KEY;
  if (envKey && envKey.trim().length > 0) return deriveKey(envKey.trim());

  if (existsSync(keyFilePath)) {
    return Buffer.from(readFileSync(keyFilePath, "utf-8").trim(), "hex");
  }

  const dir = dirname(keyFilePath);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(keyFilePath, key.toString("hex"), { mode: 0o600 });
  return key;
}

export function encryptField(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptField(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
}
