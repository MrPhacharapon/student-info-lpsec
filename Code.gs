/**
 * Web Application for Student Information System (ปกศ 2569)
 * Built with Google Apps Script & Google Sheets
 */

// App configuration using PropertiesService with fallbacks
function getAppConfig() {
  try {
    const props = PropertiesService.getScriptProperties();
    let spreadsheetId = props.getProperty('APP_SPREADSHEET_ID');
    if (!spreadsheetId) {
      try {
        spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
      } catch (e) {
        spreadsheetId = '1Ryf-HxA4guPi63QpfbSAh_39GxOb3mL1ENMgI0pLtsI';
      }
    }
    const sheetName = props.getProperty('APP_SHEET_NAME') || 'มิ.ย.69 ล่าสุด';
    const reportDate = props.getProperty('APP_REPORT_DATE') || '';
    const columnOrder = props.getProperty('APP_COLUMN_ORDER') || 'name,classroom,teacher,serviceType,disabilityType,documents,birthday';
    
    return {
      spreadsheetId: spreadsheetId,
      sheetName: sheetName,
      reportDate: reportDate,
      columnOrder: columnOrder
    };
  } catch (err) {
    return {
      spreadsheetId: '1Ryf-HxA4guPi63QpfbSAh_39GxOb3mL1ENMgI0pLtsI',
      sheetName: 'มิ.ย.69 ล่าสุด',
      reportDate: ''
    };
  }
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
    let result = {};
    
    switch (action) {
      case 'createStudent':
        result = createStudent(payload);
        break;
      case 'updateStudent':
        result = updateStudent(payload);
        break;
      case 'deleteStudent':
        result = deleteStudent(payload.rowNumber, payload.studentName);
        break;
      case 'saveAppConfig':
        result = saveAppConfig(payload.spreadsheetId, payload.sheetName, payload.reportDate, payload.columnOrder);
        break;
      default:
        throw new Error("Unknown POST action: " + action);
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

/**
 * Helper to fetch the database sheet dynamically
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
    if (sheets[i].getSheetId().toString() === config.sheetName) {
      return sheets[i];
    }
  }
  
  // Default fallback: return GID 0 or GID 86711650
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() == 0 || sheets[i].getSheetId() == 86711650) {
      return sheets[i];
    }
  }
  
  if (sheets.length > 0) {
    return sheets[0];
  }
  
  throw new Error("ไม่พบแผ่นงานชีตฐานข้อมูลในโครงการชีตที่เชื่อมต่อ");
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
 * Prevents writes and incorrect column mapping if structure does not match expectations.
 */
function detectSheetLayout(sheet) {
  const lastCol = sheet.getLastColumn ? sheet.getLastColumn() : 17;
  const lastRow = sheet.getLastRow ? sheet.getLastRow() : 2;
  const maxCols = Math.max(lastCol, 17);
  const headerRows = Math.min(Math.max(lastRow, 1), 2);
  const headerRange = sheet.getRange(1, 1, headerRows, maxCols);
  const displayValues = headerRange.getDisplayValues();
  const row1 = displayValues[0] || [];
  const col1 = (row1[0] || '').toString().trim();
  const col2 = (row1[1] || '').toString().trim();

  // If Column A header contains 'เลขประจำตัว' or 'รหัส'
  if (/เลขประจำตัว|รหัส/i.test(col1)) {
    return {
      type: 'NEW_AQ',
      nameCol: 2,       // Column B (1-based)
      studentIdCol: 1,  // Column A (1-based)
      colCount: 17,
      isAq: true
    };
  }

  // If Column A header contains 'ชื่อ' (legacy format)
  if (/ชื่อ/i.test(col1)) {
    return {
      type: 'LEGACY_AP',
      nameCol: 1,       // Column A (1-based)
      studentIdCol: null,
      colCount: 16,
      isAq: false
    };
  }

  // Fallback: Check row 2 if row 1 is a merged title banner
  const row2 = displayValues[1] || [];
  const r2col1 = (row2[0] || '').toString().trim();
  if (/เลขประจำตัว|รหัส/i.test(r2col1)) {
    return {
      type: 'NEW_AQ',
      nameCol: 2,
      studentIdCol: 1,
      colCount: 17,
      isAq: true
    };
  }
  if (/ชื่อ/i.test(r2col1)) {
    return {
      type: 'LEGACY_AP',
      nameCol: 1,
      studentIdCol: null,
      colCount: 16,
      isAq: false
    };
  }

  return {
    type: 'UNKNOWN',
    nameCol: null,
    studentIdCol: null,
    colCount: 0,
    isAq: false
  };
}

/**
 * Read student records from sheet, skipping headers and summary rows
 * Supports both New A-Q layout (with studentId in Col A) and Legacy A-P layout.
 */
function getStudentData() {
  const sheet = getDbSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) {
    return [];
  }

  const layout = detectSheetLayout(sheet);
  if (layout.type === 'UNKNOWN') {
    throw new Error("โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย (ตรวจไม่พบหัวตารางที่ถูกต้อง) ระงับการอ่านข้อมูลเพื่อความปลอดภัย");
  }

  const students = [];

  if (layout.type === 'NEW_AQ') {
    // Read columns A to Q (17 columns)
    const values = sheet.getRange(3, 1, lastRow - 2, 17).getDisplayValues();

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const studentId = row[0] ? row[0].toString().trim() : "";
      const name = row[1] ? row[1].toString().trim() : "";

      // Skip empty lines, legends, footnotes, and summary/notes rows
      if (!name || name === "" || name.includes("ความพิการ") || name.indexOf("รวม") === 0 || name.startsWith("(") || name.indexOf("หมายเหตุ") === 0) {
        continue;
      }

      // rowNumber is i + 3 (since index starts at 0, data starts at row 3)
      students.push({
        rowNumber: 3 + i,
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
    // Legacy A-P: Read columns A to P (16 columns)
    const values = sheet.getRange(3, 1, lastRow - 2, 16).getDisplayValues();

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const name = row[0] ? row[0].toString().trim() : "";

      // Skip empty lines, legends, footnotes, and summary/notes rows
      if (!name || name === "" || name.includes("ความพิการ") || name.indexOf("รวม") === 0 || name.startsWith("(") || name.indexOf("หมายเหตุ") === 0) {
        continue;
      }

      students.push({
        rowNumber: 3 + i,
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
  if (lastRow < 3) return 3;

  const layout = detectSheetLayout(sheet);
  const nameCol = (layout && layout.nameCol) ? layout.nameCol : 2;

  const nameVals = sheet.getRange(1, nameCol, lastRow, 1).getValues();
  const col1Vals = (nameCol !== 1) ? sheet.getRange(1, 1, lastRow, 1).getValues() : nameVals;

  for (let r = 2; r < lastRow; r++) {
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
 * Dynamically uses layout.nameCol (Col B for New A-Q, Col A for Legacy A-P).
 */
function findRowByStudentName(sheet, name) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return -1;
  const layout = detectSheetLayout(sheet);
  if (layout.type === 'UNKNOWN') return -1;

  const nameCol = layout.nameCol;
  const names = sheet.getRange(3, nameCol, lastRow - 2, 1).getValues().map(r => r[0] ? r[0].toString().trim() : "");
  const index = names.indexOf(name.trim());
  if (index !== -1) {
    return index + 3; // data starts at row 3
  }
  return -1;
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
      const lastRow = sheet.getLastRow();
      if (lastRow >= 3) {
        const sidList = sheet.getRange(3, 1, lastRow - 2, 1).getValues().map(r => r[0] ? r[0].toString().trim() : "");
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
 * Protects against writing if column structure is unexpected.
 */
function createStudent(studentObj) {
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

  if (layout.type === 'NEW_AQ') {
    const rowValues = [
      rawSid, // Column A: studentId (safe blank string if unverified)
      studentObj.name.trim(),
      studentObj.classroom.trim(),
      studentObj.teacher.trim(),
      studentObj.serviceInCenter ? 1 : "",
      studentObj.serviceUnit ? 1 : "",
      studentObj.serviceAdjustHome ? 1 : "",
      studentObj.disabilityByCard.trim(),
      studentObj.disabilityByScreening.trim(),
      studentObj.hasDisabilityCard ? 1 : "",
      studentObj.hasDisabilityCert ? 1 : "",
      studentObj.hasEducationScreening ? 1 : "",
      studentObj.dateOfBirth.trim(),
      "", // age column (N) - write empty so sheet formulas can calculate it
      studentObj.disabledLater ? 1 : "",
      studentObj.nonThai ? 1 : "",
      studentObj.remarks ? studentObj.remarks.trim() : ""
    ];
    sheet.getRange(insertRow, 1, 1, 17).setValues([rowValues]);
  } else {
    // Legacy 16-column
    const rowValues = [
      studentObj.name.trim(),
      studentObj.classroom.trim(),
      studentObj.teacher.trim(),
      studentObj.serviceInCenter ? 1 : "",
      studentObj.serviceUnit ? 1 : "",
      studentObj.serviceAdjustHome ? 1 : "",
      studentObj.disabilityByCard.trim(),
      studentObj.disabilityByScreening.trim(),
      studentObj.hasDisabilityCard ? 1 : "",
      studentObj.hasDisabilityCert ? 1 : "",
      studentObj.hasEducationScreening ? 1 : "",
      studentObj.dateOfBirth.trim(),
      "", // age column (M)
      studentObj.disabledLater ? 1 : "",
      studentObj.nonThai ? 1 : "",
      studentObj.remarks ? studentObj.remarks.trim() : ""
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
 * UPDATE: Modify existing student record (with Self-Healing Row checks)
 * Crucial Guard: Existing Column A studentId is NEVER accidentally overwritten with blank.
 * Protects against writing if column structure is unexpected.
 */
function updateStudent(studentObj) {
  const sheet = getDbSheet();
  const layout = detectSheetLayout(sheet);

  if (layout.type === 'UNKNOWN') {
    throw new Error("โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย ระงับการอัปเดตข้อมูลเพื่อความปลอดภัย");
  }

  // 1. Validation
  validateStudentData(studentObj, true, sheet);

  let targetRow = studentObj.rowNumber;
  let nameInSheet = "";

  // Check if targetRow matches expectations (checking layout.nameCol)
  if (targetRow >= 3 && targetRow <= sheet.getLastRow()) {
    nameInSheet = sheet.getRange(targetRow, layout.nameCol).getValue().toString().trim();
  }

  // Self-healing: if index has shifted, look up the row using name
  if (nameInSheet !== studentObj.name.trim()) {
    targetRow = findRowByStudentName(sheet, studentObj.name);
    if (targetRow === -1) {
      throw new Error("ไม่พบชื่อนักเรียน '" + studentObj.name + "' ในชีต ระบบค้นหาแถวอัปเดตไม่สำเร็จ");
    }
  }

  if (layout.type === 'NEW_AQ') {
    // Preserve existing studentId in Column A if not explicitly provided or blank
    const existingColA = sheet.getRange(targetRow, 1).getValue();
    let finalStudentId = (existingColA !== undefined && existingColA !== null) ? existingColA.toString().trim() : "";

    // Only update studentId if a non-empty new studentId is explicitly passed
    if (studentObj.studentId !== undefined && studentObj.studentId !== null && studentObj.studentId.toString().trim() !== "") {
      finalStudentId = studentObj.studentId.toString().trim();
    }

    const rowValues = [
      finalStudentId, // Column A: preserved or verified update
      studentObj.name.trim(),
      studentObj.classroom.trim(),
      studentObj.teacher.trim(),
      studentObj.serviceInCenter ? 1 : "",
      studentObj.serviceUnit ? 1 : "",
      studentObj.serviceAdjustHome ? 1 : "",
      studentObj.disabilityByCard.trim(),
      studentObj.disabilityByScreening.trim(),
      studentObj.hasDisabilityCard ? 1 : "",
      studentObj.hasDisabilityCert ? 1 : "",
      studentObj.hasEducationScreening ? 1 : "",
      studentObj.dateOfBirth.trim(),
      "", // age column (N)
      studentObj.disabledLater ? 1 : "",
      studentObj.nonThai ? 1 : "",
      studentObj.remarks ? studentObj.remarks.trim() : ""
    ];

    sheet.getRange(targetRow, 1, 1, 17).setValues([rowValues]);
  } else {
    // Legacy 16-column
    const rowValues = [
      studentObj.name.trim(),
      studentObj.classroom.trim(),
      studentObj.teacher.trim(),
      studentObj.serviceInCenter ? 1 : "",
      studentObj.serviceUnit ? 1 : "",
      studentObj.serviceAdjustHome ? 1 : "",
      studentObj.disabilityByCard.trim(),
      studentObj.disabilityByScreening.trim(),
      studentObj.hasDisabilityCard ? 1 : "",
      studentObj.hasDisabilityCert ? 1 : "",
      studentObj.hasEducationScreening ? 1 : "",
      studentObj.dateOfBirth.trim(),
      "", // age column (M)
      studentObj.disabledLater ? 1 : "",
      studentObj.nonThai ? 1 : "",
      studentObj.remarks ? studentObj.remarks.trim() : ""
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
 * DELETE: Remove a student record (with Self-Healing Row checks)
 * Uses layout.nameCol and protects against writing if structure is unexpected.
 */
function deleteStudent(rowNumber, studentName) {
  const sheet = getDbSheet();
  const layout = detectSheetLayout(sheet);

  if (layout.type === 'UNKNOWN') {
    throw new Error("โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย ระงับการลบข้อมูลเพื่อความปลอดภัย");
  }

  let targetRow = rowNumber;
  let nameInSheet = "";

  // Verify name in target row using layout.nameCol
  if (targetRow >= 3 && targetRow <= sheet.getLastRow()) {
    nameInSheet = sheet.getRange(targetRow, layout.nameCol).getValue().toString().trim();
  }

  // Self-healing: lookup by name if shifted
  if (nameInSheet !== studentName.trim()) {
    targetRow = findRowByStudentName(sheet, studentName);
    if (targetRow === -1) {
      throw new Error("ไม่พบชื่อนักเรียน '" + studentName + "' ในชีต ไม่สามารถทำการลบได้");
    }
  }

  // Delete row
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
 */
function saveAppConfig(spreadsheetId, sheetName, reportDate, columnOrder) {
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty('APP_SPREADSHEET_ID', spreadsheetId.trim());
    props.setProperty('APP_SHEET_NAME', sheetName.trim());
    props.setProperty('APP_REPORT_DATE', reportDate.trim());
    if (columnOrder) {
      props.setProperty('APP_COLUMN_ORDER', columnOrder.trim());
    }
    return {
      success: true,
      message: "บันทึกการตั้งค่าระบบเรียบร้อยแล้ว"
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
    detectSheetLayout,
    getStudentData,
    findInsertionRow,
    findRowByStudentName,
    validateStudentData,
    createStudent,
    updateStudent,
    deleteStudent,
    isCheckboxChecked
  };
}
