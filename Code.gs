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
 * Safe bounded range reading: NEVER reads beyond actual sheet dimensions.
 * Header detection: Scans through multi-row title banners to identify the true table header row.
 * Prevents writes and incorrect column mapping if structure does not match expectations.
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
      dataStartRow: 3
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

      // Determine dataStartRow: check if the subsequent row is a sub-header (e.g. contains 'ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน')
      let dataStartRow = headerRow + 1;
      if (r + 1 < scanRows) {
        const nextRow = displayValues[r + 1] || [];
        const nextRowText = nextRow.join(' ');
        if (/ในศูนย์|หน่วยบริการ|ปรับบ้าน/i.test(nextRowText)) {
          dataStartRow = headerRow + 2;
        }
      }

      // Check if studentId column is detected before name column
      if (studentIdIdx !== -1 && studentIdIdx < nameIdx) {
        // NEW_AQ layout (Column A = studentId, Column B = name)
        return {
          type: 'NEW_AQ',
          nameCol: nameIdx + 1,           // 1-based (typically Col B = 2)
          studentIdCol: studentIdIdx + 1, // 1-based (typically Col A = 1)
          colCount: lastCol,
          isAq: true,
          headerRow: headerRow,
          dataStartRow: dataStartRow
        };
      } else if (nameIdx === 0 || (nameIdx === 1 && studentIdIdx === -1 && /ลำดับ/i.test(row[0] || ''))) {
        // LEGACY_AP layout (Column A = name, or Col A = order and Col B = name)
        return {
          type: 'LEGACY_AP',
          nameCol: nameIdx + 1,
          studentIdCol: null,
          colCount: lastCol,
          isAq: false,
          headerRow: headerRow,
          dataStartRow: dataStartRow
        };
      } else if (studentIdIdx !== -1) {
        // studentId found elsewhere
        return {
          type: 'NEW_AQ',
          nameCol: nameIdx + 1,
          studentIdCol: studentIdIdx + 1,
          colCount: lastCol,
          isAq: true,
          headerRow: headerRow,
          dataStartRow: dataStartRow
        };
      }
    }
  }

  return {
    type: 'UNKNOWN',
    nameCol: null,
    studentIdCol: null,
    colCount: lastCol,
    isAq: false,
    headerRow: -1,
    dataStartRow: 3
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
 * Formula preservation: copies formula in age column from the row above if present.
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

  const startRow = layout.dataStartRow || 3;
  const ageCol = (layout.type === 'NEW_AQ') ? 14 : 13;

  // Preserve formula from the row above if available
  let ageValue = "";
  if (insertRow > startRow) {
    const rowAboveCell = sheet.getRange(insertRow - 1, ageCol);
    const formulaAbove = rowAboveCell.getFormula ? rowAboveCell.getFormula() : "";
    if (formulaAbove && formulaAbove.trim().startsWith('=')) {
      ageValue = formulaAbove;
    }
  }

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
      ageValue, // age column (N) - preserves formula if present
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
      ageValue, // age column (M)
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
 * UPDATE: Modify existing student record (with Identity Check & Self-Healing Row checks)
 * Crucial Guard:
 * 1. Verifies student identity; halts if student name does not match target row.
 * 2. Existing Column A studentId is NEVER accidentally overwritten with blank.
 * 3. If incoming studentId CONFLICTS with existing studentId, halts update to prevent mismatch.
 * 4. Preserves existing formulas in the sheet (e.g. age calculation formula).
 * 5. Protects against writing if column structure is unexpected.
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
  let verifiedRow = -1;
  const startRow = layout.dataStartRow || 3;

  // Identity Check: Verify if targetRow currently holds the student with this exact name
  if (targetRow >= startRow && targetRow <= sheet.getLastRow()) {
    const nameAtRow = sheet.getRange(targetRow, layout.nameCol).getValue().toString().trim();
    if (nameAtRow === studentObj.name.trim()) {
      verifiedRow = targetRow;
    }
  }

  // Self-healing: if targetRow shifted or index moved, look up row using student name
  if (verifiedRow === -1) {
    const foundRow = findRowByStudentName(sheet, studentObj.name);
    if (foundRow !== -1) {
      verifiedRow = foundRow;
    } else {
      // Identity check failure: Cannot find student with this name!
      throw new Error("ไม่พบชื่อนักเรียน '" + studentObj.name + "' ในชีต ระบบค้นหาแถวอัปเดตไม่สำเร็จ ระงับการทำรายการเพื่อป้องกันการแก้ไขผิดคน");
    }
  }

  targetRow = verifiedRow;

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
      ageValue, // Column N: preserves existing formula or value
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
      ageValue, // Column M: preserves formula or value
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
 * DELETE: Remove a student record (with Identity Check & Self-Healing Row checks)
 * Uses layout.nameCol, verifies identity, and protects against writing if structure is unexpected.
 */
function deleteStudent(rowNumber, studentName) {
  const sheet = getDbSheet();
  const layout = detectSheetLayout(sheet);

  if (layout.type === 'UNKNOWN') {
    throw new Error("โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย ระงับการลบข้อมูลเพื่อความปลอดภัย");
  }

  const startRow = layout.dataStartRow || 3;
  let targetRow = rowNumber;
  let verifiedRow = -1;

  // 1. Verify name in target row using layout.nameCol
  if (targetRow >= startRow && targetRow <= sheet.getLastRow()) {
    const nameInSheet = sheet.getRange(targetRow, layout.nameCol).getValue().toString().trim();
    if (nameInSheet === studentName.trim()) {
      verifiedRow = targetRow;
    }
  }

  // 2. Self-healing: lookup by name if shifted
  if (verifiedRow === -1) {
    const foundRow = findRowByStudentName(sheet, studentName);
    if (foundRow !== -1) {
      verifiedRow = foundRow;
    } else {
      throw new Error("ไม่พบชื่อนักเรียน '" + studentName + "' ในชีต ไม่สามารถทำการลบได้ (ระงับการทำรายการเพื่อป้องกันการลบผิดคน)");
    }
  }

  // Delete row safely
  sheet.deleteRow(verifiedRow);

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
