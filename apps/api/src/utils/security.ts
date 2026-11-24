import crypto from 'node:crypto';

export const MAX_ICS_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Derives a 32-byte Buffer key for AES-256-GCM & HMAC operations.
 */
function resolveEncryptionKey(secretKey?: string): Buffer {
  const keySource = secretKey || process.env.ENCRYPTION_KEY;
  if (!keySource) {
    throw new Error('ENCRYPTION_KEY environment variable is not defined');
  }

  // If 64 hex characters, parse directly
  if (keySource.length === 64 && /^[0-9a-fA-F]+$/.test(keySource)) {
    return Buffer.from(keySource, 'hex');
  }

  // If already 32 raw bytes
  if (Buffer.byteLength(keySource, 'utf-8') === 32) {
    return Buffer.from(keySource, 'utf-8');
  }

  // Deterministically hash to 32 bytes
  return crypto.createHash('sha256').update(keySource).digest();
}

/**
 * Generates a verification code in the format "VERIF-XXXX"
 * (e.g., "VERIF-8K3P")
 */
export function generateVerificationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous characters (I, O, 0, 1)
  const bytes = crypto.randomBytes(4);
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `VERIF-${code}`;
}

/**
 * Creates an HMAC-SHA256 signed magic link token for student dashboard access.
 */
export function createDashboardToken(nim: string, secretKey?: string): string {
  const key = resolveEncryptionKey(secretKey);
  const ts = Date.now().toString();
  const data = `${nim}:${ts}`;
  const hmac = crypto.createHmac('sha256', key).update(data).digest('hex');
  const payload = JSON.stringify({ nim, ts, hmac });
  return Buffer.from(payload).toString('base64url');
}

/**
 * Verifies an HMAC-SHA256 signed dashboard token.
 */
export function verifyDashboardToken(
  token: string,
  secretKey?: string
): { valid: boolean; nim?: string } {
  try {
    const rawJson = Buffer.from(token, 'base64url').toString('utf-8');
    const parsed = JSON.parse(rawJson);
    if (!parsed || !parsed.nim || !parsed.ts || !parsed.hmac) {
      return { valid: false };
    }

    const key = resolveEncryptionKey(secretKey);
    const expectedHmac = crypto.createHmac('sha256', key).update(`${parsed.nim}:${parsed.ts}`).digest('hex');

    const hmacBuf = Buffer.from(parsed.hmac, 'hex');
    const expectedBuf = Buffer.from(expectedHmac, 'hex');

    if (hmacBuf.length !== expectedBuf.length) {
      return { valid: false };
    }

    if (crypto.timingSafeEqual(hmacBuf, expectedBuf)) {
      return { valid: true, nim: parsed.nim };
    }

    return { valid: false };
  } catch {
    return { valid: false };
  }
}

/**
 * Validates raw .ics content:
 * - Must start with "BEGIN:VCALENDAR"
 * - Must contain "VEVENT"
 * - Maximum size 2MB
 */
export function validateIcsContent(content: string): void {
  if (!content || typeof content !== 'string') {
    throw new Error('Konten file .ics kosong atau tidak valid.');
  }

  const byteLength = Buffer.byteLength(content, 'utf-8');
  if (byteLength > MAX_ICS_SIZE_BYTES) {
    throw new Error(`Ukuran file .ics (${(byteLength / 1024 / 1024).toFixed(2)} MB) melebihi batas maksimal 2MB.`);
  }

  const trimmed = content.trim();
  if (!trimmed.startsWith('BEGIN:VCALENDAR')) {
    throw new Error('Format file tidak valid: Konten wajib diawali dengan "BEGIN:VCALENDAR".');
  }

  if (!trimmed.includes('VEVENT')) {
    throw new Error('Format file tidak valid: Konten kalender wajib mengandung event "VEVENT".');
  }
}

/**
 * Encrypts raw ICS string data with AES-256-GCM using a random 12-byte IV per encryption.
 * Output format: <iv_hex>:<auth_tag_hex>:<encrypted_hex>
 */
export function encryptIcsData(plainData: string, secretKey?: string): string {
  if (!plainData || typeof plainData !== 'string') {
    throw new Error('Invalid plainData provided for encryption');
  }

  const key = resolveEncryptionKey(secretKey);
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainData, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts encrypted ICS string data formatted as <iv_hex>:<auth_tag_hex>:<encrypted_hex>.
 * NEVER logs decrypted data or secrets.
 */
export function decryptIcsData(encryptedData: string, secretKey?: string): string {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Invalid encrypted data format');
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted data: expected format <iv>:<tag>:<ciphertext>');
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const key = resolveEncryptionKey(secretKey);

  if (iv.length !== 12) {
    throw new Error('Invalid IV length for AES-GCM');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Aliases for backwards compatibility
export const encryptIcsUrl = encryptIcsData;
export const decryptIcsUrl = decryptIcsData;

/**
 * Sanitizes calendar event text to prevent XSS and formatting injections.
 * Strips HTML tags and decodes common HTML entities.
 */
export function sanitizeEventText(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/<[^>]*>?/gm, '') // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ') // Collapse multiple spaces
    .trim();
}
