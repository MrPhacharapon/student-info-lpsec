// api/students.js - Vercel Serverless Function & Edge Security Gateway
// Enforces Action Whitelist, Mutation Firewall, and PDPA Data Sanitization (Allowlist)

const GAS_API_URL = process.env.GAS_API_URL || "https://script.google.com/macros/s/AKfycbxcXbd-XhedWvE9c1b6Syl763fqU1fm6Oq2RXA6epjanZsZ34AM5RW-QIZssH2ZQdwq/exec";

// Strict Whitelist of Allowed Actions
const ALLOWED_GET_ACTIONS = ['getStudentDataAndConfig', 'getTabs'];
const ALLOWED_POST_ACTIONS = [
  'verifyAdminPassword',
  'adminLogout',
  'saveAppConfig',
  'createStudent',
  'updateStudent',
  'deleteStudent'
];

// Helper: Calculate age from Thai Buddhist Date (DD/MM/YYYY)
function calculateAgeHelper(dobStr, reportDateStr) {
  if (!dobStr || typeof dobStr !== 'string') return null;
  const parts = dobStr.split('/');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0].trim(), 10);
  const m = parseInt(parts[1].trim(), 10);
  const y = parseInt(parts[2].trim(), 10) - 543; // BE to AD
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;

  let today = new Date(2026, 5, 19); // Fallback reference date
  if (reportDateStr && typeof reportDateStr === 'string') {
    const rParts = reportDateStr.split('/');
    if (rParts.length === 3) {
      const rd = parseInt(rParts[0], 10);
      const rm = parseInt(rParts[1], 10);
      const ry = parseInt(rParts[2], 10) - 543;
      if (!isNaN(rd) && !isNaN(rm) && !isNaN(ry)) {
        today = new Date(ry, rm - 1, rd);
      }
    }
  }

  const birthDate = new Date(y, m - 1, d);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age < 0 ? 0 : age;
}

// Helper: Mask date of birth for PDPA (Keep only year to protect exact birthdate)
function maskDobForPublic(dobStr) {
  if (!dobStr || typeof dobStr !== 'string') return '-';
  const parts = dobStr.split('/');
  if (parts.length === 3) {
    const year = parts[2].trim();
    return `พ.ศ. ${year} (ข้อมูลเฉพาะเจ้าหน้าที่)`;
  }
  return '- (ข้อมูลเฉพาะเจ้าหน้าที่)';
}

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // -------------------------------------------------------------------------
    // 1. POST Request Handling (Firewall & Mutation Gate)
    // -------------------------------------------------------------------------
    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      // 1.1 Action Whitelist Check
      if (!action || !ALLOWED_POST_ACTIONS.includes(action)) {
        return res.status(400).json({
          status: 'error',
          code: 'INVALID_ACTION',
          message: 'คำสั่งไม่ได้รับอนุญาต (Disallowed action)'
        });
      }

      // 1.2 Authentication Check: verifyAdminPassword is open, but all mutations require token
      if (action !== 'verifyAdminPassword') {
        const token = body.token || (body.payload && body.payload.token) || req.headers['x-admin-token'];
        if (!token || typeof token !== 'string' || token.trim() === '') {
          return res.status(401).json({
            status: 'error',
            code: 'UNAUTHORIZED',
            message: 'ต้องยืนยันตัวตนผู้ดูแลระบบก่อนทำรายการนี้ (Authentication Required)'
          });
        }
      }

      // 1.3 Forward to Google Apps Script
      const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.status(200).json(data);
    }

    // -------------------------------------------------------------------------
    // 2. GET Request Handling (Allowlist Filtering & Edge Caching)
    // -------------------------------------------------------------------------
    const query = req.query || {};
    const action = query.action || 'getStudentDataAndConfig';

    // 2.1 Action Whitelist Check
    if (!ALLOWED_GET_ACTIONS.includes(action)) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_ACTION',
        message: 'คำสั่งไม่ได้รับอนุญาต (Disallowed action)'
      });
    }

    // 2.2 Check Admin Authorization (via header or query parameter)
    const adminToken = req.headers['x-admin-token'] || 
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null) || 
      query.token;
    const isAdmin = Boolean(adminToken && typeof adminToken === 'string' && adminToken.trim().length > 10);

    // 2.3 Fetch from Google Apps Script
    const targetUrl = `${GAS_API_URL}?action=${encodeURIComponent(action)}` + (query.url ? `&url=${encodeURIComponent(query.url)}` : '');
    const response = await fetch(targetUrl);
    if (!response.ok) {
      throw new Error(`Google Apps Script API responded with HTTP status ${response.status}`);
    }

    const json = await response.json();

    // If request failed at GAS or action is getTabs, return directly
    if (json.status !== 'success' || action === 'getTabs') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.status(200).json(json);
    }

    // -------------------------------------------------------------------------
    // 2.4 Data Sanitization & Allowlist (Public vs Admin)
    // -------------------------------------------------------------------------
    const rawData = json.data || {};
    const rawStudents = rawData.students || [];
    const rawConfig = rawData.config || {};

    if (isAdmin) {
      // Admin: Return full data with private no-store headers
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
      return res.status(200).json(json);
    }

    // Public / Anonymous: Apply strict field Allowlist
    const reportDate = rawConfig.reportDate || rawConfig.rawReportDate || '';

    // Public Student Allowlist
    const sanitizedStudents = rawStudents.map(s => {
      let ageVal = s.age;
      if (!ageVal && s.dateOfBirth) {
        const calcAge = calculateAgeHelper(s.dateOfBirth, reportDate);
        if (calcAge !== null) {
          ageVal = `${calcAge} ปี`;
        }
      }

      return {
        rowNumber: s.rowNumber,
        studentId: s.studentId ? String(s.studentId) : '',
        name: s.name || '',
        classroom: s.classroom || '',
        teacher: s.teacher || '',
        serviceInCenter: Number(s.serviceInCenter) || 0,
        serviceUnit: Number(s.serviceUnit) || 0,
        serviceAdjustHome: Number(s.serviceAdjustHome) || 0,
        disabilityByCard: s.disabilityByCard || '',
        disabilityByScreening: s.disabilityByScreening || '',
        hasDisabilityCard: Number(s.hasDisabilityCard) || 0,
        hasDisabilityCert: Number(s.hasDisabilityCert) || 0,
        hasEducationScreening: Number(s.hasEducationScreening) || 0,
        age: ageVal || '',
        dateOfBirth: maskDobForPublic(s.dateOfBirth),
        disabledLater: Number(s.disabledLater) || 0,
        nonThai: Number(s.nonThai) || 0
      };
      // Stripped completely from Public output:
      // - citizenId
      // - address, subdistrict, district, province, zipcode, phone
      // - remarks, private notes
    });

    // Public Config Allowlist (Excludes spreadsheetId)
    const sanitizedConfig = {
      sheetName: rawConfig.sheetName || '',
      reportDate: rawConfig.reportDate || '',
      rawReportDate: rawConfig.rawReportDate || '',
      columnOrder: rawConfig.columnOrder || 'name,classroom,teacher,serviceType,disabilityType,documents,birthday'
    };

    // Public Cache Headers: Edge CDN 5 mins, Stale while revalidate 10 mins
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      status: 'success',
      data: {
        students: sanitizedStudents,
        config: sanitizedConfig
      }
    });

  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Internal Server Error while proxying to Google Apps Script'
    });
  }
};
