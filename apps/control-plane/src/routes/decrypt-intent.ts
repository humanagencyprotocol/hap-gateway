/**
 * POST /api/decrypt-intent
 *
 * Decrypts an HPKE-encrypted authority intent on behalf of an approver.
 * The approver's private key comes from the vault (slot 'e2eKey').
 *
 * Body:
 *   {
 *     intentCiphertext: string,           // base64
 *     encryptedKey: { ct: string; enc: string },  // base64 — caller's HPKE wrap
 *     approverId: string,                 // caller's userId (used for decryption)
 *   }
 *
 * Response:
 *   { intent: string }
 *
 * Auth: session must be active (requireAuth middleware applied by caller in index.ts).
 */

import { Router, type Request, type Response } from 'express';
import { decryptIntent } from '../lib/e2e-crypto';
import { loadOrGenerateKeyPair } from '../lib/e2e-key-manager';
import type { Vault } from '../lib/vault';

export function createDecryptIntentRouter(vault: Vault): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const { intentCiphertext, encryptedKey, approverId } = req.body as {
      intentCiphertext?: unknown;
      encryptedKey?: unknown;
      approverId?: unknown;
    };

    if (typeof intentCiphertext !== 'string' || intentCiphertext.length === 0) {
      res.status(400).json({ error: 'Missing or invalid field: intentCiphertext (base64 string)' });
      return;
    }

    if (
      typeof encryptedKey !== 'object' ||
      encryptedKey === null ||
      typeof (encryptedKey as Record<string, unknown>).ct !== 'string' ||
      typeof (encryptedKey as Record<string, unknown>).enc !== 'string'
    ) {
      res.status(400).json({ error: 'Missing or invalid field: encryptedKey ({ ct: string; enc: string })' });
      return;
    }

    if (typeof approverId !== 'string' || approverId.length === 0) {
      res.status(400).json({ error: 'Missing or invalid field: approverId (string)' });
      return;
    }

    try {
      // Load the caller's private key from the vault.
      const kp = await loadOrGenerateKeyPair(vault);

      const { ct, enc } = encryptedKey as { ct: string; enc: string };

      // Reconstruct EncryptedIntent in the shape decryptIntent expects.
      const encrypted = {
        intentCiphertext: new Uint8Array(Buffer.from(intentCiphertext, 'base64')),
        encryptedKeys: {
          [approverId]: {
            ct: new Uint8Array(Buffer.from(ct, 'base64')),
            enc: new Uint8Array(Buffer.from(enc, 'base64')),
          },
        },
      };

      const intent = await decryptIntent(encrypted, approverId, kp.privateKey);

      res.json({ intent });
    } catch (err) {
      console.error('[Control Plane] decrypt-intent error:', err);
      const msg = err instanceof Error ? err.message : 'Decryption failed';
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
