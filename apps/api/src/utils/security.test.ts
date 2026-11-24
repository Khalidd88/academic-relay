import assert from 'node:assert';
import { encryptIcsUrl, decryptIcsUrl, sanitizeEventText } from './security.js';

// Setup test encryption key (32 bytes / 64 hex chars)
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const sampleUrl = 'https://elearning.esaunggul.ac.id/calendar/export_execute.php?userid=12345&authtoken=abcdef123456&preset_what=all&preset_time=recentupcoming';

// Test 1: Encryption & Decryption roundtrip
const encrypted = encryptIcsUrl(sampleUrl);
assert(typeof encrypted === 'string');
const parts = encrypted.split(':');
assert.strictEqual(parts.length, 3, 'Encrypted format must have 3 parts (iv:tag:cipher)');
assert.strictEqual(parts[0].length, 24, 'IV hex must be 24 characters (12 bytes)');

const decrypted = decryptIcsUrl(encrypted);
assert.strictEqual(decrypted, sampleUrl, 'Decrypted URL must match original plain URL');

// Test 2: Random IV uniqueness
const encrypted2 = encryptIcsUrl(sampleUrl);
assert.notStrictEqual(encrypted, encrypted2, 'Two encryptions of the same URL must yield different ciphertexts');

// Test 3: Sanitize text
const dirtyText = '<p>Tugas Pemrograman <b>Web</b> &amp; Mobile</p><script>alert(1)</script>';
const cleanText = sanitizeEventText(dirtyText);
assert(!cleanText.includes('<p>'), 'HTML tags must be stripped');
assert(!cleanText.includes('<script>'), 'Script tags must be stripped');

console.log('All security module assertion tests passed successfully!');
