/**
 * SET Excel Importer & Diff Preview Engine
 * Project: Student Info LPSEC
 * 
 * Functions:
 * 1. Client-side Excel parsing (.xls, .xlsx) via SheetJS
 * 2. Header and column structure validation with flexible alias matching
 * 3. Multi-file joining across SET reports using Citizen ID / Student ID
 * 4. Compound-key matching & diff comparison against Google Sheets
 * 5. Strict PII sanitization (masks Citizen ID, keeps data client-side in memory)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SETImporter = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Common SET Column Aliases for resilient header matching
  const COLUMN_ALIASES = {
    citizenId: [
      'เลขประจำตัวประชาชน', 'เลขบัตรประชาชน', 'เลขประจำตัวประชาชนผู้เรียน',
      'citizen_id', 'id_card', 'identification_no', 'เลขบัตรประจำตัวประชาชน'
    ],
    studentId: [
      'เลขประจำตัวนักเรียน', 'รหัสนักเรียน', 'เลขประจำตัว', 'student_id', 'code'
    ],
    prefix: [
      'คำนำหน้า', 'คำนำหน้านาม', 'คำนำหน้าชื่อ', 'prefix', 'title'
    ],
    firstName: [
      'ชื่อ', 'ชื่อตัว', 'first_name', 'firstname'
    ],
    lastName: [
      'นามสกุล', 'ชื่อสกุล', 'last_name', 'lastname'
    ],
    fullName: [
      'ชื่อ-นามสกุล', 'ชื่อ - สกุล', 'ชื่อ-สกุล', 'ชื่อและนามสกุล', 'full_name', 'fullname', 'ชื่อสกุล'
    ],
    gender: [
      'เพศ', 'gender', 'sex'
    ],
    dob: [
      'วันเดือนปีเกิด', 'วันเกิด', 'วัน/เดือน/ปีเกิด', 'date_of_birth', 'birthdate', 'dob'
    ],
    disabilityType: [
      'ประเภทความพิการ', 'ความพิการ', 'ประเภทความพิการตามระบบ set', 'disability_type'
    ],
    address: [
      'ที่อยู่ตามทะเบียนบ้าน', 'ที่อยู่', 'บ้านเลขที่', 'address', 'full_address'
    ],
    moo: ['หมู่ที่', 'หมู่', 'moo'],
    subdistrict: ['ตำบล', 'แขวง', 'subdistrict', 'tambon'],
    district: ['อำเภอ', 'เขต', 'district', 'amphoe'],
    province: ['จังหวัด', 'province', 'changwat'],
    zipcode: ['รหัสไปรษณีย์', 'zipcode', 'postal_code']
  };

  /**
   * Normalize Thai Name for compound key matching:
   * Removes extra spaces and common prefixes (ด.ช., ด.ญ., นาย, นางสาว, etc.)
   */
  function normalizeThaiName(name) {
    if (!name) return '';
    let clean = name.toString().trim().replace(/\s+/g, ' ');
    // Remove common prefixes
    const prefixes = [
      /^เด็กชาย\s*/, /^เด็กหญิง\s*/, /^ด\.ช\.\s*/, /^ด\.ญ\.\s*/,
      /^นาย\s*/, /^นางสาว\s*/, /^นาง\s*/, /^น\.ส\.\s*/
    ];
    for (const p of prefixes) {
      if (p.test(clean)) {
        clean = clean.replace(p, '');
        break;
      }
    }
    return clean.replace(/\s+/g, '').trim();
  }

  /**
   * Clean Citizen ID:
   * Strips dashes/spaces, ensures 13 digits, preserves leading zeros.
   */
  function cleanCitizenId(val) {
    if (val === undefined || val === null) return '';
    let str = val.toString().trim().replace(/[-\s]/g, '');
    // If entered as number or formatted string
    if (/^\d{1,13}$/.test(str)) {
      str = str.padStart(13, '0');
    }
    return str;
  }

  /**
   * Validate Thai 13-digit Citizen ID checksum
   */
  function isValidCitizenId(idStr) {
    if (!idStr) return false;
    const str = idStr.toString().trim().replace(/[-\s]/g, '');
    // G-code support for non-Thai / undocumented students (e.g. G123456789012)
    if (/^[Gg]\d{12}$/.test(str)) {
      return true;
    }
    const clean = cleanCitizenId(str);
    if (!clean || clean.length !== 13 || !/^\d{13}$/.test(clean)) {
      return false;
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(clean.charAt(i), 10) * (13 - i);
    }
    const check = (11 - (sum % 11)) % 10;
    return check === parseInt(clean.charAt(12), 10);
  }

  /**
   * Escape HTML special characters to prevent HTML Injection and XSS
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Mask Citizen ID for privacy protection:
   * e.g. 1234567890123 -> 1-2345-xxxxx-23-4
   * Handles 13-digit Thai IDs, G-codes, and safely sanitizes malformed values without leaking raw HTML/XSS
   */
  function maskCitizenId(idStr) {
    if (idStr === undefined || idStr === null || idStr === '') return '-';
    const clean = cleanCitizenId(idStr);
    if (clean && clean.length === 13 && /^\d{13}$/.test(clean)) {
      return `${clean.substr(0, 1)}-${clean.substr(1, 4)}-xxxxx-${clean.substr(10, 2)}-${clean.substr(12, 1)}`;
    }
    // G-code support e.g. G123456789012
    if (/^[Gg]\d{12}$/.test(clean)) {
      return `${clean.substr(0, 3)}-xxxxx-${clean.substr(11, 2)}`;
    }
    // Malformed numeric string with some digits
    if (/^\d+$/.test(clean) && clean.length > 4) {
      return `${clean.substr(0, 2)}***${clean.substr(clean.length - 2)}`;
    }
    // Malformed or non-numeric string: return safe label
    return '(รูปแบบไม่ถูกต้อง)';
  }

  /**
   * Clean Student ID:
   * Preserves leading zeros.
   */
  function cleanStudentId(val) {
    if (val === undefined || val === null) return '';
    return val.toString().trim();
  }

  /**
   * Parse various date formats from Excel / SET to standardized B.E. (DD/MM/YYYY)
   */
  function parseDateBE(val) {
    if (val === undefined || val === null || val === '') return null;

    // 1. If it's an Excel serial date number
    if (typeof val === 'number') {
      // Excel serial date 1 = 1900-01-01 (accounting for leap year bug in Excel)
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + val * 86400000);
      const d = date.getUTCDate();
      const m = date.getUTCMonth() + 1;
      const yBE = date.getUTCFullYear() + 543;
      return {
        day: d,
        month: m,
        yearBE: yBE,
        formatted: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${yBE}`
      };
    }

    const str = val.toString().trim();

    // 2. Pattern DD/MM/YYYY or DD-MM-YYYY
    const slashMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
    if (slashMatch) {
      const d = parseInt(slashMatch[1], 10);
      const m = parseInt(slashMatch[2], 10);
      let y = parseInt(slashMatch[3], 10);
      // If year is Christian Era (e.g. 2010-2030), convert to BE
      if (y < 2400) {
        y += 543;
      }
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return {
          day: d,
          month: m,
          yearBE: y,
          formatted: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
        };
      }
    }

    // 3. Pattern YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})$/);
    if (isoMatch) {
      let y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10);
      const d = parseInt(isoMatch[3], 10);
      if (y < 2400) y += 543;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return {
          day: d,
          month: m,
          yearBE: y,
          formatted: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
        };
      }
    }

    // 4. Thai month text pattern: e.g. "10 พฤศจิกายน 2562" or "10 พ.ย. 2562"
    const thaiMonths = {
      'ม.ค.': 1, 'มกราคม': 1,
      'ก.พ.': 2, 'กุมภาพันธ์': 2,
      'มี.ค.': 3, 'มีนาคม': 3,
      'เม.ย.': 4, 'เมษายน': 4,
      'พ.ค.': 5, 'พฤษภาคม': 5,
      'มิ.ย.': 6, 'มิถุนายน': 6,
      'ก.ค.': 7, 'กรกฎาคม': 7,
      'ส.ค.': 8, 'สิงหาคม': 8,
      'ก.ย.': 9, 'กันยายน': 9,
      'ต.ค.': 10, 'ตุลาคม': 10,
      'พ.ย.': 11, 'พฤศจิกายน': 11,
      'ธ.ค.': 12, 'ธันวาคม': 12
    };

    for (const [mName, mNum] of Object.entries(thaiMonths)) {
      if (str.includes(mName)) {
        const parts = str.split(/\s+/);
        const d = parseInt(parts[0], 10);
        let y = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(d) && !isNaN(y)) {
          if (y < 2400) y += 543;
          return {
            day: d,
            month: mNum,
            yearBE: y,
            formatted: `${String(d).padStart(2, '0')}/${String(mNum).padStart(2, '0')}/${y}`
          };
        }
      }
    }

    return null;
  }

  /**
   * Calculate exact age in years & months from B.E. birthdate relative to reference date (or today)
   */
  function calculateAgeExact(dobBEStr, refDateBEStr) {
    const dob = parseDateBE(dobBEStr);
    if (!dob) return null;

    let refDay = 19, refMonth = 6, refYearBE = 2569;
    if (refDateBEStr) {
      const refParsed = parseDateBE(refDateBEStr);
      if (refParsed) {
        refDay = refParsed.day;
        refMonth = refParsed.month;
        refYearBE = refParsed.yearBE;
      }
    } else {
      const now = new Date();
      refDay = now.getDate();
      refMonth = now.getMonth() + 1;
      refYearBE = now.getFullYear() + 543;
    }

    let years = refYearBE - dob.yearBE;
    let months = refMonth - dob.month;
    let days = refDay - dob.day;

    if (days < 0) {
      months -= 1;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    if (years < 0) return { years: 0, months: 0, text: '0 ปี' };

    let text = `${years} ปี`;
    if (months > 0) {
      text += ` ${months} เดือน`;
    }
    return { years, months, text };
  }

  /**
   * Find column index/key by matching known aliases
   */
  /**
   * Find column index/key by matching known aliases
   * Uses two-pass matching (exact match first, then substring) with negative exclusions
   * to avoid mapping citizen ID columns as student ID when no student ID column exists.
   */
  function findColumnKey(headers, fieldAliases, excludeKeywords = []) {
    if (!headers || !headers.length) return null;
    const cleanHeaders = headers.map(h => h ? h.toString().trim().toLowerCase().replace(/[\s_\-]/g, '') : '');
    const cleanExcludes = excludeKeywords.map(e => e.toLowerCase().replace(/[\s_\-]/g, ''));
    
    // Pass 1: Exact match (ignoring whitespace and delimiters)
    for (const alias of fieldAliases) {
      const cleanAlias = alias.toLowerCase().replace(/[\s_\-]/g, '');
      const idx = cleanHeaders.findIndex(h => {
        if (!h) return false;
        if (cleanExcludes.some(ex => h.includes(ex))) return false;
        return h === cleanAlias;
      });
      if (idx !== -1) {
        return headers[idx];
      }
    }

    // Pass 2: Substring match (with exclusions and safeguards against generic terms)
    for (const alias of fieldAliases) {
      const cleanAlias = alias.toLowerCase().replace(/[\s_\-]/g, '');
      // Do not allow generic short/ambiguous aliases like 'code' or 'เลขประจำตัว' to loosely match via includes
      if (cleanAlias === 'code' || cleanAlias === 'เลขประจำตัว') continue;

      const idx = cleanHeaders.findIndex(h => {
        if (!h) return false;
        if (cleanExcludes.some(ex => h.includes(ex))) return false;
        return h.includes(cleanAlias);
      });
      if (idx !== -1) {
        return headers[idx];
      }
    }
    return null;
  }

  /**
   * Inspect and detect column mappings from file headers
   * Enforces strict separation between Citizen ID and Student ID columns
   */
  function detectColumns(headers) {
    const mapping = {};

    // Specific exclusion lists to prevent cross-contamination
    const fieldExcludes = {
      studentId: ['ประชาชน', 'citizen', 'idcard', 'id_card', 'บัตรประชาชน', 'ผู้เสียภาษี'],
      citizenId: ['นักเรียน', 'student']
    };

    // 1. Detect citizenId first
    const cidFound = findColumnKey(headers, COLUMN_ALIASES.citizenId, fieldExcludes.citizenId);
    if (cidFound) {
      mapping.citizenId = cidFound;
    }

    // 2. Detect studentId (ensuring it never re-maps citizenId column)
    const sidFound = findColumnKey(headers, COLUMN_ALIASES.studentId, fieldExcludes.studentId);
    if (sidFound && sidFound !== mapping.citizenId) {
      mapping.studentId = sidFound;
    }

    // 3. Detect other fields
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (key === 'citizenId' || key === 'studentId') continue;
      const found = findColumnKey(headers, aliases);
      if (found) {
        mapping[key] = found;
      }
    }
    return mapping;
  }

  /**
   * Validate headers for specific SET report types
   */
  function validateReportHeaders(reportType, headers) {
    const detected = detectColumns(headers);
    const errors = [];
    const warnings = [];

    if (reportType === 'general') {
      // Must have either citizenId or studentId, plus name and dob
      if (!detected.citizenId && !detected.studentId) {
        errors.push('ไม่พบคอลัมน์คีย์หลัก (เลขประจำตัวประชาชน หรือ เลขประจำตัวนักเรียน)');
      }
      if (!detected.fullName && (!detected.firstName || !detected.lastName)) {
        errors.push('ไม่พบคอลัมน์ชื่อ-นามสกุลนักเรียน');
      }
      if (!detected.dob) {
        warnings.push('ไม่พบคอลัมน์วันเดือนปีเกิด');
      }
      if (!detected.disabilityType) {
        warnings.push('ไม่พบคอลัมน์ประเภทความพิการตามระบบ SET');
      }
    } else if (reportType === 'address') {
      if (!detected.citizenId && !detected.studentId) {
        errors.push('ไม่พบคอลัมน์คีย์เชื่อมโยง (เลขประจำตัวประชาชน หรือ เลขประจำตัวนักเรียน)');
      }
      if (!detected.address && !detected.subdistrict) {
        errors.push('ไม่พบคอลัมน์ที่อยู่ตามทะเบียนบ้าน');
      }
    } else if (reportType === 'link') {
      if (!detected.citizenId || !detected.studentId) {
        errors.push('ไฟล์เชื่อมโยงต้องมีทั้งคอลัมน์เลขประจำตัวประชาชน และเลขประจำตัวนักเรียน');
      }
    }

    return {
      valid: errors.length === 0,
      detected,
      errors,
      warnings
    };
  }

  /**
   * Determine if Preview button can be enabled:
   * Requires:
   * 1. Join key (citizenId or studentId)
   * 2. Student name: either combined 'fullName' OR separate 'firstName' and 'lastName'
   * 3. No fatal header validation errors
   */
  function canEnablePreview(validation) {
    if (!validation) return false;
    const detected = validation.detected || validation;
    const hasKey = !!(detected.citizenId || detected.studentId);
    const hasName = !!(detected.fullName || (detected.firstName && detected.lastName));
    const hasNoFatalErrors = !validation.errors || validation.errors.length === 0;
    return hasKey && hasName && hasNoFatalErrors;
  }

  /**
   * Scan and locate the 0-indexed row number of the actual table header.
   * Handles sheets where the header is on row 0, as well as sheets with
   * title banners / empty lines spanning rows 0 to N.
   */
  function findHeaderRowIndex(rows2D) {
    if (!rows2D || !rows2D.length) return -1;
    const maxScan = Math.min(20, rows2D.length);
    for (let r = 0; r < maxScan; r++) {
      const row = rows2D[r];
      if (!row || !Array.isArray(row)) continue;
      const nonEmpties = row.map(c => String(c || '').trim()).filter(Boolean);
      if (nonEmpties.length < 2) continue; // Skip single-cell title banners or empty rows

      const detected = detectColumns(nonEmpties);
      const detectedCount = Object.keys(detected).length;

      const commonHeaders = ['ลำดับ', 'ระดับชั้น', 'ห้อง', 'คำนำหน้า', 'no', 'order'];
      const hasCommon = nonEmpties.some(c => commonHeaders.some(k => c.toLowerCase().includes(k)));

      // Header row must have at least one recognized column and either another column or common table header
      if (detectedCount >= 2 || (detectedCount >= 1 && (hasCommon || nonEmpties.length >= 3))) {
        return r;
      }
    }
    return -1;
  }

  /**
   * Parse rows from Excel raw sheet data.
   * Automatically detects the header row even when preceded by title banners.
   */
  function extractRowsFromSheet(sheet) {
    if (typeof XLSX === 'undefined') {
      throw new Error('ไม่พบไลบรารี SheetJS (XLSX) กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
    }
    // 1. Read sheet as 2D array of rows to find true header row
    const rows2D = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    if (!rows2D || rows2D.length === 0) {
      return [];
    }

    const headerIndex = findHeaderRowIndex(rows2D);
    if (headerIndex === -1) {
      throw new Error('ไม่พบแถวหัวตารางที่ถูกต้องในไฟล์ Excel ที่เลือก (กรุณาตรวจสอบว่ามีคอลัมน์สำคัญ เช่น เลขประจำตัวประชาชน เลขประจำตัวนักเรียน หรือชื่อ-นามสกุล)');
    }

    // 2. Read raw data retaining cell texts as formatted strings starting from detected header row
    const json = XLSX.utils.sheet_to_json(sheet, { range: headerIndex, raw: false, defval: '' });
    return json;
  }

  /**
   * Normalize an extracted SET student record
   */
  function normalizeSetGeneralRow(row, mapping) {
    const citizenId = cleanCitizenId(row[mapping.citizenId]);
    const studentId = cleanStudentId(row[mapping.studentId]);
    
    let prefix = mapping.prefix ? (row[mapping.prefix] || '').toString().trim() : '';
    let firstName = mapping.firstName ? (row[mapping.firstName] || '').toString().trim() : '';
    let lastName = mapping.lastName ? (row[mapping.lastName] || '').toString().trim() : '';
    let fullName = mapping.fullName ? (row[mapping.fullName] || '').toString().trim() : '';

    if (!fullName && firstName) {
      fullName = `${prefix} ${firstName} ${lastName}`.trim().replace(/\s+/g, ' ');
    } else if (fullName && !firstName) {
      // Split full name if needed
      const parts = fullName.replace(/\s+/g, ' ').split(' ');
      if (parts.length >= 2) {
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      }
    }

    const rawDob = mapping.dob ? row[mapping.dob] : '';
    const parsedDob = parseDateBE(rawDob);
    const dobFormatted = parsedDob ? parsedDob.formatted : '';
    const ageObj = dobFormatted ? calculateAgeExact(dobFormatted) : null;

    const disabilityType = mapping.disabilityType ? (row[mapping.disabilityType] || '').toString().trim() : '';
    const gender = mapping.gender ? (row[mapping.gender] || '').toString().trim() : '';

    return {
      citizenId,
      studentId,
      prefix,
      firstName,
      lastName,
      fullName,
      normalizedName: normalizeThaiName(fullName),
      dob: dobFormatted,
      age: ageObj ? ageObj.text : '',
      gender,
      disabilityTypeSet: disabilityType,
      rawRow: row
    };
  }

  /**
   * Normalize an extracted SET Address record
   */
  function normalizeSetAddressRow(row, mapping) {
    const citizenId = cleanCitizenId(row[mapping.citizenId]);
    const studentId = cleanStudentId(row[mapping.studentId]);

    let fullAddress = mapping.address ? (row[mapping.address] || '').toString().trim() : '';
    const moo = mapping.moo ? (row[mapping.moo] || '').toString().trim() : '';
    const subdistrict = mapping.subdistrict ? (row[mapping.subdistrict] || '').toString().trim() : '';
    const district = mapping.district ? (row[mapping.district] || '').toString().trim() : '';
    const province = mapping.province ? (row[mapping.province] || '').toString().trim() : '';
    const zipcode = mapping.zipcode ? (row[mapping.zipcode] || '').toString().trim() : '';

    if (!fullAddress && (subdistrict || district || province)) {
      const parts = [];
      if (moo) parts.push(`หมู่ ${moo}`);
      if (subdistrict) parts.push(`ต.${subdistrict}`);
      if (district) parts.push(`อ.${district}`);
      if (province) parts.push(`จ.${province}`);
      if (zipcode) parts.push(zipcode);
      fullAddress = parts.join(' ');
    }

    return {
      citizenId,
      studentId,
      fullAddress,
      subdistrict,
      district,
      province,
      zipcode,
      rawRow: row
    };
  }

  /**
   * Normalize an extracted SET Link table row (Report 3)
   * Resolves Thai headers like 'เลขประจำตัวนักเรียน' and 'เลขประจำตัวประชาชน'
   */
  function normalizeSetLinkRow(row, mapping = {}) {
    if (!row) return { citizenId: '', studentId: '', rawRow: row };
    const m = (mapping && Object.keys(mapping).length > 0) ? mapping : detectColumns(Object.keys(row));
    const citizenId = cleanCitizenId(m.citizenId ? row[m.citizenId] : (row.citizenId || ''));
    const studentId = cleanStudentId(m.studentId ? row[m.studentId] : (row.studentId || ''));
    return {
      citizenId,
      studentId,
      rawRow: row
    };
  }

  /**
   * Join multiple SET reports on verified keys (Citizen ID / Student ID)
   */
  function joinSetReports(generalRows, addressRows = [], linkRows = []) {
    const joined = [];
    const unmatched = [];
    const invalid = [];

    // Map address by citizenId and studentId
    const addressByCitizenId = new Map();
    const addressByStudentId = new Map();
    for (const addr of addressRows) {
      if (addr.citizenId) addressByCitizenId.set(addr.citizenId, addr);
      if (addr.studentId) addressByStudentId.set(addr.studentId, addr);
    }

    // Map link by studentId -> citizenId or vice versa (with Thai header normalization and bidirectional conflict rejection)
    // In a valid link table, studentId and citizenId must maintain a strict 1-to-1 bijection.
    // If a studentId maps to multiple citizenIds OR a citizenId maps to multiple studentIds,
    // the conflicting relationship must be rejected in BOTH directions.
    const cidsBySid = new Map();
    const sidsByCid = new Map();

    for (const rawLink of linkRows) {
      // Support both pre-normalized objects and raw Thai-header Excel rows
      const link = (rawLink.studentId !== undefined && rawLink.citizenId !== undefined && !rawLink['เลขประจำตัวนักเรียน']) 
        ? rawLink 
        : normalizeSetLinkRow(rawLink);

      const sid = cleanStudentId(link.studentId);
      const cid = cleanCitizenId(link.citizenId);

      if (sid && cid) {
        if (!cidsBySid.has(sid)) cidsBySid.set(sid, new Set());
        cidsBySid.get(sid).add(cid);

        if (!sidsByCid.has(cid)) sidsByCid.set(cid, new Set());
        sidsByCid.get(cid).add(sid);
      }
    }

    // Collect all contaminated/conflicting IDs in both directions
    const invalidSids = new Set();
    const invalidCids = new Set();

    // 1. Any studentId mapped to > 1 citizenId is a conflict; all associated citizenIds are also invalidated
    for (const [sid, cids] of cidsBySid.entries()) {
      if (cids.size > 1) {
        invalidSids.add(sid);
        for (const cid of cids) {
          invalidCids.add(cid);
        }
      }
    }

    // 2. Any citizenId mapped to > 1 studentId is a conflict; all associated studentIds are also invalidated
    for (const [cid, sids] of sidsByCid.entries()) {
      if (sids.size > 1) {
        invalidCids.add(cid);
        for (const sid of sids) {
          invalidSids.add(sid);
        }
      }
    }

    // Build clean 1-to-1 lookup maps only for uncompromised pairs
    const linkByStudentId = new Map();
    const linkByCitizenId = new Map();

    for (const [sid, cids] of cidsBySid.entries()) {
      if (!invalidSids.has(sid) && cids.size === 1) {
        const cid = Array.from(cids)[0];
        if (!invalidCids.has(cid)) {
          linkByStudentId.set(sid, cid);
        }
      }
    }

    for (const [cid, sids] of sidsByCid.entries()) {
      if (!invalidCids.has(cid) && sids.size === 1) {
        const sid = Array.from(sids)[0];
        if (!invalidSids.has(sid)) {
          linkByCitizenId.set(cid, sid);
        }
      }
    }

    const seenCitizenIds = new Set();
    const seenStudentIds = new Set();

    for (const gen of generalRows) {
      // Resolve IDs with link table if needed
      let citizenId = gen.citizenId;
      let studentId = gen.studentId;

      if (!citizenId && studentId && linkByStudentId.has(studentId)) {
        citizenId = linkByStudentId.get(studentId);
      }
      if (!studentId && citizenId && linkByCitizenId.has(citizenId)) {
        studentId = linkByCitizenId.get(citizenId);
      }

      // Check duplicates
      let isDuplicate = false;
      if (citizenId && seenCitizenIds.has(citizenId)) isDuplicate = true;
      if (studentId && seenStudentIds.has(studentId)) isDuplicate = true;

      if (citizenId) seenCitizenIds.add(citizenId);
      if (studentId) seenStudentIds.add(studentId);

      // Check validation errors
      const recordErrors = [];
      if (isDuplicate) {
        recordErrors.push('พบเลขประจำตัวซ้ำในชุดข้อมูล SET');
      }
      if (citizenId && !isValidCitizenId(citizenId)) {
        recordErrors.push('เลขประจำตัวประชาชนไม่ถูกต้องตามหลักตรวจสอบ (Checksum)');
      }
      if (!gen.fullName) {
        recordErrors.push('ไม่มีชื่อ-นามสกุลนักเรียน');
      }

      // Find matching address
      let matchedAddr = null;
      if (citizenId && addressByCitizenId.has(citizenId)) {
        matchedAddr = addressByCitizenId.get(citizenId);
      } else if (studentId && addressByStudentId.has(studentId)) {
        matchedAddr = addressByStudentId.get(studentId);
      }

      const mergedRecord = {
        citizenId: citizenId || '',
        studentId: studentId || '',
        prefix: gen.prefix,
        firstName: gen.firstName,
        lastName: gen.lastName,
        fullName: gen.fullName,
        normalizedName: gen.normalizedName,
        dob: gen.dob,
        age: gen.age,
        gender: gen.gender,
        disabilityTypeSet: gen.disabilityTypeSet,
        address: matchedAddr ? (matchedAddr.fullAddress || matchedAddr.address || '') : '',
        subdistrict: matchedAddr ? matchedAddr.subdistrict : '',
        district: matchedAddr ? matchedAddr.district : '',
        province: matchedAddr ? matchedAddr.province : '',
        zipcode: matchedAddr ? matchedAddr.zipcode : '',
        hasAddressReport: !!matchedAddr,
        errors: recordErrors
      };

      if (recordErrors.length > 0) {
        invalid.push(mergedRecord);
      } else {
        joined.push(mergedRecord);
      }
    }

    return {
      joined,
      invalid,
      unmatched
    };
  }

  /**
   * Compare SET data against currently loaded Google Sheets data
   * Uses Compound Key: Normalized Name + Date of Birth (DD/MM/YYYY)
   * 
   * Segregates into 6 buckets:
   * 1. newInSet: In SET but not in Google Sheets
   * 2. updatedDiff: In both but attributes differ
   * 3. matched: In both with identical values
   * 4. sheetsOnly: In Google Sheets but absent from SET
   * 5. unmatched: Join key missing or cannot resolve
   * 6. invalid: Validation / formatting failures
   */
  /**
   * Compare SET data against currently loaded Google Sheets data
   * 
   * Strict Identity Verification Rules:
   * 1. Compound Key (Normalized Name + DOB) is a HEURISTIC / PREDICTED match only, NOT a verified identity guarantee!
   * 2. If a shared unique identifier (Citizen ID or Student ID) exists on both sides -> 'verified'
   *    If only Name + DOB matches without shared unique ID -> 'predicted' (requires Admin confirmation)
   * 3. Collision / Conflict Protection:
   *    - Multiple students in Google Sheets with identical Name + DOB -> DO NOT auto-match (Flag as collision for Admin)
   *    - Multiple students in SET with identical Name + DOB -> DO NOT auto-match (Flag as collision for Admin)
   *    - Name matches but DOB differs (without shared unique ID) -> DO NOT auto-match (Flag as name/DOB conflict)
   * 
   * Segregates into 6 buckets:
   * 1. newInSet: In SET but not in Google Sheets
   * 2. updatedDiff: In both but attributes differ
   * 3. matched: In both with identical values
   * 4. sheetsOnly: In Google Sheets but absent from SET
   * 5. unmatched: Join key missing, collision, or ambiguous name/DOB conflicts
   * 6. invalid: Validation / formatting failures
   */
  function compareWithGoogleSheets(setJoinedRecords, sheetsStudents = [], referenceReportDate = '') {
    const newInSet = [];
    const updatedDiff = [];
    const matched = [];
    const sheetsOnly = [];
    const unmatched = [];
    const invalid = [];

    // 1. Index Google Sheets students by Compound Key and by Name as ARRAYS (to detect collisions)
    const sheetsByCompound = new Map(); // compKey -> [wrappedStudents]
    const sheetsByName = new Map();     // normName -> [wrappedStudents]
    const sheetsByCitizenId = new Map(); // cleanCid -> [wrappedStudents]
    const sheetsByStudentId = new Map(); // cleanSid -> [wrappedStudents]

    sheetsStudents.forEach((student, index) => {
      const normName = normalizeThaiName(student.name);
      const parsedDob = parseDateBE(student.dateOfBirth);
      const dobStr = parsedDob ? parsedDob.formatted : (student.dateOfBirth || '').trim();
      const compKey = `${normName}|${dobStr}`;

      const wrapped = {
        original: student,
        index,
        normName,
        dob: dobStr,
        matchedWithSet: false
      };

      if (!sheetsByCompound.has(compKey)) {
        sheetsByCompound.set(compKey, []);
      }
      sheetsByCompound.get(compKey).push(wrapped);

      if (!sheetsByName.has(normName)) {
        sheetsByName.set(normName, []);
      }
      sheetsByName.get(normName).push(wrapped);

      // Index unique IDs if Google Sheets has them (stored as arrays to detect duplicates)
      if (student.citizenId) {
        const cleanCid = cleanCitizenId(student.citizenId);
        if (cleanCid) {
          if (!sheetsByCitizenId.has(cleanCid)) {
            sheetsByCitizenId.set(cleanCid, []);
          }
          sheetsByCitizenId.get(cleanCid).push(wrapped);
        }
      }
      if (student.studentId) {
        const cleanSid = cleanStudentId(student.studentId);
        if (cleanSid) {
          if (!sheetsByStudentId.has(cleanSid)) {
            sheetsByStudentId.set(cleanSid, []);
          }
          sheetsByStudentId.get(cleanSid).push(wrapped);
        }
      }
    });

    // 2. Pre-scan SET records to detect collisions within SET itself
    const setCompoundCounts = new Map();
    const setStudentIdCounts = new Map();
    const setCitizenIdCounts = new Map();

    for (const setRec of setJoinedRecords) {
      if (setRec.normalizedName && setRec.dob) {
        const compKey = `${setRec.normalizedName}|${setRec.dob}`;
        setCompoundCounts.set(compKey, (setCompoundCounts.get(compKey) || 0) + 1);
      }
      if (setRec.studentId) {
        const cleanSid = cleanStudentId(setRec.studentId);
        if (cleanSid) {
          setStudentIdCounts.set(cleanSid, (setStudentIdCounts.get(cleanSid) || 0) + 1);
        }
      }
      if (setRec.citizenId) {
        const cleanCid = cleanCitizenId(setRec.citizenId);
        if (cleanCid) {
          setCitizenIdCounts.set(cleanCid, (setCitizenIdCounts.get(cleanCid) || 0) + 1);
        }
      }
    }

    let verifiedCount = 0;
    let predictedCount = 0;
    let conflictCount = 0;

    // 3. Match each SET record
    for (const setRec of setJoinedRecords) {
      if (setRec.errors && setRec.errors.length > 0) {
        invalid.push(setRec);
        continue;
      }

      if (!setRec.normalizedName) {
        unmatched.push({
          set: setRec,
          status: 'unmatched',
          conflictType: 'missing_name',
          description: 'ไม่สามารถระบุชื่อนักเรียนสำหรับจับคู่'
        });
        continue;
      }

      const compKey = `${setRec.normalizedName}|${setRec.dob}`;
      let matchedSheetWrapper = null;
      let matchConfidence = 'predicted'; // 'verified' or 'predicted'
      let matchConfidenceLabel = 'การจับคู่แบบคาดการณ์ (ชื่อและวันเกิดตรงกัน) รอ Admin ตรวจสอบ';

      // Path A1: Check if Citizen ID matches (National ID - Highest Certainty)
      if (setRec.citizenId && sheetsByCitizenId.has(setRec.citizenId)) {
        const cidMatches = sheetsByCitizenId.get(setRec.citizenId) || [];
        if (cidMatches.length > 1) {
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'collision_sheets_duplicate_citizenid',
            description: `พบเลขประจำตัวประชาชนซ้ำกัน ${cidMatches.length} คนในฐานข้อมูลชีตเดิม (ระงับการจับคู่ รอ Admin ตรวจสอบ)`,
            conflictCandidates: cidMatches.map(c => ({ name: c.original.name, dob: c.dob, rowNumber: c.original.rowNumber }))
          });
          continue;
        }

        if (setCitizenIdCounts.get(setRec.citizenId) > 1) {
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'collision_set_duplicate_citizenid',
            description: 'พบเลขประจำตัวประชาชนซ้ำกันหลายคนในข้อมูลนำเข้า SET (ระงับการจับคู่ รอ Admin ตรวจสอบ)'
          });
          continue;
        }

        const candidate = cidMatches[0];
        if (candidate.matchedWithSet) {
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'collision_already_matched',
            description: 'พบการจับคู่ซ้ำซ้อนกับนักเรียนในชีตเดิมที่ถูกจับคู่ไปแล้ว (รอ Admin ตรวจสอบ)'
          });
          continue;
        }

        const sheetStudent = candidate.original;
        const sheetSid = cleanStudentId(sheetStudent.studentId);
        const setSid = cleanStudentId(setRec.studentId);

        if (setSid && sheetSid && setSid !== sheetSid) {
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'identifier_conflict',
            description: `เลขประจำตัวนักเรียนขัดแย้งกัน (SET: ${setSid}, ชีตเดิม: ${sheetSid}) รอ Admin ตรวจสอบ`,
            conflictCandidate: {
              name: sheetStudent.name,
              dob: candidate.dob,
              studentId: sheetSid,
              rowNumber: sheetStudent.rowNumber
            }
          });
          continue;
        }

        matchedSheetWrapper = candidate;
        matchConfidence = 'verified';
        matchConfidenceLabel = 'การจับคู่ที่ยืนยันแล้ว (เลขประจำตัวประชาชนตรงกัน)';
      }
      // Path A2: Check if Student ID matches (Verified Match on SET Student ID)
      else if (setRec.studentId && sheetsByStudentId.has(setRec.studentId)) {
        const sidMatches = sheetsByStudentId.get(setRec.studentId) || [];
        if (sidMatches.length > 1) {
          // Requirement 10: Duplicate studentId in Google Sheets
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'collision_sheets_duplicate_studentid',
            description: `พบรหัสนักเรียน '${setRec.studentId}' ซ้ำกัน ${sidMatches.length} คนในฐานข้อมูลชีตเดิม (ระงับการจับคู่ รอ Admin ตรวจสอบ)`,
            conflictCandidates: sidMatches.map(c => ({ name: c.original.name, dob: c.dob, rowNumber: c.original.rowNumber }))
          });
          continue;
        }

        if (setStudentIdCounts.get(setRec.studentId) > 1) {
          // Requirement 10: Duplicate studentId in SET import
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'collision_set_duplicate_studentid',
            description: `พบรหัสนักเรียน '${setRec.studentId}' ซ้ำกันหลายคนในข้อมูลนำเข้า SET (ระงับการจับคู่ รอ Admin ตรวจสอบ)`
          });
          continue;
        }

        const candidate = sidMatches[0];
        if (candidate.matchedWithSet) {
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'collision_already_matched',
            description: `พบรหัสนักเรียน '${setRec.studentId}' จับคู่ซ้ำซ้อนกับนักเรียนในชีตเดิมที่ถูกจับคู่ไปแล้ว (รอ Admin ตรวจสอบ)`
          });
          continue;
        }

        const sheetStudent = candidate.original;
        const sheetCid = cleanCitizenId(sheetStudent.citizenId);
        const setCid = cleanCitizenId(setRec.citizenId);

        // Check if citizen IDs conflict
        if (setCid && sheetCid && setCid !== sheetCid) {
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'identifier_conflict',
            description: 'เลขประจำตัวประชาชนขัดแย้งกันระหว่างสองระบบ (ระงับการจับคู่ รอ Admin ตรวจสอบ)',
            conflictCandidate: {
              name: sheetStudent.name,
              dob: candidate.dob,
              citizenId: sheetCid,
              rowNumber: sheetStudent.rowNumber
            }
          });
          continue;
        }

        // Requirement 11: หากรหัสนักเรียนตรงกันแต่ชื่อหรือวันเกิดแตกต่าง ให้แสดงเป็นรายการขัดแย้งเพื่อให้ Admin ตรวจสอบ ห้ามแก้ข้อมูลอัตโนมัติ
        const nameDiffers = setRec.fullName && sheetStudent.name &&
          (normalizeThaiName(setRec.fullName) !== normalizeThaiName(sheetStudent.name));
        const dobDiffers = setRec.dob && candidate.dob && (setRec.dob !== candidate.dob);

        if (nameDiffers || dobDiffers) {
          conflictCount++;
          const conflictDetails = [];
          if (nameDiffers) conflictDetails.push(`ชื่อต่างกัน (SET: '${setRec.fullName}', ชีต: '${sheetStudent.name}')`);
          if (dobDiffers) conflictDetails.push(`วันเกิดต่างกัน (SET: '${setRec.dob}', ชีต: '${candidate.dob}')`);

          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'studentid_data_conflict',
            description: `รหัสนักเรียนตรงกัน (${setRec.studentId}) แต่ข้อมูลขัดแย้ง: ${conflictDetails.join(', ')} (ระงับการจับคู่อัตโนมัติ รอ Admin ตรวจสอบ)`,
            conflictCandidate: {
              name: sheetStudent.name,
              dob: candidate.dob,
              studentId: setRec.studentId,
              rowNumber: sheetStudent.rowNumber
            }
          });
          continue;
        }

        matchedSheetWrapper = candidate;
        matchConfidence = 'verified';
        matchConfidenceLabel = 'การจับคู่ที่ยืนยันแล้ว (รหัสนักเรียนตรงกัน)';
      }

      // Path B: If no verified unique ID match, use Compound Key (Normalized Name + DOB)
      if (!matchedSheetWrapper) {
        // Check for collision within SET (Duplicate student in SET export)
        if (setCompoundCounts.get(compKey) > 1) {
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'collision_set_duplicate',
            description: 'พบชื่อ-สกุล และวันเกิดซ้ำกันหลายคนในข้อมูล SET (ห้ามจับคู่อัตโนมัติ รอ Admin ตรวจสอบตัวบุคคล)'
          });
          continue;
        }

        // Check for collision in Google Sheets (Duplicate student in Sheets)
        const compMatches = sheetsByCompound.get(compKey) || [];
        if (compMatches.length > 1) {
          conflictCount++;
          unmatched.push({
            set: setRec,
            status: 'unmatched',
            conflictType: 'collision_sheets_duplicate',
            description: `พบชื่อ-สกุล และวันเกิดซ้ำกัน ${compMatches.length} คนในฐานข้อมูลเดิม (ห้ามจับคู่อัตโนมัติ รอ Admin ตรวจสอบตัวบุคคล)`
          });
          continue;
        }

        if (compMatches.length === 1) {
          const candidate = compMatches[0];
          if (candidate.matchedWithSet) {
            // Collision: This Google Sheets student was already matched by another SET student!
            conflictCount++;
            unmatched.push({
              set: setRec,
              status: 'unmatched',
              conflictType: 'collision_already_matched',
              description: 'พบการจับคู่ซ้ำซ้อนกับนักเรียนในชีตเดิมที่ถูกจับคู่ไปแล้ว (รอ Admin ตรวจสอบ)'
            });
            continue;
          }

          // Check for Identifier Conflict before accepting Compound Key match:
          // Requirement: หาก SET และ Google Sheets มีเลขประจำตัวชนิดเดียวกันแต่ค่าขัดแย้งกัน
          // ห้ามจับคู่ด้วยชื่อ+วันเกิดแทนโดยอัตโนมัติ ให้จัดเป็นรายการขัดแย้งรอ Admin ตรวจสอบ
          const sheetStudent = candidate.original;
          const sheetCid = cleanCitizenId(sheetStudent.citizenId);
          const sheetSid = cleanStudentId(sheetStudent.studentId);
          const setCid = cleanCitizenId(setRec.citizenId);
          const setSid = cleanStudentId(setRec.studentId);

          let idConflictMsg = '';
          if (setCid && sheetCid && setCid !== sheetCid) {
            // Zero-PII conflict description: do NOT embed raw 13-digit citizen IDs in free-text messages
            idConflictMsg = 'เลขประจำตัวประชาชนขัดแย้งกันระหว่างสองระบบ';
          } else if (setSid && sheetSid && setSid !== sheetSid) {
            idConflictMsg = `เลขประจำตัวนักเรียนขัดแย้งกัน (SET: ${setSid}, ชีตเดิม: ${sheetSid})`;
          }

          if (idConflictMsg) {
            conflictCount++;
            unmatched.push({
              set: setRec,
              status: 'unmatched',
              conflictType: 'identifier_conflict',
              description: `ชื่อและวันเกิดตรงกันแต่พบ${idConflictMsg} (ห้ามจับคู่อัตโนมัติ รอ Admin ตรวจสอบ)`,
              conflictCandidate: {
                name: sheetStudent.name,
                dob: candidate.dob,
                citizenId: sheetCid,
                studentId: sheetSid,
                rowNumber: sheetStudent.rowNumber
              }
            });
            continue;
          }

          // Unambiguous predicted match on Name + DOB
          matchedSheetWrapper = candidate;
          matchConfidence = 'predicted';
          matchConfidenceLabel = 'การจับคู่แบบคาดการณ์ (ชื่อและวันเกิดตรงกัน) รอ Admin ตรวจสอบ';
        } else {
          // No compound match. Check if name exists with different DOB!
          const nameCandidates = sheetsByName.get(setRec.normalizedName) || [];
          if (nameCandidates.length > 0) {
            // Collision / Conflict: Name matches but DOB differs without unique ID!
            // Strictly DO NOT auto-match! Flag as conflict for Admin review.
            conflictCount++;
            unmatched.push({
              set: setRec,
              status: 'unmatched',
              conflictType: 'name_dob_conflict',
              description: `พบชื่อตรงกันแต่ข้อมูลวันเกิดขัดแย้ง (${nameCandidates.length} คนในชีตเดิม: ${nameCandidates.map(c => c.dob).join(', ')}) รอ Admin ยืนยันว่าคนเดียวกันหรือคนละคน`,
              conflictCandidates: nameCandidates.map(c => ({ name: c.original.name, dob: c.dob, rowNumber: c.original.rowNumber }))
            });
            continue;
          }
        }
      }

      // If no match found at all -> New from SET
      if (!matchedSheetWrapper) {
        newInSet.push({
          set: setRec,
          status: 'new',
          description: 'นักเรียนใหม่ในระบบ SET (ยังไม่มีในระบบข้อมูลเดิม)'
        });
      } else {
        matchedSheetWrapper.matchedWithSet = true;
        const sheetStudent = matchedSheetWrapper.original;

        if (matchConfidence === 'verified') verifiedCount++;
        else predictedCount++;

        // Check for field differences (SET is primary source of truth for name, DOB, SET disability)
        const diffs = [];

        // Compare Name (flag diff only if normalized names differ)
        if (setRec.fullName && sheetStudent.name && normalizeThaiName(setRec.fullName) !== normalizeThaiName(sheetStudent.name)) {
          diffs.push({
            field: 'ชื่อ-นามสกุล',
            fieldKey: 'name',
            setVal: setRec.fullName.trim(),
            sheetVal: sheetStudent.name.trim()
          });
        }

        // Compare DOB
        if (setRec.dob && sheetStudent.dateOfBirth && setRec.dob !== matchedSheetWrapper.dob) {
          diffs.push({
            field: 'วันเกิด',
            fieldKey: 'dob',
            setVal: setRec.dob,
            sheetVal: sheetStudent.dateOfBirth
          });
        }

        // Separate Disability Data Sources (SET, Card, Screening are independent dimensions):
        // SET Disability is NOT a mutation of Card or Screening disability.
        // We preserve all sources and only flag an update if Google Sheets specifically tracks disabilityTypeSet and it changed.
        const sheetCardDis = sheetStudent.disabilityByCard || '';
        const sheetScreenDis = sheetStudent.disabilityByScreening || '';
        const sheetSetDis = sheetStudent.disabilityTypeSet || '';

        if (sheetSetDis && setRec.disabilityTypeSet && sheetSetDis.trim() !== setRec.disabilityTypeSet.trim()) {
          diffs.push({
            field: 'ประเภทความพิการตามระบบ SET',
            fieldKey: 'disabilityTypeSet',
            setVal: setRec.disabilityTypeSet,
            sheetVal: sheetSetDis
          });
        }

        // Attach multi-source disability context for Admin comparison without triggering false 'updatedDiff'
        setRec.disabilityComparison = {
          setDisability: setRec.disabilityTypeSet || 'ไม่ระบุ',
          cardDisability: sheetCardDis || 'ไม่ระบุ',
          screeningDisability: sheetScreenDis || 'ไม่ระบุ'
        };

        // Address comparison (only compare if Google Sheets has address column)
        if (sheetStudent.address && setRec.address && sheetStudent.address.trim() !== setRec.address.trim()) {
          diffs.push({
            field: 'ที่อยู่ตามทะเบียนบ้าน',
            fieldKey: 'address',
            setVal: setRec.address,
            sheetVal: sheetStudent.address
          });
        }

        if (diffs.length > 0) {
          updatedDiff.push({
            set: setRec,
            sheet: sheetStudent,
            diffs,
            status: 'updated',
            matchConfidence,
            matchConfidenceLabel,
            description: `พบข้อมูลแตกต่าง ${diffs.length} รายการ [${matchConfidenceLabel}]`
          });
        } else {
          matched.push({
            set: setRec,
            sheet: sheetStudent,
            status: 'matched',
            matchConfidence,
            matchConfidenceLabel,
            description: `ข้อมูลตรงกันทุกฟิลด์หลัก [${matchConfidenceLabel}]`
          });
        }
      }
    }

    // Identify Google Sheets students not found in SET (Requirement 2.3)
    sheetsStudents.forEach((student) => {
      const normName = normalizeThaiName(student.name);
      const parsedDob = parseDateBE(student.dateOfBirth);
      const dobStr = parsedDob ? parsedDob.formatted : (student.dateOfBirth || '').trim();
      const compKey = `${normName}|${dobStr}`;

      const wrappers = sheetsByCompound.get(compKey) || [];
      const wrapper = wrappers.find(w => w.original === student);
      if (wrapper && !wrapper.matchedWithSet) {
        sheetsOnly.push({
          sheet: student,
          status: 'sheets_only',
          description: 'มีเฉพาะใน Google Sheets แต่ไม่พบในทะเบียน SET (ต้องตรวจสอบและไม่แสดงต่อ Public)'
        });
      }
    });

    return {
      summary: {
        totalSet: setJoinedRecords.length,
        totalSheets: sheetsStudents.length,
        newCount: newInSet.length,
        updatedCount: updatedDiff.length,
        matchedCount: matched.length,
        sheetsOnlyCount: sheetsOnly.length,
        unmatchedCount: unmatched.length,
        invalidCount: invalid.length,
        verifiedCount,
        predictedCount,
        conflictCount
      },
      newInSet,
      updatedDiff,
      matched,
      sheetsOnly,
      unmatched,
      invalid
    };
  }

  /**
   * Generate Synthetic Anonymized Test Dataset for immediate testing (Zero real PII)
   */
  function generateMockTestDataset() {
    // Mock Students covering key verification cases:
    // 1. Matched (Predicted Match on Name + DOB, identical fields)
    // 2. Updated / Diff (Predicted Match on Name + DOB, disability differs)
    // 3. New in SET (Not present in sheets)
    // 4. Name/DOB Conflict (Name matches but DOB differs -> strictly NOT auto-matched)
    // 5. Invalid (Bad checksum & invalid date)
    const mockGeneral = [
      {
        'เลขประจำตัวประชาชน': '1509900123453',
        'เลขประจำตัวนักเรียน': '69001',
        'คำนำหน้า': 'เด็กชาย',
        'ชื่อ': 'สมมุติ',
        'นามสกุล': 'ทดสอบตรงกัน',
        'วันเดือนปีเกิด': '10/11/2562',
        'เพศ': 'ชาย',
        'ประเภทความพิการ': 'บกพร่องทางสติปัญญา'
      },
      {
        'เลขประจำตัวประชาชน': '1509900234565',
        'เลขประจำตัวนักเรียน': '69002',
        'คำนำหน้า': 'เด็กหญิง',
        'ชื่อ': 'วิไล',
        'นามสกุล': 'ข้อมูลเปลี่ยน',
        'วันเดือนปีเกิด': '01/05/2563', // Same DOB
        'เพศ': 'หญิง',
        'ประเภทความพิการ': 'ออทิสติก'
      },
      {
        'เลขประจำตัวประชาชน': '1509900345677',
        'เลขประจำตัวนักเรียน': '69003',
        'คำนำหน้า': 'เด็กชาย',
        'ชื่อ': 'มาใหม่',
        'นามสกุล': 'ทะเบียนเซ็ต',
        'วันเดือนปีเกิด': '01/01/2564', // New in SET
        'เพศ': 'ชาย',
        'ประเภทความพิการ': 'บกพร่องทางการได้ยิน'
      },
      {
        'เลขประจำตัวประชาชน': '1509900456789',
        'เลขประจำตัวนักเรียน': '69004',
        'คำนำหน้า': 'เด็กชาย',
        'ชื่อ': 'เอกชัย',
        'นามสกุล': 'วันเกิดขัดแย้ง',
        'วันเดือนปีเกิด': '20/08/2561', // Differs from Sheets (15/03/2561) -> Conflict
        'เพศ': 'ชาย',
        'ประเภทความพิการ': 'บกพร่องทางการเห็น'
      },
      {
        'เลขประจำตัวประชาชน': '9999999999999', // Invalid checksum
        'เลขประจำตัวนักเรียน': '69005',
        'คำนำหน้า': 'เด็กหญิง',
        'ชื่อ': 'ผิดพลาด',
        'นามสกุล': 'เลขบัตรผิด',
        'วันเดือนปีเกิด': '32/13/2562', // Invalid date
        'เพศ': 'หญิง',
        'ประเภทความพิการ': 'พิการซ้ำซ้อน'
      }
    ];

    const mockAddress = [
      {
        'เลขประจำตัวประชาชน': '1509900123453',
        'ที่อยู่ตามทะเบียนบ้าน': '123 หมู่ 4 ต.พิชัย อ.เมือง จ.ลำปาง 52000'
      },
      {
        'เลขประจำตัวประชาชน': '1509900234565',
        'ที่อยู่ตามทะเบียนบ้าน': '45/1 หมู่ 2 ต.บ่อแฮ้ว อ.เมือง จ.ลำปาง 52100'
      },
      {
        'เลขประจำตัวประชาชน': '1509900345677',
        'ที่อยู่ตามทะเบียนบ้าน': '88 หมู่ 1 ต.สบตุ๋ย อ.เมือง จ.ลำปาง 52100'
      }
    ];

    // Mock Google Sheets students to compare against
    const mockSheets = [
      {
        rowNumber: 3,
        name: 'เด็กชายสมมุติ ทดสอบตรงกัน',
        dateOfBirth: '10/11/2562',
        classroom: 'สงวนจันทร์',
        teacher: 'ครูทดสอบ หนึ่ง',
        disabilityByCard: 'บกพร่องทางสติปัญญา',
        disabilityByScreening: 'บกพร่องทางสติปัญญา'
      },
      {
        rowNumber: 4,
        name: 'เด็กหญิงวิไล ข้อมูลเปลี่ยน',
        dateOfBirth: '01/05/2563',
        classroom: 'สงวนจันทร์',
        teacher: 'ครูทดสอบ สอง',
        disabilityTypeSet: 'บกพร่องทางการได้ยิน', // Tracks previous SET disability in sheets (now updated to ออทิสติก)
        disabilityByCard: 'บกพร่องทางการเรียนรู้', // Independent Card disability
        disabilityByScreening: 'บกพร่องทางการเรียนรู้' // Independent Screening disability
      },
      {
        rowNumber: 5,
        name: 'เด็กชายเอกชัย วันเกิดขัดแย้ง',
        dateOfBirth: '15/03/2561', // Differs from SET (20/08/2561) -> Causes conflict
        classroom: 'ห้องบัวหลวง',
        teacher: 'ครูทดสอบ สาม',
        disabilityByCard: 'บกพร่องทางการเห็น',
        disabilityByScreening: 'บกพร่องทางการเห็น'
      },
      {
        rowNumber: 6,
        name: 'เด็กชายสุชาติ เฉพาะชีตเดิม',
        dateOfBirth: '12/12/2561',
        classroom: 'ห้องบัวหลวง',
        teacher: 'ครูทดสอบ สี่',
        disabilityByCard: 'บกพร่องทางร่างกาย',
        disabilityByScreening: 'บกพร่องทางร่างกาย'
      }
    ];

    return {
      mockGeneral,
      mockAddress,
      mockSheets
    };
  }

  return {
    escapeHtml,
    canEnablePreview,
    normalizeThaiName,
    cleanCitizenId,
    isValidCitizenId,
    maskCitizenId,
    cleanStudentId,
    parseDateBE,
    calculateAgeExact,
    detectColumns,
    validateReportHeaders,
    findHeaderRowIndex,
    extractRowsFromSheet,
    normalizeSetGeneralRow,
    normalizeSetAddressRow,
    normalizeSetLinkRow,
    joinSetReports,
    compareWithGoogleSheets,
    generateMockTestDataset,
    COLUMN_ALIASES
  };
}));
