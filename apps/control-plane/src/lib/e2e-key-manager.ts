/**
 * E2E Key Manager — vault-backed HPKE key lifecycle.
 *
 * Vault slot: 'e2eKey'
 * Stored value (JSON): { privateKey: base64, publicKey: base64 }
 *
 * The key pair is generated once per vault (on first call to
 * loadOrGenerateKeyPair) and never leaves the control-plane process in
 * cleartext. The vault encrypts the slot with AES-256-GCM + PBKDF2.
 */

import type { Vault } from './vault';
import { generateKeyPair, type KeyPair } from './e2e-crypto';

const VAULT_SLOT = 'e2eKey';

interface StoredKeyPair {
  privateKey: string; // base64
  publicKey: string;  // base64
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

/**
 * Load the existing key pair from the vault, or generate + store a new one.
 * Idempotent — concurrent calls on the same vault instance are safe
 * because Vault.getCredential / Vault.setCredential are synchronous.
 */
export async function loadOrGenerateKeyPair(vault: Vault): Promise<KeyPair> {
  const stored = vault.getCredential(VAULT_SLOT) as StoredKeyPair | null;
  if (stored?.privateKey && stored?.publicKey) {
    return {
      privateKey: fromBase64(stored.privateKey),
      publicKey: fromBase64(stored.publicKey),
    };
  }

  // Generate a fresh key pair and persist it.
  const kp = await generateKeyPair();
  const toStore: StoredKeyPair = {
    privateKey: toBase64(kp.privateKey),
    publicKey: toBase64(kp.publicKey),
  };
  vault.setCredential(VAULT_SLOT, toStore as unknown as Record<string, string>);
  return kp;
}

/**
 * Return the existing public key bytes, or null if no key pair is stored yet.
 * Does not generate a new key pair.
 */
export async function getPublicKey(vault: Vault): Promise<Uint8Array | null> {
  const stored = vault.getCredential(VAULT_SLOT) as StoredKeyPair | null;
  if (!stored?.publicKey) return null;
  return fromBase64(stored.publicKey);
}

/**
 * Generate a new key pair, overwrite the vault slot, and return the new pair.
 * Use when the user rotates their API key / wipes the vault.
 */
export async function rotateKeyPair(vault: Vault): Promise<KeyPair> {
  const kp = await generateKeyPair();
  const toStore: StoredKeyPair = {
    privateKey: toBase64(kp.privateKey),
    publicKey: toBase64(kp.publicKey),
  };
  vault.setCredential(VAULT_SLOT, toStore as unknown as Record<string, string>);
  return kp;
}
