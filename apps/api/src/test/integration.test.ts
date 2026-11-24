import assert from 'node:assert';
import dayjs from 'dayjs';
import { parseCalendarTasks, APP_TIMEZONE } from '../services/calendar.js';
import {
  encryptIcsData,
  decryptIcsData,
  validateIcsContent,
  generateVerificationCode,
  createDashboardToken,
  verifyDashboardToken,
} from '../utils/security.js';

process.env.ENCRYPTION_KEY = 'f6f89efec7635425b0a0f761a5323f3f62f117d77f5f6f968c7bd466e6d42a96';

console.log('--- Testing Verification Code & Dashboard Token ---');
const code = generateVerificationCode();
assert(/^VERIF-[A-Z0-9]{4}$/.test(code), `Code must match VERIF-XXXX: got ${code}`);

const token = createDashboardToken('20210801001');
const verified = verifyDashboardToken(token);
assert.strictEqual(verified.valid, true);
assert.strictEqual(verified.nim, '20210801001');

// Tampered token test
const tamperedToken = token.slice(0, -4) + 'AAAA';
const tamperedVerified = verifyDashboardToken(tamperedToken);
assert.strictEqual(tamperedVerified.valid, false, 'Tampered token must be rejected');

console.log('--- All Unit & Integration Tests Passed Successfully! ---');
