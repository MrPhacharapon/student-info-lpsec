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
 * Read student records from sheet, skipping headers and summary rows
 */
function getStudentData() {
  const sheet = getDbSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) {
    return [];
  }
  
  // Read columns A to O (15 columns)
  const values = sheet.getRange(3, 1, lastRow - 2, 16).getDisplayValues();
  const students = [];
  
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const name = row[0].trim();
    
    // Skip empty lines, legends, footnotes, and summary/notes rows
    if (!name || name === "" || name.includes("ความพิการ") || name.indexOf("รวม") === 0 || name.startsWith("(") || name.indexOf("หมายเหตุ") === 0) {
      continue;
    }
    
    // rowNumber is i + 3 (since index starts at 0, data starts at row 3)
    students.push({
      rowNumber: 3 + i,
      name: name,
      classroom: row[1].trim(),
      teacher: row[2].trim(),
      serviceInCenter: isCheckboxChecked(row[3]),
      serviceUnit: isCheckboxChecked(row[4]),
      serviceAdjustHome: isCheckboxChecked(row[5]),
      disabilityByCard: row[6].trim(),
      disabilityByScreening: row[7].trim(),
      hasDisabilityCard: isCheckboxChecked(row[8]),
      hasDisabilityCert: isCheckboxChecked(row[9]),
      hasEducationScreening: isCheckboxChecked(row[10]),
      dateOfBirth: row[11].trim(), // B.E. Format e.g., "10/11/2562"
      age: row[12].trim(),         // New M Column: age string e.g., "6 ปี 7 เดือน"
      disabledLater: isCheckboxChecked(row[13]),
      nonThai: isCheckboxChecked(row[14]),
      remarks: row[15] ? row[15].trim() : ""
    });
  }
  return students;
}


/**
 * Find the row where we should insert new student data
 * This is the row right before the bottom summary/footer rows
 */
function findInsertionRow(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return 3;
  
  const colA = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (let r = 2; r < lastRow; r++) {
    const cellValue = colA[r][0].toString().trim();
    // End of student records reached (blank cell, footnotes, or summary rows)
    if (!cellValue || cellValue === "" || cellValue.includes("ความพิการ") || cellValue.indexOf("รวม") === 0 || cellValue.startsWith("(") || cellValue.indexOf("หมายเหตุ") === 0) {
      return r + 1; // 1-based index
    }
  }
  return lastRow + 1;
}

/**
 * Find row index of student by name (for self-healing row mapping)
 */
function findRowByStudentName(sheet, name) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return -1;
  const colA = sheet.getRange(3, 1, lastRow - 2, 1).getValues().map(r => r[0].toString().trim());
  const index = colA.indexOf(name.trim());
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
 */
function createStudent(studentObj) {
  const sheet = getDbSheet();
  
  // 1. Validation
  validateStudentData(studentObj, false, sheet);
  
  // 2. Insert row before footer/total rows
  const insertRow = findInsertionRow(sheet);
  sheet.insertRowBefore(insertRow);
  
  // 3. Prepare values array (1 represented as 1, otherwise blank)
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
    "", // age column (M) - write empty so sheet formulas can calculate it
    studentObj.disabledLater ? 1 : "",
    studentObj.nonThai ? 1 : "",
    studentObj.remarks ? studentObj.remarks.trim() : ""
  ];
  
  sheet.getRange(insertRow, 1, 1, 16).setValues([rowValues]);
  
  return {
    success: true,
    message: "บันทึกข้อมูลนักเรียนรายใหม่สำเร็จ",
    studentName: studentObj.name
  };
}

/**
 * UPDATE: Modify existing student record (with Self-Healing Row checks)
 */
function updateStudent(studentObj) {
  const sheet = getDbSheet();
  
  // 1. Validation
  validateStudentData(studentObj, true, sheet);
  
  let targetRow = studentObj.rowNumber;
  let nameInSheet = "";
  
  // Check if targetRow matches expectations
  if (targetRow >= 3 && targetRow <= sheet.getLastRow()) {
    nameInSheet = sheet.getRange(targetRow, 1).getValue().toString().trim();
  }
  
  // Self-healing: if index has shifted, look up the row using name
  if (nameInSheet !== studentObj.name.trim()) {
    targetRow = findRowByStudentName(sheet, studentObj.name);
    if (targetRow === -1) {
      throw new Error("ไม่พบชื่อนักเรียน '" + studentObj.name + "' ในชีต ระบบค้นหาแถวอัปเดตไม่สำเร็จ");
    }
  }
  
  // 2. Prepare values
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
    "", // age column (M) - write empty so sheet formulas can calculate it
    studentObj.disabledLater ? 1 : "",
    studentObj.nonThai ? 1 : "",
    studentObj.remarks ? studentObj.remarks.trim() : ""
  ];
  
  sheet.getRange(targetRow, 1, 1, 16).setValues([rowValues]);
  
  return {
    success: true,
    message: "อัปเดตข้อมูลนักเรียนสำเร็จ",
    studentName: studentObj.name
  };
}

/**
 * DELETE: Remove a student record (with Self-Healing Row checks)
 */
function deleteStudent(rowNumber, studentName) {
  const sheet = getDbSheet();
  
  let targetRow = rowNumber;
  let nameInSheet = "";
  
  // Verify name in target row
  if (targetRow >= 3 && targetRow <= sheet.getLastRow()) {
    nameInSheet = sheet.getRange(targetRow, 1).getValue().toString().trim();
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
