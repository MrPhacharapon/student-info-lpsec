/**
 * Web Application for Student Information System (ปกศ 2569)
 * Built with Google Apps Script & Google Sheets
 */

/**
 * App configuration using PropertiesService
 * Strict Staging Isolation Guard:
 * - Must explicitly configure APP_SPREADSHEET_ID in Script Properties.
 * - NEVER falls back to the hardcoded Production Spreadsheet ID.
 * - Halts execution if spreadsheetId or sheetName is missing.
 */
function getAppConfig() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props ? props.getProperty('APP_SPREADSHEET_ID') : null;
  if (!spreadsheetId || spreadsheetId.trim() === '') {
    throw new Error("ไม่ได้กำหนดค่า APP_SPREADSHEET_ID ใน Script Properties ระงับการทำงานเพื่อความปลอดภัย (ห้าม fallback ไปยัง Production ID โดยอัตโนมัติ)");
  }
  const sheetName = props ? props.getProperty('APP_SHEET_NAME') : null;
  if (!sheetName || sheetName.trim() === '') {
    throw new Error("ไม่ได้กำหนดค่า APP_SHEET_NAME ใน Script Properties ระงับการทำงานเพื่อความปลอดภัย");
  }
  const reportDate = (props && props.getProperty('APP_REPORT_DATE')) || '';
  const columnOrder = (props && props.getProperty('APP_COLUMN_ORDER')) || 'name,classroom,teacher,serviceType,disabilityType,documents,birthday';

  return {
    spreadsheetId: spreadsheetId.trim(),
    sheetName: sheetName.trim(),
    reportDate: reportDate.trim(),
    columnOrder: columnOrder.trim()
  };
}

/**
 * Handle HTTP GET Requests (Read Data)
 */
function doGet(e) {
  try {
    // Enable CORS by default for JSON output
    let result = {};
    const action = e && e.parameter ? e.parameter.action : null;
    
    if (action === 'getTabs') {
      result = getSheetTabsFromUrl(e.parameter.url);
    } else {
      // Default action: load all students and config
      result = getStudentDataAndConfig();
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: result
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.message,
      stack: err.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// =========================================================================
// Security & Authentication Helpers (Fail-Closed, Salted PBKDF2, HMAC Session)
// =========================================================================

/**
 * Constant-time string equality check to prevent timing side-channel attacks
 */
function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Cryptographically strong random hex generator (CSPRNG)
 * Strictly avoids insecure non-cryptographic pseudo-random number generators.
 * Supported platforms: Node.js / Web (verified CSPRNG via crypto), Google Apps Script (UNVERIFIED entropy via Utilities.getUuid)
 *
 * NOTE ON CSPRNG COMPLIANCE:
 * - Node.js crypto.randomBytes / Web Crypto getRandomValues are verified CSPRNGs.
 * - Google Apps Script Utilities.getUuid() produces UUIDv4 strings. In Google Apps Script documentation,
 *   its underlying cryptographic strength is officially UNVERIFIED (Google does not formally guarantee
 *   the entropy source of getUuid as a cryptographic PRNG). It is provided as the best available runtime option in GAS.
 */
function generateRandomHex(byteCount) {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(byteCount);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    if (typeof crypto.randomBytes === 'function') {
      return crypto.randomBytes(byteCount).toString('hex');
    }
  }
  if (typeof require !== 'undefined') {
    try {
      const nodeCrypto = require('crypto');
      if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
        return nodeCrypto.randomBytes(byteCount).toString('hex');
      }
    } catch (e) {}
  }
  if (typeof Utilities !== 'undefined' && typeof Utilities.getUuid === 'function') {
    let hex = '';
    while (hex.length < byteCount * 2) {
      hex += Utilities.getUuid().replace(/-/g, '').toLowerCase();
    }
    return hex.slice(0, byteCount * 2);
  }
  const err = new Error("ระบบไม่พบฟังก์ชันสุ่มเข้ารหัสที่ปลอดภัย (CSPRNG is unavailable in this environment)");
  err.code = 'CSPRNG_UNAVAILABLE';
  throw err;
}

/**
 * Converts a string to a UTF-8 Uint8Array.
 * Fully compatible with Google Apps Script V8 (where TextEncoder is undefined), Node.js, and web browsers.
 * Accurately encodes English, Thai, multi-byte Unicode, and surrogate pairs (emojis).
 * Correctly normalizes signed bytes (-128..127) from Google Apps Script Utilities.newBlob to unsigned (0..255).
 */
function stringToUtf8ByteArray(str) {
  if (typeof str !== 'string') {
    str = String(str || '');
  }

  // 1. Google Apps Script native Utilities (returns Java signed bytes: -128..127)
  if (typeof Utilities !== 'undefined' && typeof Utilities.newBlob === 'function') {
    const rawSignedBytes = Utilities.newBlob(str).getBytes();
    const u8 = new Uint8Array(rawSignedBytes.length);
    for (let i = 0; i < rawSignedBytes.length; i++) {
      const b = rawSignedBytes[i];
      u8[i] = b < 0 ? b + 256 : b;
    }
    return u8;
  }

  // 2. Standard Web / Node.js TextEncoder API
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }

  // 3. Pure JavaScript RFC 3629 UTF-8 encoder fallback (handles all Unicode & surrogate pairs without dependencies)
  return utf8EncodePure(str);
}

/**
 * Pure JavaScript RFC 3629 UTF-8 encoder (zero external dependencies)
 * Safely handles English, Thai, Unicode, surrogate pairs, and unpaired surrogates (replaced with U+FFFD per Unicode standard).
 */
function utf8EncodePure(str) {
  if (typeof str !== 'string') {
    str = String(str || '');
  }
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let codePoint = str.charCodeAt(i);
    // Handle surrogate pairs and unpaired surrogates
    if (codePoint >= 0xD800 && codePoint <= 0xDBFF) {
      if (i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          codePoint = ((codePoint - 0xD800) << 10) + (next - 0xDC00) + 0x10000;
          i++;
        } else {
          // Unpaired high surrogate -> replace with U+FFFD per Unicode standard
          codePoint = 0xFFFD;
        }
      } else {
        // Unpaired high surrogate at end of string -> replace with U+FFFD
        codePoint = 0xFFFD;
      }
    } else if (codePoint >= 0xDC00 && codePoint <= 0xDFFF) {
      // Unpaired low surrogate -> replace with U+FFFD per Unicode standard
      codePoint = 0xFFFD;
    }
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xC0 | (codePoint >> 6));
      bytes.push(0x80 | (codePoint & 0x3F));
    } else if (codePoint < 0x10000) {
      bytes.push(0xE0 | (codePoint >> 12));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3F));
      bytes.push(0x80 | (codePoint & 0x3F));
    } else {
      bytes.push(0xF0 | (codePoint >> 18));
      bytes.push(0x80 | ((codePoint >> 12) & 0x3F));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3F));
      bytes.push(0x80 | (codePoint & 0x3F));
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Converts a byte array (signed or unsigned) to a lowercase hex string
 */
function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const unsigned = b < 0 ? b + 256 : b;
    hex += unsigned.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Compute HMAC-SHA256 hex string (compatible with Google Apps Script & Node.js)
 */
function computeHmacSha256Hex(messageStr, keyStr) {
  if (typeof crypto !== 'undefined' && crypto.createHmac) {
    return crypto.createHmac('sha256', keyStr).update(messageStr).digest('hex');
  }
  if (typeof Utilities !== 'undefined' && Utilities.computeHmacSha256Signature) {
    const rawBytes = (Utilities.Charset && Utilities.Charset.UTF_8)
      ? Utilities.computeHmacSha256Signature(messageStr, keyStr, Utilities.Charset.UTF_8)
      : Utilities.computeHmacSha256Signature(messageStr, keyStr);
    return bytesToHex(rawBytes);
  }
  const rawBytes = hmacSha256Pure(stringToUtf8ByteArray(keyStr), stringToUtf8ByteArray(messageStr));
  return bytesToHex(rawBytes);
}

/**
 * Hex string to Uint8Array helper
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Compute PBKDF2-HMAC-SHA256 in hex
 */
function computePbkdf2HmacSha256Hex(passwordStr, saltHex, iterations) {
  if (typeof crypto !== 'undefined' && crypto.pbkdf2Sync) {
    return crypto.pbkdf2Sync(passwordStr, Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256').toString('hex');
  }
  return pbkdf2HmacSha256Pure(passwordStr, hexToBytes(saltHex), iterations);
}

/**
 * Pure JS SHA-256 implementation (compatible with any V8 / Apps Script environment)
 */
function sha256Pure(bytes) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const len = bytes.length;
  const bitLen = len * 8;
  const padLen = (len % 64 < 56) ? (56 - len % 64) : (120 - len % 64);
  const totalLen = len + padLen + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(bytes);
  buf[len] = 0x80;

  const view = new DataView(buf.buffer);
  view.setUint32(totalLen - 4, bitLen, false);

  const w = new Int32Array(64);

  for (let i = 0; i < totalLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      w[j] = view.getInt32(i + (j * 4), false);
    }
    for (let j = 16; j < 64; j++) {
      const s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^ ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^ (w[j - 15] >>> 3);
      const s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^ ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

    for (let j = 0; j < 64; j++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    outView.setInt32(i * 4, H[i], false);
  }
  return out;
}

/**
 * Pure JS HMAC-SHA256
 */
function hmacSha256Pure(keyBytes, msgBytes) {
  let k = keyBytes;
  if (k.length > 64) {
    k = sha256Pure(k);
  }
  const keyPad = new Uint8Array(64);
  keyPad.set(k);

  const oKeyPad = new Uint8Array(64);
  const iKeyPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    oKeyPad[i] = keyPad[i] ^ 0x5c;
    iKeyPad[i] = keyPad[i] ^ 0x36;
  }

  const innerBuf = new Uint8Array(64 + msgBytes.length);
  innerBuf.set(iKeyPad, 0);
  innerBuf.set(msgBytes, 64);
  const innerHash = sha256Pure(innerBuf);

  const outerBuf = new Uint8Array(64 + 32);
  outerBuf.set(oKeyPad, 0);
  outerBuf.set(innerHash, 64);
  return sha256Pure(outerBuf);
}

/**
 * Pure JS PBKDF2-HMAC-SHA256 (compatible with Google Apps Script V8 without TextEncoder)
 */
function pbkdf2HmacSha256Pure(passwordStr, saltBytes, iterations) {
  const pwdBytes = stringToUtf8ByteArray(passwordStr);
  const saltBuf = new Uint8Array(saltBytes.length + 4);
  saltBuf.set(saltBytes, 0);
  saltBuf[saltBytes.length + 3] = 1;

  let u = hmacSha256Pure(pwdBytes, saltBuf);
  const t = new Uint8Array(u);

  for (let c = 1; c < iterations; c++) {
    u = hmacSha256Pure(pwdBytes, u);
    for (let k = 0; k < 32; k++) {
      t[k] ^= u[k];
    }
  }

  return bytesToHex(t);
}

/**
 * Fail-Closed Write Safety Guard
 * Rejects any write mutation immediately if ENABLE_WRITES is missing or not strictly 'true'.
 */
function checkWritesEnabled(props) {
  const enableWrites = props ? props.getProperty('ENABLE_WRITES') : null;
  if (enableWrites !== 'true') {
    const err = new Error("ระบบอยู่ในโหมดปิดรับการบันทึกข้อมูล (Fail-Closed: ENABLE_WRITES != true) ระงับการทำรายการเพื่อความปลอดภัย");
    err.code = 'WRITES_DISABLED';
    throw err;
  }
}

/**
 * Generates an ephemeral signed admin session token (15-minute TTL)
 * Requires ADMIN_HMAC_SECRET in ScriptProperties. Never uses fallback secrets.
 */
function generateAdminSessionToken(props, customTimestamp) {
  const timestamp = (customTimestamp !== undefined ? customTimestamp : Date.now()).toString();
  const nonce = generateRandomHex(16);
  const tokenEpoch = (props && props.getProperty('TOKEN_EPOCH')) || '1';
  const hmacSecret = props ? props.getProperty('ADMIN_HMAC_SECRET') : null;
  if (!hmacSecret || hmacSecret.trim() === '') {
    const err = new Error("ระบบยังไม่ได้ตั้งค่าคีย์ลับ HMAC (ADMIN_HMAC_SECRET) ใน Script Properties");
    err.code = 'AUTH_NOT_CONFIGURED';
    throw err;
  }

  const dataToSign = `${timestamp}:${nonce}:${tokenEpoch}`;
  const sig = computeHmacSha256Hex(dataToSign, hmacSecret);
  return `${timestamp}.${nonce}.${tokenEpoch}.${sig}`;
}

/**
 * Validates admin write authorization token
 * Requires ADMIN_HMAC_SECRET in ScriptProperties. Never uses fallback secrets.
 */
function validateWriteAuth(request, props) {
  checkWritesEnabled(props);

  const hmacSecret = props ? props.getProperty('ADMIN_HMAC_SECRET') : null;
  if (!hmacSecret || hmacSecret.trim() === '') {
    const err = new Error("ระบบยังไม่ได้ตั้งค่าคีย์ลับ HMAC (ADMIN_HMAC_SECRET) ใน Script Properties");
    err.code = 'AUTH_NOT_CONFIGURED';
    throw err;
  }

  const token = (request && (request.token || (request.payload && request.payload.token)))
    ? (request.token || request.payload.token).toString().trim()
    : '';
  if (!token) {
    const err = new Error("ไม่พบ Session Token สำหรับยืนยันตัวตนผู้ดูแลระบบ (Unauthorized: Missing Token)");
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const parts = token.split('.');
  if (parts.length !== 4) {
    const err = new Error("Session Token รูปแบบไม่ถูกต้อง (Unauthorized: Invalid Token Format)");
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const [timestamp, nonce, tokenEpoch, sig] = parts;
  const tokenTime = parseInt(timestamp, 10);
  const now = Date.now();
  const maxAge = 15 * 60 * 1000; // 15 minutes

  if (isNaN(tokenTime) || (now - tokenTime > maxAge) || (tokenTime > now + 60000)) {
    const err = new Error("เซสชันผู้ดูแลระบบหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่ (Unauthorized: Session Expired)");
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  const currentEpoch = (props && props.getProperty('TOKEN_EPOCH')) || '1';
  if (tokenEpoch !== currentEpoch) {
    const err = new Error("เซสชันผู้ดูแลระบบถูกเพิกถอนแล้ว กรุณาเข้าสู่ระบบใหม่ (Unauthorized: Session Revoked)");
    err.code = 'SESSION_REVOKED';
    throw err;
  }

  const dataToSign = `${timestamp}:${nonce}:${tokenEpoch}`;
  const expectedSig = computeHmacSha256Hex(dataToSign, hmacSecret);

  if (!constantTimeEquals(sig, expectedSig)) {
    const err = new Error("Session Token ลายเซ็นไม่ถูกต้องหรือถูกดัดแปลง (Unauthorized: Tampered Token)");
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  return true;
}

/**
 * Handles administrator password verification (PBKDF2 salted hash comparison or direct comparison)
 */
function handleAdminLogin(payload, props) {
  if (!props) {
    props = PropertiesService.getScriptProperties();
  }

  const password = (payload && payload.password) ? payload.password.toString() : '';
  if (!password) {
    return { valid: false, code: 'INVALID_CREDENTIALS', message: 'กรุณากรอกรหัสผ่านผู้ดูแลระบบ' };
  }

  // Supports both direct password entry (ADMIN_PASSWORD) and PBKDF2 hash (ADMIN_PASSWORD_PBKDF2)
  const storedConfig = props ? (props.getProperty('ADMIN_PASSWORD') || props.getProperty('ADMIN_PASSWORD_PBKDF2')) : null;
  if (!storedConfig || storedConfig.trim() === '') {
    const err = new Error("ระบบยังไม่ได้ตั้งค่ารหัสผ่านผู้ดูแลระบบ (ADMIN_PASSWORD หรือ ADMIN_PASSWORD_PBKDF2) ใน Script Properties");
    err.code = 'AUTH_NOT_CONFIGURED';
    throw err;
  }

  const rawConfig = storedConfig.trim();
  let isValid = false;

  if (rawConfig.startsWith('pbkdf2_sha256$')) {
    const parts = rawConfig.split('$');
    if (parts.length !== 4) {
      const err = new Error("รูปแบบรหัสผ่านที่จัดเก็บบนเซิร์ฟเวอร์ไม่ถูกต้อง");
      err.code = 'AUTH_CONFIG_ERROR';
      throw err;
    }

    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const expectedHashHex = parts[3];

    const computedHashHex = computePbkdf2HmacSha256Hex(password, saltHex, iterations);
    isValid = constantTimeEquals(computedHashHex, expectedHashHex);
  } else {
    // Direct plaintext password comparison with constant-time equality check
    isValid = constantTimeEquals(password, rawConfig);
  }

  if (!isValid) {
    return { valid: false, code: 'INVALID_CREDENTIALS', message: 'รหัสผ่านผู้ดูแลระบบไม่ถูกต้อง' };
  }

  const token = generateAdminSessionToken(props);
  return {
    valid: true,
    token: token,
    expiresInSeconds: 900,
    expiresAt: Date.now() + 900 * 1000,
    message: "เข้าสู่ระบบผู้ดูแลระบบสำเร็จ"
  };
}

/**
 * Handles administrator logout (Session Revocation via TOKEN_EPOCH bump)
 */
function handleAdminLogout(props) {
  const currentEpoch = (props && props.getProperty('TOKEN_EPOCH')) || '1';
  const nextEpoch = (parseInt(currentEpoch, 10) + 1).toString();
  if (props) {
    props.setProperty('TOKEN_EPOCH', nextEpoch);
  }
  return {
    success: true,
    message: "ออกจากระบบและเพิกถอนเซสชันเรียบร้อยแล้ว"
  };
}

/**
 * Server Setup Helper: securely derives and saves PBKDF2 salt & hash into ScriptProperties
 * Default & minimum iteration count: 600,000 (OWASP Password Storage Cheat Sheet standard for PBKDF2-HMAC-SHA256).
 */
function setupAdminPassword(newPassword, iterations = 600000) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error("รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร");
  }
  if (iterations < 600000) {
    const err = new Error("จำนวนรอบ PBKDF2 ต่ำกว่ามาตรฐานความปลอดภัย (OWASP กำหนดขั้นต่ำ 600,000 รอบ สำหรับ PBKDF2-HMAC-SHA256)");
    err.code = 'INSUFFICIENT_ITERATIONS';
    throw err;
  }
  const saltHex = generateRandomHex(16);
  const hashHex = computePbkdf2HmacSha256Hex(newPassword, saltHex, iterations);
  const storedValue = `pbkdf2_sha256$${iterations}$${saltHex}$${hashHex}`;

  const props = PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_PASSWORD_PBKDF2', storedValue);
  if (!props.getProperty('ADMIN_HMAC_SECRET')) {
    props.setProperty('ADMIN_HMAC_SECRET', generateRandomHex(32));
  }
  if (!props.getProperty('TOKEN_EPOCH')) {
    props.setProperty('TOKEN_EPOCH', '1');
  }
  return {
    success: true,
    iterations: iterations,
    message: "บันทึกรหัสผ่านผู้ดูแลระบบเรียบร้อยแล้ว"
  };
}

/**
 * Handle HTTP POST Requests (Write/Update/Delete Data)
 */
function doPost(e) {
  try {
    // Google Apps Script usually wraps POST body in e.postData.contents
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("No payload provided in POST request.");
    }

    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const payload = request.payload;
    const props = PropertiesService.getScriptProperties();
    let result = {};

    switch (action) {
      case 'verifyAdminPassword':
        result = handleAdminLogin(payload, props);
        if (result && result.valid === false) {
          const authErr = new Error(result.message || "รหัสผ่านไม่ถูกต้อง");
          authErr.code = result.code || 'INVALID_CREDENTIALS';
          throw authErr;
        }
        break;
      case 'adminLogout':
        validateWriteAuth(request, props);
        result = handleAdminLogout(props);
        break;
      case 'createStudent':
        validateWriteAuth(request, props);
        result = createStudent(payload);
        break;
      case 'updateStudent':
        validateWriteAuth(request, props);
        result = updateStudent(payload);
        break;
      case 'deleteStudent':
        validateWriteAuth(request, props);
        result = deleteStudent(payload.rowNumber, payload.studentName, payload.studentId);
        break;
      case 'saveAppConfig':
        validateWriteAuth(request, props);
        // Note: payload.spreadsheetId is explicitly ignored to prevent arbitrary spreadsheet repointing
        result = saveAppConfig(payload.sheetName, payload.reportDate, payload.columnOrder);
        break;
      default:
        const unkErr = new Error("Unknown POST action: " + action);
        unkErr.code = 'INVALID_ACTION';
        throw unkErr;
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: result
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    const errorCode = err.code || (err.message && err.message.includes('Unauthorized') ? 'UNAUTHORIZED' : (err.message && err.message.includes('Fail-Closed') ? 'WRITES_DISABLED' : 'SERVER_ERROR'));
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      code: errorCode,
      message: err.message,
      stack: err.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper to fetch the database sheet dynamically
 * Strict Sheet Selection Guard:
 * - Looks up sheet by exact name or matching GID.
 * - NEVER falls back to GID 0, GID 86711650, or sheets[0] automatically.
 * - Halts execution if the specified sheet tab cannot be found.
 */
function getDbSheet() {
  const config = getAppConfig();
  const ss = SpreadsheetApp.openById(config.spreadsheetId);
  
  // Try to find sheet by name first
  let sheet = ss.getSheetByName(config.sheetName);
  if (sheet) {
    return sheet;
  }
  
  // Fallback: Check if sheetName is GID
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId && sheets[i].getSheetId().toString() === config.sheetName) {
      return sheets[i];
    }
  }
  
  // Strict Safety Guard: DO NOT fallback to GID 0 or sheets[0]!
  throw new Error("ไม่พบแผ่นงานชื่อ '" + config.sheetName + "' ในโครงการชีตที่เชื่อมต่อ ระงับการทำงาน (ไม่อนุญาตให้เลือกแผ่นงานแรกโดยอัตโนมัติเพื่อป้องกันข้อมูลผิดพลาด)");
}

/**
 * Helper to check if a checkbox value is truthy (e.g. "1", "TRUE", true)
 */
function isCheckboxChecked(val) {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'boolean') return val ? 1 : 0;
  const str = val.toString().trim().toUpperCase();
  return (str === "1" || str === "TRUE" || str === "YES" || str === "Y") ? 1 : 0;
}

/**
 * Detect sheet column layout (New 17-col A-Q with SET studentId vs Legacy 16-col A-P)
 * Safe bounded range reading: NEVER reads beyond actual sheet dimensions.
 * Header detection: Scans through multi-row title banners to identify the true table header row.
 * True Subheader detection: Only advances dataStartRow if a genuine subheader row exists
 * (student name cell is empty and cells match service category subheaders).
 * Rejects unsupported column layouts: Returns UNKNOWN if column positions do not match what
 * getStudentData() expects, preventing incorrect writes and column shifting.
 */
function detectSheetLayout(sheet) {
  const lastCol = sheet.getLastColumn ? sheet.getLastColumn() : 0;
  const lastRow = sheet.getLastRow ? sheet.getLastRow() : 0;
  if (lastRow < 1 || lastCol < 1) {
    return {
      type: 'UNKNOWN',
      nameCol: null,
      studentIdCol: null,
      colCount: 0,
      isAq: false,
      headerRow: -1,
      dataStartRow: 3,
      reason: 'ชีตว่างเปล่า ไม่มีข้อมูล'
    };
  }

  // Safety: NEVER read beyond actual sheet columns (bounds guard)
  const scanRows = Math.min(lastRow, 10); // Scan up to first 10 rows for table header
  const headerRange = sheet.getRange(1, 1, scanRows, lastCol);
  const displayValues = headerRange.getDisplayValues();

  for (let r = 0; r < scanRows; r++) {
    const row = displayValues[r] || [];
    let nameIdx = -1;
    let studentIdIdx = -1;

    for (let c = 0; c < row.length; c++) {
      const cell = (row[c] || '').toString().trim();
      // Match 'ชื่อ-สกุล', 'ชื่อ - สกุล', or 'ชื่อ' (excluding title banners like 'รายงานรายชื่อ...')
      if (/ชื่อ\s*[-–—]?\s*สกุล|ชื่อนักเรียน/i.test(cell) || (cell === 'ชื่อ' || (cell.startsWith('ชื่อ') && !cell.includes('รายงาน')))) {
        nameIdx = c;
      }
      if (/เลขประจำตัวนักเรียน|รหัสนักเรียน/i.test(cell) || (/เลขประจำตัว/i.test(cell) && !cell.includes('ประชาชน'))) {
        studentIdIdx = c;
      }
    }

    // Fallback if strict regex didn't catch: check if cell contains 'ชื่อ' and is not a whole report title banner
    if (nameIdx === -1) {
      for (let c = 0; c < row.length; c++) {
        const cell = (row[c] || '').toString().trim();
        if (/ชื่อ/i.test(cell) && cell.length < 25 && !cell.includes('รายงาน')) {
          nameIdx = c;
          break;
        }
      }
    }

    if (nameIdx !== -1) {
      // Header row found (1-based index)
      const headerRow = r + 1;

      // Determine dataStartRow:
      // True subheader check: A genuine subheader row NEVER has a student name (name cell is empty)
      // and contains service category subheaders ('ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน').
      // This prevents false positives when a student belongs to a classroom containing 'หน่วยบริการ'.
      let dataStartRow = headerRow + 1;
      if (r + 1 < scanRows) {
        const nextRow = displayValues[r + 1] || [];
        const nextName = (nextRow[nameIdx] || '').toString().trim();
        if (!nextName) {
          const hasSubheaderCells = nextRow.some(cell => {
            const c = (cell || '').toString().trim();
            return c === 'ในศูนย์' || c === 'หน่วยบริการ' || c === 'ปรับบ้าน';
          });
          if (hasSubheaderCells) {
            dataStartRow = headerRow + 2;
          }
        }
      }

      // Check supported layouts that match getStudentData() expectations:
      // 1. NEW_AQ: studentId at Col A (idx 0), name at Col B (idx 1), lastCol >= 16
      if (studentIdIdx === 0 && nameIdx === 1 && lastCol >= 16) {
        return {
          type: 'NEW_AQ',
          nameCol: 2,           // 1-based Col B
          studentIdCol: 1,      // 1-based Col A
          colCount: lastCol,
          isAq: true,
          headerRow: headerRow,
          dataStartRow: dataStartRow
        };
      }

      // 2. LEGACY_AP: name at Col A (idx 0), no studentId column (studentIdIdx === -1), lastCol >= 15
      if (studentIdIdx === -1 && nameIdx === 0 && lastCol >= 15) {
        return {
          type: 'LEGACY_AP',
          nameCol: 1,           // 1-based Col A
          studentIdCol: null,
          colCount: lastCol,
          isAq: false,
          headerRow: headerRow,
          dataStartRow: dataStartRow
        };
      }

      // Any other column layout does not match getStudentData() positions -> Reject as UNKNOWN
      return {
        type: 'UNKNOWN',
        nameCol: nameIdx + 1,
        studentIdCol: studentIdIdx !== -1 ? studentIdIdx + 1 : null,
        colCount: lastCol,
        isAq: false,
        headerRow: headerRow,
        dataStartRow: dataStartRow,
        reason: 'ผังคอลัมน์ไม่ตรงกับตำแหน่งที่ getStudentData() รองรับ'
      };
    }
  }

  return {
    type: 'UNKNOWN',
    nameCol: null,
    studentIdCol: null,
    colCount: lastCol,
    isAq: false,
    headerRow: -1,
    dataStartRow: 3,
    reason: 'ตรวจไม่พบแถวหัวตารางที่ถูกต้อง'
  };
}

/**
 * Read student records from sheet, skipping headers and summary rows
 * Supports both New A-Q layout (with studentId in Col A) and Legacy A-P layout.
 */
function getStudentData() {
  const sheet = getDbSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  const layout = detectSheetLayout(sheet);
  if (layout.type === 'UNKNOWN') {
    throw new Error("โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย (ตรวจไม่พบหัวตารางที่ถูกต้อง) ระงับการอ่านข้อมูลเพื่อความปลอดภัย");
  }

  const startRow = layout.dataStartRow || 3;
  if (lastRow < startRow) {
    return [];
  }

  const students = [];
  const numRows = lastRow - startRow + 1;

  if (layout.type === 'NEW_AQ') {
    // Read only up to lastCol (bounded to 17 columns)
    const readCols = Math.min(lastCol, 17);
    const values = sheet.getRange(startRow, 1, numRows, readCols).getDisplayValues();

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const studentId = row[0] ? row[0].toString().trim() : "";
      const name = row[1] ? row[1].toString().trim() : "";

      // Skip empty lines, legends, footnotes, and summary/notes rows
      if (!name || name === "" || name.includes("ความพิการ") || name.indexOf("รวม") === 0 || name.startsWith("(") || name.indexOf("หมายเหตุ") === 0) {
        continue;
      }

      // rowNumber is startRow + i
      students.push({
        rowNumber: startRow + i,
        studentId: studentId, // Preserves leading zero as string
        name: name,
        classroom: row[2] ? row[2].trim() : "",
        teacher: row[3] ? row[3].trim() : "",
        serviceInCenter: isCheckboxChecked(row[4]),
        serviceUnit: isCheckboxChecked(row[5]),
        serviceAdjustHome: isCheckboxChecked(row[6]),
        disabilityByCard: row[7] ? row[7].trim() : "",
        disabilityByScreening: row[8] ? row[8].trim() : "",
        hasDisabilityCard: isCheckboxChecked(row[9]),
        hasDisabilityCert: isCheckboxChecked(row[10]),
        hasEducationScreening: isCheckboxChecked(row[11]),
        dateOfBirth: row[12] ? row[12].trim() : "", // B.E. Format e.g., "10/11/2562"
        age: row[13] ? row[13].trim() : "",         // Column N: age string e.g., "6 ปี 7 เดือน"
        disabledLater: isCheckboxChecked(row[14]),
        nonThai: isCheckboxChecked(row[15]),
        remarks: row[16] ? row[16].trim() : ""
      });
    }
  } else {
    // Legacy A-P: Read only up to lastCol (bounded to 16 columns)
    const readCols = Math.min(lastCol, 16);
    const values = sheet.getRange(startRow, 1, numRows, readCols).getDisplayValues();

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const name = row[0] ? row[0].toString().trim() : "";

      // Skip empty lines, legends, footnotes, and summary/notes rows
      if (!name || name === "" || name.includes("ความพิการ") || name.indexOf("รวม") === 0 || name.startsWith("(") || name.indexOf("หมายเหตุ") === 0) {
        continue;
      }

      students.push({
        rowNumber: startRow + i,
        studentId: "",
        name: name,
        classroom: row[1] ? row[1].trim() : "",
        teacher: row[2] ? row[2].trim() : "",
        serviceInCenter: isCheckboxChecked(row[3]),
        serviceUnit: isCheckboxChecked(row[4]),
        serviceAdjustHome: isCheckboxChecked(row[5]),
        disabilityByCard: row[6] ? row[6].trim() : "",
        disabilityByScreening: row[7] ? row[7].trim() : "",
        hasDisabilityCard: isCheckboxChecked(row[8]),
        hasDisabilityCert: isCheckboxChecked(row[9]),
        hasEducationScreening: isCheckboxChecked(row[10]),
        dateOfBirth: row[11] ? row[11].trim() : "",
        age: row[12] ? row[12].trim() : "",
        disabledLater: isCheckboxChecked(row[13]),
        nonThai: isCheckboxChecked(row[14]),
        remarks: row[15] ? row[15].trim() : ""
      });
    }
  }

  return students;
}

/**
 * Find the row where we should insert new student data
 * Checks name column and footer notes to avoid stopping prematurely on blank student IDs.
 */
function findInsertionRow(sheet) {
  const lastRow = sheet.getLastRow();
  const layout = detectSheetLayout(sheet);
  const startRow = layout.dataStartRow || 3;
  if (lastRow < startRow) return startRow;

  const nameCol = (layout && layout.nameCol) ? layout.nameCol : 2;

  const nameVals = sheet.getRange(1, nameCol, lastRow, 1).getValues();
  const col1Vals = (nameCol !== 1) ? sheet.getRange(1, 1, lastRow, 1).getValues() : nameVals;

  for (let r = startRow - 1; r < lastRow; r++) {
    const nameVal = (nameVals[r] && nameVals[r][0] !== undefined && nameVals[r][0] !== null) ? nameVals[r][0].toString().trim() : "";
    const col1Val = (col1Vals[r] && col1Vals[r][0] !== undefined && col1Vals[r][0] !== null) ? col1Vals[r][0].toString().trim() : "";

    // End of student records reached (blank student name, footnotes, or summary rows)
    if (!nameVal || nameVal === "" ||
        nameVal.includes("ความพิการ") || nameVal.indexOf("รวม") === 0 || nameVal.startsWith("(") || nameVal.indexOf("หมายเหตุ") === 0 ||
        col1Val.includes("ความพิการ") || col1Val.indexOf("รวม") === 0 || col1Val.startsWith("(") || col1Val.indexOf("หมายเหตุ") === 0) {
      return r + 1; // 1-based index
    }
  }
  return lastRow + 1;
}

/**
 * Find row index of student by name (for self-healing row mapping)
 * Dynamically uses layout.nameCol and layout.dataStartRow.
 */
function findRowByStudentName(sheet, name) {
  const lastRow = sheet.getLastRow();
  const layout = detectSheetLayout(sheet);
  if (layout.type === 'UNKNOWN') return -1;

  const startRow = layout.dataStartRow || 3;
  if (lastRow < startRow) return -1;

  const nameCol = layout.nameCol;
  const numRows = lastRow - startRow + 1;
  const names = sheet.getRange(startRow, nameCol, numRows, 1).getValues().map(r => r[0] ? r[0].toString().trim() : "");
  const index = names.indexOf(name.trim());
  if (index !== -1) {
    return index + startRow; // data starts at startRow
  }
  return -1;
}

/**
 * Resolves the exact target student row with Duplicate Name and Ambiguous Identity Protection.
 * 1. Finds all candidate rows matching targetName.
 * 2. If no candidate found -> returns -1.
 * 3. If multiple candidates exist (ชื่อซ้ำ):
 *    - In LEGACY_AP (no SET ID column): Cannot safely disambiguate -> HALTS immediately.
 *    - In NEW_AQ: Requires targetStudentId to disambiguate. If studentId is missing, conflicting,
 *      or matches 0/multiple rows -> HALTS immediately with an informative error.
 * 4. If single candidate found:
 *    - Verifies that targetStudentId (if provided) does not contradict existing studentId.
 *    - Returns the verified row number.
 */
function findTargetStudentRow(sheet, layout, targetName, reportedRow, targetStudentId) {
  if (!targetName || targetName.trim() === '') {
    return -1;
  }
  const cleanName = targetName.trim();
  const cleanSid = (targetStudentId !== undefined && targetStudentId !== null) ? targetStudentId.toString().trim() : "";

  const startRow = layout.dataStartRow || 3;
  const lastRow = sheet.getLastRow ? sheet.getLastRow() : 0;
  if (lastRow < startRow) return -1;

  const numRows = lastRow - startRow + 1;
  const nameValues = sheet.getRange(startRow, layout.nameCol, numRows, 1).getValues();

  // Find all candidate rows matching targetName (1-based row indices)
  const matchingRows = [];
  for (let i = 0; i < numRows; i++) {
    const val = (nameValues[i] && nameValues[i][0] !== undefined && nameValues[i][0] !== null) ? nameValues[i][0].toString().trim() : "";
    if (val === cleanName) {
      matchingRows.push(startRow + i);
    }
  }

  if (matchingRows.length === 0) {
    return -1;
  }

  // Handle Duplicate Name (Multiple candidates with the exact same name)
  if (matchingRows.length > 1) {
    if (layout.type !== 'NEW_AQ' || !layout.studentIdCol) {
      throw new Error("พบชื่อนักเรียนซ้ำกัน " + matchingRows.length + " รายการ ('" + cleanName + "') ในแถว " + matchingRows.join(', ') + " และชีตไม่มีคอลัมน์รหัสนักเรียน SET ไม่สามารถระบุตัวตนได้อย่างปลอดภัย ระงับการทำรายการ");
    }

    if (!cleanSid) {
      throw new Error("พบชื่อนักเรียนซ้ำกัน " + matchingRows.length + " รายการ ('" + cleanName + "') ในแถว " + matchingRows.join(', ') + " กรุณาระบุรหัสนักเรียน SET (studentId) เพื่อยืนยันตัวตน ระงับการทำรายการเพื่อความปลอดภัย");
    }

    // Filter candidate rows by matching targetStudentId in Column A
    const idMatches = [];
    for (const r of matchingRows) {
      const cellVal = sheet.getRange(r, layout.studentIdCol).getValue();
      const existingSid = (cellVal !== undefined && cellVal !== null) ? cellVal.toString().trim() : "";
      if (existingSid === cleanSid) {
        idMatches.push(r);
      }
    }

    if (idMatches.length === 1) {
      return idMatches[0]; // Successfully disambiguated!
    } else if (idMatches.length === 0) {
      throw new Error("พบชื่อนักเรียนซ้ำกัน " + matchingRows.length + " รายการ ('" + cleanName + "') แต่ไม่มีแถวใดตรงกับรหัสนักเรียน SET ('" + cleanSid + "') ระงับการทำรายการเพื่อความปลอดภัย");
    } else {
      throw new Error("พบข้อมูลซ้ำซ้อนทั้งชื่อ ('" + cleanName + "') และรหัสนักเรียน ('" + cleanSid + "') ในแถว " + idMatches.join(', ') + " ระงับการทำรายการ");
    }
  }

  // Exactly 1 candidate row
  const candidateRow = matchingRows[0];

  // If NEW_AQ, verify targetStudentId does not conflict with existing studentId
  if (layout.type === 'NEW_AQ' && layout.studentIdCol) {
    const existingVal = sheet.getRange(candidateRow, layout.studentIdCol).getValue();
    const existingSid = (existingVal !== undefined && existingVal !== null) ? existingVal.toString().trim() : "";
    if (existingSid !== "" && cleanSid !== "" && cleanSid !== existingSid) {
      throw new Error("รหัสนักเรียนที่ส่งมา ('" + cleanSid + "') ขัดแย้งกับรหัสเดิมในฐานข้อมูล ('" + existingSid + "') ระงับการทำรายการเพื่อความปลอดภัย");
    }
  }

  return candidateRow;
}

/**
 * Server-Side Validation logic
 */
function validateStudentData(student, isEdit, sheet) {
  if (!student.name || student.name.trim() === "") {
    throw new Error("กรุณากรอกชื่อ-สกุล ของนักเรียน");
  }

  // Check duplicate name on creation only
  if (!isEdit) {
    const existingRow = findRowByStudentName(sheet, student.name);
    if (existingRow !== -1) {
      throw new Error("ชื่อ-สกุล '" + student.name.trim() + "' มีอยู่ในฐานข้อมูลแล้ว ไม่สามารถสร้างซ้ำได้");
    }
  }

  // Check duplicate studentId on creation in New A-Q sheet
  if (!isEdit && student.studentId && student.studentId.toString().trim() !== "") {
    const layout = detectSheetLayout(sheet);
    if (layout.type === 'NEW_AQ') {
      const startRow = layout.dataStartRow || 3;
      const lastRow = sheet.getLastRow();
      if (lastRow >= startRow) {
        const numRows = lastRow - startRow + 1;
        const sidList = sheet.getRange(startRow, 1, numRows, 1).getValues().map(r => r[0] ? r[0].toString().trim() : "");
        if (sidList.includes(student.studentId.toString().trim())) {
          throw new Error("รหัสนักเรียน '" + student.studentId.toString().trim() + "' มีอยู่ในฐานข้อมูลแล้ว ไม่สามารถสร้างซ้ำได้");
        }
      }
    }
  }

  // Validate Date format (DD/MM/YYYY)
  const dobPattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  if (!student.dateOfBirth || !dobPattern.test(student.dateOfBirth)) {
    throw new Error("รูปแบบวันเดือนปีเกิดไม่ถูกต้อง ต้องเป็น วัน/เดือน/ปีพ.ศ. (เช่น 10/11/2562)");
  }

  const parts = student.dateOfBirth.split("/");
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error("ระบุวันหรือเดือนเกิดไม่ถูกต้อง");
  }
  if (year < 2450 || year > 2650) {
    throw new Error("ปี พ.ศ. ของวันเกิดต้องอยู่ระหว่าง 2450 - 2650");
  }

  // Ensure at least one service type is selected
  if (!student.serviceInCenter && !student.serviceUnit && !student.serviceAdjustHome) {
    throw new Error("กรุณาเลือกประเภทการรับบริการอย่างน้อย 1 ประเภท (ในศูนย์, หน่วยบริการ หรือ ปรับบ้าน)");
  }
}

/**
 * CREATE: Add a new student record
 * Safe studentId handling: does NOT invent IDs; writes blank string if unverified.
 * Formula preservation & reference adjustment: copies formula in age column from the row above
 * if present and adjusts relative row references (e.g., M5 -> M6) to point to the new row's birth date.
 * Protects against writing if column structure is unexpected.
 */
function createStudent(studentObj) {
  const props = PropertiesService.getScriptProperties();
  checkWritesEnabled(props);

  const sheet = getDbSheet();
  const layout = detectSheetLayout(sheet);

  if (layout.type === 'UNKNOWN') {
    throw new Error("โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย ระงับการบันทึกข้อมูลเพื่อความปลอดภัย");
  }

  // 1. Validation
  validateStudentData(studentObj, false, sheet);

  // 2. Insert row before footer/total rows
  const insertRow = findInsertionRow(sheet);
  sheet.insertRowBefore(insertRow);

  // 3. Prepare values array (handle studentId safely without inventing IDs)
  const rawSid = (studentObj.studentId !== undefined && studentObj.studentId !== null) ? studentObj.studentId.toString().trim() : "";

  const startRow = layout.dataStartRow || 3;
  const ageCol = (layout.type === 'NEW_AQ') ? 14 : 13;

  // Preserve and adjust formula from the row above if available
  let ageValue = "";
  if (insertRow > startRow) {
    const prevRow = insertRow - 1;
    const rowAboveCell = sheet.getRange(prevRow, ageCol);
    const formulaAbove = rowAboveCell.getFormula ? rowAboveCell.getFormula() : "";
    if (formulaAbove && formulaAbove.trim().startsWith('=')) {
      // Adjust relative row references from prevRow to insertRow (e.g. M5 -> M6, $M5 -> $M6)
      // Preserves absolute references like $M$5 or $Z$1
      const regex = new RegExp(`(^|[^$A-Za-z0-9_])([$]?[A-Za-z]+)${prevRow}(?!\\d)`, 'g');
      ageValue = formulaAbove.replace(regex, `$1$2${insertRow}`);
    }
  }

  if (layout.type === 'NEW_AQ') {
    const rowValues = [
      rawSid, // Column A: studentId (safe blank string if unverified)
      (studentObj.name || '').trim(),
      (studentObj.classroom || '').trim(),
      (studentObj.teacher || '').trim(),
      studentObj.serviceInCenter ? 1 : "",
      studentObj.serviceUnit ? 1 : "",
      studentObj.serviceAdjustHome ? 1 : "",
      (studentObj.disabilityByCard || '').trim(),
      (studentObj.disabilityByScreening || '').trim(),
      studentObj.hasDisabilityCard ? 1 : "",
      studentObj.hasDisabilityCert ? 1 : "",
      studentObj.hasEducationScreening ? 1 : "",
      (studentObj.dateOfBirth || '').trim(),
      ageValue, // age column (N) - preserves adjusted formula if present
      studentObj.disabledLater ? 1 : "",
      studentObj.nonThai ? 1 : "",
      (studentObj.remarks || '').trim()
    ];
    sheet.getRange(insertRow, 1, 1, 17).setValues([rowValues]);
  } else {
    // Legacy 16-column
    const rowValues = [
      (studentObj.name || '').trim(),
      (studentObj.classroom || '').trim(),
      (studentObj.teacher || '').trim(),
      studentObj.serviceInCenter ? 1 : "",
      studentObj.serviceUnit ? 1 : "",
      studentObj.serviceAdjustHome ? 1 : "",
      (studentObj.disabilityByCard || '').trim(),
      (studentObj.disabilityByScreening || '').trim(),
      studentObj.hasDisabilityCard ? 1 : "",
      studentObj.hasDisabilityCert ? 1 : "",
      studentObj.hasEducationScreening ? 1 : "",
      (studentObj.dateOfBirth || '').trim(),
      ageValue, // age column (M) - preserves adjusted formula if present
      studentObj.disabledLater ? 1 : "",
      studentObj.nonThai ? 1 : "",
      (studentObj.remarks || '').trim()
    ];
    sheet.getRange(insertRow, 1, 1, 16).setValues([rowValues]);
  }

  return {
    success: true,
    message: "บันทึกข้อมูลนักเรียนรายใหม่สำเร็จ",
    studentName: studentObj.name
  };
}

/**
 * UPDATE: Modify existing student record (with Identity Check & Self-Healing Row checks)
 * Crucial Guard:
 * 1. Uses findTargetStudentRow() to verify identity; guards against duplicate names and shifts.
 * 2. Existing Column A studentId is NEVER accidentally overwritten with blank.
 * 3. If incoming studentId CONFLICTS with existing studentId, halts update to prevent mismatch.
 * 4. Preserves existing formulas in the sheet (e.g. age calculation formula).
 * 5. Protects against writing if column structure is unexpected.
 */
function updateStudent(studentObj) {
  const props = PropertiesService.getScriptProperties();
  checkWritesEnabled(props);

  const sheet = getDbSheet();
  const layout = detectSheetLayout(sheet);

  if (layout.type === 'UNKNOWN') {
    throw new Error("โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย ระงับการอัปเดตข้อมูลเพื่อความปลอดภัย");
  }

  // 1. Validation
  validateStudentData(studentObj, true, sheet);

  // 2. Identity & Target Row Verification
  const targetRow = findTargetStudentRow(sheet, layout, studentObj.name, studentObj.rowNumber, studentObj.studentId);
  if (targetRow === -1) {
    throw new Error("ไม่พบชื่อนักเรียน '" + studentObj.name + "' ในชีต ระบบค้นหาแถวอัปเดตไม่สำเร็จ ระงับการทำรายการเพื่อป้องกันการแก้ไขผิดคน");
  }

  const ageCol = (layout.type === 'NEW_AQ') ? 14 : 13;
  const ageCell = sheet.getRange(targetRow, ageCol);
  const existingAgeFormula = ageCell.getFormula ? ageCell.getFormula() : "";
  let ageValue = "";

  if (existingAgeFormula && existingAgeFormula.trim().startsWith('=')) {
    ageValue = existingAgeFormula; // Preserve formula!
  } else {
    const cellVal = ageCell.getValue();
    ageValue = (cellVal !== undefined && cellVal !== null) ? cellVal : "";
  }

  if (layout.type === 'NEW_AQ') {
    // Read existing Column A
    const existingColA = sheet.getRange(targetRow, 1).getValue();
    const existingStudentId = (existingColA !== undefined && existingColA !== null) ? existingColA.toString().trim() : "";
    const incomingStudentId = (studentObj.studentId !== undefined && studentObj.studentId !== null) ? studentObj.studentId.toString().trim() : "";

    // CONFLICT GUARD: If existing studentId is set, and incoming studentId differs -> HALT!
    if (existingStudentId !== "" && incomingStudentId !== "" && incomingStudentId !== existingStudentId) {
      throw new Error("รหัสนักเรียนที่ส่งมา ('" + incomingStudentId + "') ขัดแย้งกับรหัสเดิมในฐานข้อมูล ('" + existingStudentId + "') ระงับการแก้ไขข้อมูลเพื่อความปลอดภัย");
    }

    let finalStudentId = existingStudentId;
    // If no existing ID, allow setting incoming ID
    if (existingStudentId === "" && incomingStudentId !== "") {
      finalStudentId = incomingStudentId;
    }

    const rowValues = [
      finalStudentId, // Column A: preserved or verified update (never overwritten with blank)
      (studentObj.name || '').trim(),
      (studentObj.classroom || '').trim(),
      (studentObj.teacher || '').trim(),
      studentObj.serviceInCenter ? 1 : "",
      studentObj.serviceUnit ? 1 : "",
      studentObj.serviceAdjustHome ? 1 : "",
      (studentObj.disabilityByCard || '').trim(),
      (studentObj.disabilityByScreening || '').trim(),
      studentObj.hasDisabilityCard ? 1 : "",
      studentObj.hasDisabilityCert ? 1 : "",
      studentObj.hasEducationScreening ? 1 : "",
      (studentObj.dateOfBirth || '').trim(),
      ageValue, // Column N: preserves existing formula or value
      studentObj.disabledLater ? 1 : "",
      studentObj.nonThai ? 1 : "",
      (studentObj.remarks || '').trim()
    ];

    sheet.getRange(targetRow, 1, 1, 17).setValues([rowValues]);
  } else {
    // Legacy 16-column
    const rowValues = [
      (studentObj.name || '').trim(),
      (studentObj.classroom || '').trim(),
      (studentObj.teacher || '').trim(),
      studentObj.serviceInCenter ? 1 : "",
      studentObj.serviceUnit ? 1 : "",
      studentObj.serviceAdjustHome ? 1 : "",
      (studentObj.disabilityByCard || '').trim(),
      (studentObj.disabilityByScreening || '').trim(),
      studentObj.hasDisabilityCard ? 1 : "",
      studentObj.hasDisabilityCert ? 1 : "",
      studentObj.hasEducationScreening ? 1 : "",
      (studentObj.dateOfBirth || '').trim(),
      ageValue, // Column M: preserves formula or value
      studentObj.disabledLater ? 1 : "",
      studentObj.nonThai ? 1 : "",
      (studentObj.remarks || '').trim()
    ];

    sheet.getRange(targetRow, 1, 1, 16).setValues([rowValues]);
  }

  return {
    success: true,
    message: "อัปเดตข้อมูลนักเรียนสำเร็จ",
    studentName: studentObj.name
  };
}

/**
 * DELETE: Remove a student record (with Identity Check & Ambiguity Protection)
 * Uses findTargetStudentRow to resolve row safely and prevent deleting the wrong student on duplicate names.
 */
function deleteStudent(rowNumber, studentName, studentId) {
  const props = PropertiesService.getScriptProperties();
  checkWritesEnabled(props);

  const sheet = getDbSheet();
  const layout = detectSheetLayout(sheet);

  if (layout.type === 'UNKNOWN') {
    throw new Error("โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย ระงับการลบข้อมูลเพื่อความปลอดภัย");
  }

  const targetRow = findTargetStudentRow(sheet, layout, studentName, rowNumber, studentId);
  if (targetRow === -1) {
    throw new Error("ไม่พบชื่อนักเรียน '" + studentName + "' ในชีต ไม่สามารถทำการลบได้ (ระงับการทำรายการเพื่อป้องกันการลบผิดคน)");
  }

  // Delete row safely
  sheet.deleteRow(targetRow);

  return {
    success: true,
    message: "ลบข้อมูลของ " + studentName + " เรียบร้อยแล้ว"
  };
}

/**
 * Read student records and active configuration
 */
function getStudentDataAndConfig() {
  const config = getAppConfig();
  const students = getStudentData();
  
  // If reportDate is not set, use current date formatted in Thai B.E. DD/MM/YYYY
  let displayDate = config.reportDate;
  if (!displayDate) {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1; // 1-indexed
    const year = today.getFullYear() + 543; // AD to BE
    displayDate = `${day}/${month}/${year}`;
  }
  
  return {
    students: students,
    config: {
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      reportDate: displayDate,
      rawReportDate: config.reportDate, // empty if not set
      columnOrder: config.columnOrder || "name,classroom,teacher,serviceType,disabilityType,documents,birthday,conditions"
    }
  };
}

/**
 * Fetch all sheet tabs from a spreadsheet URL
 */
function getSheetTabsFromUrl(spreadsheetUrl) {
  try {
    let spreadsheetId = spreadsheetUrl.trim();
    if (spreadsheetUrl.includes("docs.google.com/spreadsheets")) {
      const matches = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (matches && matches[1]) {
        spreadsheetId = matches[1];
      }
    }
    
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheets = ss.getSheets();
    const tabs = sheets.map(s => {
      return {
        name: s.getName(),
        id: s.getSheetId().toString()
      };
    });
    
    return {
      success: true,
      spreadsheetId: spreadsheetId,
      tabs: tabs
    };
  } catch (err) {
    return {
      success: false,
      message: err.message
    };
  }
}

/**
 * Save new app settings configurations to script properties
 * Note: APP_SPREADSHEET_ID is strictly immutable via API to prevent arbitrary spreadsheet repointing.
 */
function saveAppConfig(sheetName, reportDate, columnOrder) {
  try {
    const props = PropertiesService.getScriptProperties();
    checkWritesEnabled(props);

    if (!sheetName || sheetName.trim() === '') {
      throw new Error("กรุณาระบุชื่อแผ่นงาน (Sheet Name)");
    }
    props.setProperty('APP_SHEET_NAME', sheetName.trim());
    props.setProperty('APP_REPORT_DATE', (reportDate || '').trim());
    if (columnOrder) {
      props.setProperty('APP_COLUMN_ORDER', columnOrder.trim());
    }
    return {
      success: true,
      message: "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว (Spreadsheet ID ถูกป้องกันไม่ให้เปลี่ยนแปลงผ่าน API)"
    };
  } catch (err) {
    return {
      success: false,
      message: err.message
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAppConfig,
    getDbSheet,
    detectSheetLayout,
    getStudentData,
    findInsertionRow,
    findRowByStudentName,
    findTargetStudentRow,
    validateStudentData,
    createStudent,
    updateStudent,
    deleteStudent,
    isCheckboxChecked,
    saveAppConfig,
    doGet,
    doPost,
    checkWritesEnabled,
    constantTimeEquals,
    generateRandomHex,
    stringToUtf8ByteArray,
    utf8EncodePure,
    bytesToHex,
    hexToBytes,
    computeHmacSha256Hex,
    computePbkdf2HmacSha256Hex,
    pbkdf2HmacSha256Pure,
    generateAdminSessionToken,
    validateWriteAuth,
    handleAdminLogin,
    handleAdminLogout,
    setupAdminPassword
  };
}
