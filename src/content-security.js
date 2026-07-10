import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AtlasError } from './errors.js';

const PREFIX = 'atlas:v1:';

function decodeKey(value) {
  const key = Buffer.isBuffer(value) ? value : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('AI_CONTENT_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return key;
}

export class PlaintextContentCipher {
  encrypt(value) { return value; }
  decrypt(value) { return value; }
}

export class AesGcmContentCipher {
  constructor({ keys, activeKeyId, randomBytesFn = randomBytes }) {
    if (!activeKeyId || !keys?.[activeKeyId]) throw new Error('An active AI content encryption key is required');
    this.keys = new Map(Object.entries(keys).map(([id, key]) => [id, decodeKey(key)]));
    this.activeKeyId = activeKeyId;
    this.randomBytes = randomBytesFn;
  }

  encrypt(value, context = '') {
    if (value === null || value === undefined) return value;
    const iv = this.randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeKeyId), iv);
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${this.activeKeyId}:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
  }

  decrypt(value, context = '') {
    if (value === null || value === undefined || !String(value).startsWith(PREFIX)) return value;
    try {
      const parts = String(value).split(':');
      if (parts.length !== 6 || parts[0] !== 'atlas' || parts[1] !== 'v1') throw new Error('Malformed envelope');
      const [, , keyId, ivValue, tagValue, encryptedValue] = parts;
      const key = this.keys.get(keyId);
      if (!key) throw new AtlasError('AI_CONTENT_KEY_NOT_FOUND', 'The key required to decrypt AI content is unavailable', 500, { keyId });
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
    } catch (error) {
      if (error instanceof AtlasError) throw error;
      throw new AtlasError('AI_CONTENT_DECRYPTION_FAILED', 'Stored AI content could not be authenticated or decrypted', 500);
    }
  }
}

export function createContentCipher(config, dependencies = {}) {
  if (dependencies.contentCipher) return dependencies.contentCipher;
  if (!config.aiContentEncryptionKey) return new PlaintextContentCipher();
  return new AesGcmContentCipher({
    keys: { [config.aiContentEncryptionKeyId]: config.aiContentEncryptionKey },
    activeKeyId: config.aiContentEncryptionKeyId
  });
}
