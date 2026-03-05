/**
 * Vault — encrypted credential storage (Phase 1 stub).
 *
 * All methods are no-ops for now. Phase 2 will implement
 * AES-256-GCM encryption with a passphrase-derived key.
 */

export class Vault {
  async deriveKey(_passphrase: string): Promise<void> {
    // Phase 1 stub
  }

  async decrypt(_ciphertext: string): Promise<string> {
    // Phase 1 stub
    return '';
  }

  async store(_key: string, _value: string): Promise<void> {
    // Phase 1 stub
  }
}
