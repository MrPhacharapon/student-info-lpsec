/**
 * Comprehensive Unit Tests for Student Info LPSEC Phase 2
 * Tests Code.gs with in-memory MockSheet (No real Google Sheets writes, No Apps Script deployment)
 *
 * Verifies:
 * 1. Legacy Sheet (Exactly 16 columns) - Bounds guard ensures no out-of-bounds read
 * 2. New Sheet (17 columns A-Q) - Correct column mapping and leading zeros
 * 3. Multi-Row Title Banners - Header auto-detection & dynamic dataStartRow
 * 4. SET Student ID Conflict - Halts update if incoming ID contradicts existing ID
 * 5. Shifted Row Numbers - Self-healing identity verification finds moved student
 * 6. Wrong Person Protection - Rejects update/delete if student identity cannot be verified
 * 7. Formula Preservation - Age calculation formula is preserved during CRUD operations
 */

const assert = require('assert');

// Mock Sheet and SpreadsheetApp implementation
class MockRange {
  constructor(sheet, startRow, startCol, numRows, numCols) {
    this.sheet = sheet;
    this.startRow = startRow; // 1-based
    this.startCol = startCol; // 1-based
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getDisplayValues() {
    const grid = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      const rowIndex = (this.startRow - 1) + r;
      for (let c = 0; c < this.numCols; c++) {
        const colIndex = (this.startCol - 1) + c;
        const val = (this.sheet.data[rowIndex] && this.sheet.data[rowIndex][colIndex] !== undefined)
          ? this.sheet.data[rowIndex][colIndex]
          : "";
        row.push(val !== null ? val.toString() : "");
      }
      grid.push(row);
    }
    return grid;
  }

  getValues() {
    const grid = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      const rowIndex = (this.startRow - 1) + r;
      for (let c = 0; c < this.numCols; c++) {
        const colIndex = (this.startCol - 1) + c;
        const val = (this.sheet.data[rowIndex] && this.sheet.data[rowIndex][colIndex] !== undefined)
          ? this.sheet.data[rowIndex][colIndex]
          : "";
        row.push(val);
      }
      grid.push(row);
    }
    return grid;
  }

  getValue() {
    const rowIndex = this.startRow - 1;
    const colIndex = this.startCol - 1;
    return (this.sheet.data[rowIndex] && this.sheet.data[rowIndex][colIndex] !== undefined)
      ? this.sheet.data[rowIndex][colIndex]
      : "";
  }

  getFormula() {
    const rowIndex = this.startRow - 1;
    const colIndex = this.startCol - 1;
    return (this.sheet.formulas && this.sheet.formulas[rowIndex] && this.sheet.formulas[rowIndex][colIndex])
      ? this.sheet.formulas[rowIndex][colIndex]
      : "";
  }

  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const rowIndex = (this.startRow - 1) + r;
      if (!this.sheet.data[rowIndex]) {
        this.sheet.data[rowIndex] = [];
      }
      for (let c = 0; c < values[r].length; c++) {
        const colIndex = (this.startCol - 1) + c;
        const val = values[r][c];
        this.sheet.data[rowIndex][colIndex] = val;

        // If a formula is passed (starts with '='), record in formulas table
        if (typeof val === 'string' && val.startsWith('=')) {
          if (!this.sheet.formulas) this.sheet.formulas = [];
          if (!this.sheet.formulas[rowIndex]) this.sheet.formulas[rowIndex] = [];
          this.sheet.formulas[rowIndex][colIndex] = val;
        }
      }
    }
  }

  setValue(val) {
    const rowIndex = this.startRow - 1;
    const colIndex = this.startCol - 1;
    if (!this.sheet.data[rowIndex]) {
      this.sheet.data[rowIndex] = [];
    }
    this.sheet.data[rowIndex][colIndex] = val;
  }
}

class MockSheet {
  constructor(name, data, options = {}) {
    this.name = name;
    this.data = JSON.parse(JSON.stringify(data)); // Deep copy 2D array
    this.strictBounds = options.strictBounds !== undefined ? options.strictBounds : true;
    this.formulas = options.formulas ? JSON.parse(JSON.stringify(options.formulas)) : [];
  }

  getName() { return this.name; }
  getLastRow() { return this.data.length; }
  getLastColumn() {
    let max = 0;
    for (const row of this.data) {
      if (row.length > max) max = row.length;
    }
    return max;
  }

  getRange(startRow, startCol, numRows = 1, numCols = 1) {
    // Exact Google Sheets out-of-bounds simulation:
    // Throws exception if reading columns beyond actual sheet dimensions
    if (this.strictBounds && (startCol + numCols - 1 > this.getLastColumn())) {
      throw new Error(`Exception: The coordinates or dimensions of the range are invalid. (Requested max col: ${startCol + numCols - 1}, Sheet last col: ${this.getLastColumn()})`);
    }
    return new MockRange(this, startRow, startCol, numRows, numCols);
  }

  insertRowBefore(rowNumber) {
    const index = rowNumber - 1;
    this.data.splice(index, 0, new Array(this.getLastColumn()).fill(""));
    if (this.formulas.length > 0) {
      this.formulas.splice(index, 0, new Array(this.getLastColumn()).fill(""));
    }
  }

  deleteRow(rowNumber) {
    const index = rowNumber - 1;
    this.data.splice(index, 1);
    if (this.formulas.length > 0) {
      this.formulas.splice(index, 1);
    }
  }
}

// Global Google Apps Script mocks
let activeMockSheet = null;

global.SpreadsheetApp = {
  openById: () => ({
    getSheetByName: () => activeMockSheet,
    getSheets: () => [activeMockSheet]
  }),
  getActiveSpreadsheet: () => ({
    getId: () => "mock-id"
  })
};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => {
      if (k === 'APP_SPREADSHEET_ID') return 'mock-id';
      if (k === 'APP_SHEET_NAME') return 'mock-sheet';
      if (k === 'APP_REPORT_DATE') return '21/10/2569';
      if (k === 'ENABLE_WRITES') return 'true';
      return null;
    },
    setProperty: () => {},
    setProperties: () => {}
  })
};

global.ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput: (content) => ({
    content: content,
    getContent: () => content,
    setMimeType: function() { return this; }
  })
};

// Require Code.gs
const code = require('./Code.gs');

console.log('🧪 Starting Phase 2 Targeted Unit Tests (Commit 86c3e30 Audit Fixes)...\n');

// =========================================================================
// Case 1: Legacy Sheet (Exactly 16 Columns) & Bounds Guard
// =========================================================================
console.log('Case 1: Legacy Sheet (Exactly 16 Columns) - Bounds Guard Prevents Out-Of-Bounds Exception');
const legacy16Data = [
  ['ชื่อ-สกุล', 'ห้องเรียน', 'ครูผู้รับผิดชอบ', 'ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน', 'ตามบัตร', 'ตามคัดกรอง', 'บัตร', 'ใบรับรอง', 'คัดกรอง', 'วันเกิด', 'อายุ', 'พิการภายหลัง', 'ไม่ใช่ไทย', 'หมายเหตุ'],
  ['', '', '', 'ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน', '', '', '', '', '', '', '', '', '', ''],
  ['เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', '']
];
const mockSheetLegacy16 = new MockSheet('ต.ค.69_legacy', legacy16Data, { strictBounds: true });
assert.strictEqual(mockSheetLegacy16.getLastColumn(), 16, 'Sheet has strictly 16 columns');

// detectSheetLayout must NOT throw out-of-bounds error on 16-column sheet
const layoutLegacy16 = code.detectSheetLayout(mockSheetLegacy16);
assert.strictEqual(layoutLegacy16.type, 'LEGACY_AP');
assert.strictEqual(layoutLegacy16.nameCol, 1);
assert.strictEqual(layoutLegacy16.studentIdCol, null);
assert.strictEqual(layoutLegacy16.colCount, 16);

// getStudentData must read safely without attempting column 17
activeMockSheet = mockSheetLegacy16;
const legacyStudents = code.getStudentData();
assert.strictEqual(legacyStudents.length, 1);
assert.strictEqual(legacyStudents[0].name, 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ');
assert.strictEqual(legacyStudents[0].studentId, '');
console.log('  ✅ Passed Case 1: Legacy 16-column bounds guard test');

// =========================================================================
// Case 2: New Sheet (17 Columns A-Q) & Leading Zero Preservation
// =========================================================================
console.log('\nCase 2: New Sheet (17 Columns A-Q) - Full Column Mapping & Leading Zero Preservation');
const new17Data = [
  ['เลขประจำตัวนักเรียน', 'ชื่อ-สกุล', 'ห้องเรียน,หน่วยบริการ,ปรับบ้านฯ', 'ครูผู้รับผิดชอบ ภาคเรียนที่ 1 ปีการศึกษา 2569', 'ประเภทการรับบริการ', '', '', 'ประเภทความพิการตามบัตรประจำตัวคนพิการ', 'ประเภทความพิการตามแบบคัดกรองฯ', 'บัตรประจำตัวคนพิการ', 'เอกสารรับรองความพิการ', 'แบบคัดกรองทางการศึกษา', 'วันเดือนปีเกิด', 'อายุ', 'พิการภายหลัง', 'ไม่ใช่สัญชาติไทย', 'หมายเหตุ'],
  ['', '', '', '', 'ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน', '', '', '', '', '', '', '', '', '', ''],
  ['069001', 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', 'หมายเหตุพิเศษ'],
  ['', 'เด็กหญิงไร้รหัส ทะเบียนเดิม', 'มุ่งสู่ดวงดาว', 'นางสาวสุพัตรา นามวงค์', '', '1', '', 'ออทิสติก', 'ออทิสติก', '', '1', '', '01/01/2563', '6 ปี 9 เดือน', '', '', '']
];
const mockSheetNew17 = new MockSheet('พย69_new', new17Data, { strictBounds: true });
activeMockSheet = mockSheetNew17;

const layoutNew17 = code.detectSheetLayout(mockSheetNew17);
assert.strictEqual(layoutNew17.type, 'NEW_AQ');
assert.strictEqual(layoutNew17.studentIdCol, 1);
assert.strictEqual(layoutNew17.nameCol, 2);
assert.strictEqual(layoutNew17.colCount, 17);

const studentsNew17 = code.getStudentData();
assert.strictEqual(studentsNew17.length, 2);
assert.strictEqual(studentsNew17[0].studentId, '069001', 'Leading zero preserved as string');
assert.strictEqual(studentsNew17[0].name, 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ');
assert.strictEqual(studentsNew17[0].classroom, 'แสงตะวันฉาย');
assert.strictEqual(studentsNew17[0].teacher, 'นางสาวอรสา แข็งเขตการณ์');
assert.strictEqual(studentsNew17[0].serviceInCenter, 1);
assert.strictEqual(studentsNew17[0].remarks, 'หมายเหตุพิเศษ');
assert.strictEqual(studentsNew17[1].studentId, '', 'Blank studentId handled safely');
console.log('  ✅ Passed Case 2: New 17-column A-Q test');

// =========================================================================
// Case 3: Multi-Row Title Banners & Dynamic DataStartRow Detection
// =========================================================================
console.log('\nCase 3: Multi-Row Title Banners - Header Auto-Detection & Dynamic DataStartRow');
const multiRowData = [
  ['รายงานสารสนเทศนักเรียน ศูนย์การศึกษาพิเศษ ประจำจังหวัดลำปาง', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], // Row 1: Title Banner
  ['สังกัดสำนักบริหารงานการศึกษาพิเศษ ข้อมูล ณ วันที่ 4 พฤศจิกายน 2569', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], // Row 2: Subtitle
  ['เลขประจำตัวนักเรียน', 'ชื่อ-สกุล', 'ห้องเรียน', 'ครูผู้รับผิดชอบ', 'ประเภทบริการ', '', '', 'ความพิการบัตร', 'ความพิการคัดกรอง', 'บัตร', 'ใบรับรอง', 'คัดกรอง', 'วันเกิด', 'อายุ', 'พิการภายหลัง', 'ไม่ใช่ไทย', 'หมายเหตุ'], // Row 3: True Table Header!
  ['', '', '', '', 'ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน', '', '', '', '', '', '', '', '', '', ''], // Row 4: Subheader
  ['069010', 'เด็กชายธนาคาร มีแบนเนอร์', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', ''], // Row 5: First Student!
  ['', 'รวมทั้งหมด 1 คน', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''] // Row 6: Summary Footer
];
const mockSheetMultiRow = new MockSheet('พย69_multi', multiRowData, { strictBounds: true });
activeMockSheet = mockSheetMultiRow;

const layoutMultiRow = code.detectSheetLayout(mockSheetMultiRow);
assert.strictEqual(layoutMultiRow.type, 'NEW_AQ');
assert.strictEqual(layoutMultiRow.headerRow, 3, 'Must detect header at Row 3');
assert.strictEqual(layoutMultiRow.dataStartRow, 5, 'Must calculate dataStartRow as Row 5 (after subheader)');
assert.strictEqual(layoutMultiRow.studentIdCol, 1);
assert.strictEqual(layoutMultiRow.nameCol, 2);

const studentsMulti = code.getStudentData();
assert.strictEqual(studentsMulti.length, 1, 'Reads 1 student record, skips title banners and footer');
assert.strictEqual(studentsMulti[0].studentId, '069010');
assert.strictEqual(studentsMulti[0].name, 'เด็กชายธนาคาร มีแบนเนอร์');
assert.strictEqual(studentsMulti[0].rowNumber, 5, 'Row number must be 5');

const insertRowMulti = code.findInsertionRow(mockSheetMultiRow);
assert.strictEqual(insertRowMulti, 6, 'Insertion row must be Row 6 (before summary)');
console.log('  ✅ Passed Case 3: Multi-row title banner auto-detection test');

// =========================================================================
// Case 4: SET Student ID Conflict Protection (Strictly Halt on Contradiction)
// =========================================================================
console.log('\nCase 4: SET Student ID Conflict Protection (Halt on Contradiction)');
const conflictData = [
  ...new17Data.slice(0, 2),
  ['069001', 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', '']
];
const mockSheetConflict = new MockSheet('conflict_sheet', conflictData, { strictBounds: true });
activeMockSheet = mockSheetConflict;

// Case 4.1: Updating student with conflicting studentId must throw Error!
assert.throws(() => {
  code.updateStudent({
    rowNumber: 3,
    studentId: '069099', // Contradicts existing '069001'!
    name: 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ',
    classroom: 'แสงตะวันฉาย',
    teacher: 'นางสาวอรสา แข็งเขตการณ์',
    serviceInCenter: true,
    disabilityByCard: 'บกพร่องทางสติปัญญา',
    disabilityByScreening: 'บกพร่องทางสติปัญญา',
    hasDisabilityCard: true,
    dateOfBirth: '10/11/2562'
  });
}, /รหัสนักเรียนที่ส่งมา .* ขัดแย้งกับรหัสเดิมในฐานข้อมูล/, 'Must halt update when studentId contradicts existing ID');

// Case 4.2: Updating other fields without studentId must PRESERVE existing ID
const safeUpdateRes = code.updateStudent({
  rowNumber: 3,
  name: 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ',
  classroom: 'ห้องเรียนพัฒนาการใหม่',
  teacher: 'นางสาวอรสา แข็งเขตการณ์',
  serviceInCenter: true,
  disabilityByCard: 'บกพร่องทางสติปัญญา',
  disabilityByScreening: 'บกพร่องทางสติปัญญา',
  hasDisabilityCard: true,
  dateOfBirth: '10/11/2562'
  // studentId omitted / undefined
});
assert.strictEqual(safeUpdateRes.success, true);
assert.strictEqual(mockSheetConflict.data[2][0], '069001', 'Existing studentId must be strictly preserved');
assert.strictEqual(mockSheetConflict.data[2][2], 'ห้องเรียนพัฒนาการใหม่');
console.log('  ✅ Passed Case 4: Student ID conflict protection tests');

// =========================================================================
// Case 5: Shifted Row Numbers & Self-Healing Identity Check
// =========================================================================
console.log('\nCase 5: Shifted Row Numbers & Self-Healing Identity Check');
const shiftedData = [
  ...new17Data.slice(0, 2),
  ['069000', 'เด็กชายแทรกมาใหม่ หัวแถว', 'สงวนจันทร์', 'ครูหนึ่ง', '1', '', '', 'ออทิสติก', 'ออทิสติก', '1', '', '', '01/01/2562', '7 ปี', '', '', ''], // Row 3
  ['069001', 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', ''] // Row 4 (Shifted from 3 to 4)
];
const mockSheetShifted = new MockSheet('shifted_sheet', shiftedData, { strictBounds: true });
activeMockSheet = mockSheetShifted;

// Caller sends rowNumber: 3 (outdated index), but student is actually at Row 4!
const selfHealUpdate = code.updateStudent({
  rowNumber: 3, // Outdated! At Row 3 is 'เด็กชายแทรกมาใหม่'
  name: 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ', // Target is 'เด็กชายเย็นศิระ'
  classroom: 'แสงตะวันฉาย ปรับปรุง',
  teacher: 'นางสาวอรสา แข็งเขตการณ์',
  serviceInCenter: true,
  disabilityByCard: 'บกพร่องทางสติปัญญา',
  disabilityByScreening: 'บกพร่องทางสติปัญญา',
  hasDisabilityCard: true,
  dateOfBirth: '10/11/2562'
});
assert.strictEqual(selfHealUpdate.success, true);
// Row 3 ('เด็กชายแทรกมาใหม่') must NOT be touched!
assert.strictEqual(mockSheetShifted.data[2][1], 'เด็กชายแทรกมาใหม่ หัวแถว');
assert.strictEqual(mockSheetShifted.data[2][2], 'สงวนจันทร์');
// Row 4 ('เด็กชายเย็นศิระ') must be correctly updated!
assert.strictEqual(mockSheetShifted.data[3][1], 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ');
assert.strictEqual(mockSheetShifted.data[3][2], 'แสงตะวันฉาย ปรับปรุง');
console.log('  ✅ Passed Case 5: Shifted row self-healing identity check test');

// =========================================================================
// Case 6: Wrong Person Protection (Halt on Non-Existent or Mismatched Student)
// =========================================================================
console.log('\nCase 6: Wrong Person Protection (Halt on Non-Existent Student)');
// Attempting to update a non-existent student name
assert.throws(() => {
  code.updateStudent({
    rowNumber: 3,
    name: 'เด็กชายผี ไม่มีในชีต',
    classroom: 'ห้องไหน',
    teacher: 'ครูใคร',
    serviceInCenter: true,
    disabilityByCard: 'ไม่มี',
    disabilityByScreening: 'ไม่มี',
    hasDisabilityCard: true,
    dateOfBirth: '01/01/2562'
  });
}, /ไม่พบชื่อนักเรียน .* ในชีต .* ระงับการทำรายการเพื่อป้องกันการแก้ไขผิดคน/, 'Must reject update of non-existent student');

// Attempting to delete a non-existent student name
assert.throws(() => {
  code.deleteStudent(3, 'เด็กหญิงไม่มีตัวตน');
}, /ไม่พบชื่อนักเรียน.*ระงับการทำรายการเพื่อป้องกันการลบผิดคน/, 'Must reject delete of non-existent student');
console.log('  ✅ Passed Case 6: Wrong person protection test');

// =========================================================================
// Case 7: Formula Preservation in Sheet (Age Column Formula)
// =========================================================================
console.log('\nCase 7: Formula Preservation in Sheet (Age Column Formula)');
const formulaData = [
  ...new17Data.slice(0, 2),
  ['069001', 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', '']
];
const formulaTable = [
  [],
  [],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '=DATEDIF(M3,TODAY(),"Y")&" ปี"', '', '', ''] // Column N (index 13) has formula!
];
const mockSheetFormula = new MockSheet('formula_sheet', formulaData, { strictBounds: true, formulas: formulaTable });
activeMockSheet = mockSheetFormula;

// Update student: verify formula in Column N is NOT wiped out with empty string!
code.updateStudent({
  rowNumber: 3,
  name: 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ',
  classroom: 'ห้องแสงตะวันฉาย VIP',
  teacher: 'นางสาวอรสา แข็งเขตการณ์',
  serviceInCenter: true,
  disabilityByCard: 'บกพร่องทางสติปัญญา',
  disabilityByScreening: 'บกพร่องทางสติปัญญา',
  hasDisabilityCard: true,
  dateOfBirth: '10/11/2562'
});
const updatedCellFormula = mockSheetFormula.getRange(3, 14).getFormula();
assert.strictEqual(updatedCellFormula, '=DATEDIF(M3,TODAY(),"Y")&" ปี"', 'Formula in Column N must be strictly preserved');
console.log('  ✅ Passed Case 7: Formula preservation test');

// =========================================================================
// Case 8: createStudent() - Formula Row Reference Dynamic Adjustment
// =========================================================================
console.log('\nCase 8: createStudent() - Formula Row Reference Dynamic Adjustment');
const formulaDataForCreate = [
  ...new17Data.slice(0, 2),
  ['069001', 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', '']
];
const formulaTableForCreate = [
  [],
  [],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '=DATEDIF(M3,TODAY(),"Y")&" ปี "&DATEDIF(M3,$Z$1,"YM")&" เดือน"', '', '', '']
];
const mockSheetCreateFormula = new MockSheet('create_formula_sheet', formulaDataForCreate, { strictBounds: true, formulas: formulaTableForCreate });
activeMockSheet = mockSheetCreateFormula;

// Inserting new student at Row 4 (row above is Row 3, with formula referring to M3 and absolute $Z$1)
const createRes = code.createStudent({
  studentId: '069005',
  name: 'เด็กหญิงน้องใหม่ ไดนามิกสูตร',
  classroom: 'แสงตะวันฉาย',
  teacher: 'นางสาวอรสา แข็งเขตการณ์',
  serviceInCenter: true,
  disabilityByCard: 'ออทิสติก',
  disabilityByScreening: 'ออทิสติก',
  hasDisabilityCard: true,
  dateOfBirth: '15/05/2563'
});
assert.strictEqual(createRes.success, true);
const newRowFormula = mockSheetCreateFormula.getRange(4, 14).getFormula();
assert.strictEqual(
  newRowFormula,
  '=DATEDIF(M4,TODAY(),"Y")&" ปี "&DATEDIF(M4,$Z$1,"YM")&" เดือน"',
  'Age formula in new Row 4 must dynamically adjust M3 to M4 while preserving absolute $Z$1'
);

// Also verify Legacy sheet (Column L = DOB, Column M = Age)
const legacyDataForCreate = [
  ...legacy16Data.slice(0, 2),
  ['เด็กชายดั้งเดิม รักเรียน', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', '']
];
const legacyFormulaTable = [
  [],
  [],
  ['', '', '', '', '', '', '', '', '', '', '', '', '=DATEDIF(L3,TODAY(),"Y")&" ปี"', '', '', '']
];
const mockLegacyCreate = new MockSheet('legacy_create_sheet', legacyDataForCreate, { strictBounds: true, formulas: legacyFormulaTable });
activeMockSheet = mockLegacyCreate;

const legacyCreateRes = code.createStudent({
  name: 'เด็กหญิงน้องใหม่ เลกาซี',
  classroom: 'แสงตะวันฉาย',
  teacher: 'นางสาวอรสา แข็งเขตการณ์',
  serviceInCenter: true,
  disabilityByCard: 'ออทิสติก',
  disabilityByScreening: 'ออทิสติก',
  hasDisabilityCard: true,
  dateOfBirth: '15/05/2563'
});
assert.strictEqual(legacyCreateRes.success, true);
const legacyNewFormula = mockLegacyCreate.getRange(4, 13).getFormula();
assert.strictEqual(
  legacyNewFormula,
  '=DATEDIF(L4,TODAY(),"Y")&" ปี"',
  'Age formula in Legacy Row 4 must dynamically adjust L3 to L4'
);
console.log('  ✅ Passed Case 8: createStudent formula reference adjustment test');

// =========================================================================
// Case 9: Subheader Detection vs Classroom containing "หน่วยบริการ"
// =========================================================================
console.log('\nCase 9: Subheader Detection vs Classroom containing "หน่วยบริการ"');
// A sheet where there is NO subheader row, and the very first student row has classroom = 'หน่วยบริการเมืองลำปาง'
const sheetWithNoSubheader = [
  ['เลขประจำตัวนักเรียน', 'ชื่อ-สกุล', 'ห้องเรียน', 'ครูผู้รับผิดชอบ', 'ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน', 'ตามบัตร', 'ตามคัดกรอง', 'บัตร', 'ใบรับรอง', 'คัดกรอง', 'วันเกิด', 'อายุ', 'พิการภายหลัง', 'ไม่ใช่ไทย', 'หมายเหตุ'], // Row 1: Header
  ['069020', 'เด็กชายหนึ่ง หน่วยบริการ', 'หน่วยบริการเมืองลำปาง', 'ครูสมปอง', '', '1', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', ''] // Row 2: Student!
];
const mockNoSubheader = new MockSheet('no_subheader_sheet', sheetWithNoSubheader, { strictBounds: true });
activeMockSheet = mockNoSubheader;

const layoutNoSubheader = code.detectSheetLayout(mockNoSubheader);
assert.strictEqual(layoutNoSubheader.headerRow, 1, 'Header at Row 1');
assert.strictEqual(layoutNoSubheader.dataStartRow, 2, 'dataStartRow must be 2 (Row 2 is a student, NOT a subheader!)');

const studentsNoSubheader = code.getStudentData();
assert.strictEqual(studentsNoSubheader.length, 1, 'Student in Row 2 must NOT be skipped!');
assert.strictEqual(studentsNoSubheader[0].name, 'เด็กชายหนึ่ง หน่วยบริการ');
assert.strictEqual(studentsNoSubheader[0].classroom, 'หน่วยบริการเมืองลำปาง');
console.log('  ✅ Passed Case 9: True subheader detection test');

// =========================================================================
// Case 10: Reject Unsupported Column Layouts as UNKNOWN
// =========================================================================
console.log('\nCase 10: Reject Unsupported Column Layouts as UNKNOWN');
// Layout with Name at Column 4 (Col D) instead of Col A or B
const unsupportedLayoutData = [
  ['ลำดับ', 'รหัสประจำตัว', 'ห้องเรียน', 'ชื่อ-สกุล', 'ครู', 'ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน', 'บัตร', 'คัดกรอง', 'บัตร', 'ใบรับรอง', 'คัดกรอง', 'วันเกิด', 'อายุ', 'พิการ', 'หมายเหตุ'],
  ['1', '069001', 'ห้อง 1', 'เด็กชายผิดผัง คอลัมน์', 'ครู', '1', '', '', '', '', '', '', '', '01/01/2563', '6 ปี', '', '']
];
const mockUnsupported = new MockSheet('unsupported_sheet', unsupportedLayoutData, { strictBounds: true });
activeMockSheet = mockUnsupported;

const layoutUnsupported = code.detectSheetLayout(mockUnsupported);
assert.strictEqual(layoutUnsupported.type, 'UNKNOWN', 'Must reject unsupported layout as UNKNOWN');
assert.strictEqual(layoutUnsupported.reason, 'ผังคอลัมน์ไม่ตรงกับตำแหน่งที่ getStudentData() รองรับ');

// Verify getStudentData(), createStudent(), and updateStudent() reject writes on unsupported layout
assert.throws(() => {
  code.getStudentData();
}, /โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย/, 'Must reject getStudentData on unsupported layout');

assert.throws(() => {
  code.createStudent({
    name: 'เด็กชายพยายามเขียน',
    classroom: 'ห้อง 1',
    teacher: 'ครู',
    serviceInCenter: true,
    dateOfBirth: '01/01/2563'
  });
}, /โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย/, 'Must reject createStudent on unsupported layout');

assert.throws(() => {
  code.updateStudent({
    rowNumber: 2,
    name: 'เด็กชายผิดผัง คอลัมน์',
    classroom: 'ห้อง 1',
    teacher: 'ครู',
    serviceInCenter: true,
    dateOfBirth: '01/01/2563'
  });
}, /โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย/, 'Must reject updateStudent on unsupported layout');
console.log('  ✅ Passed Case 10: Unsupported layout rejection test');

// =========================================================================
// Case 11: Duplicate Names & Ambiguous Identity Protection
// =========================================================================
console.log('\nCase 11: Duplicate Names & Ambiguous Identity Protection');
const duplicateNameData = [
  ...new17Data.slice(0, 2),
  ['069011', 'เด็กชายสมชาย ใจดี', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', 'หมายเหตุแถว 3'], // Row 3
  ['069012', 'เด็กชายสมชาย ใจดี', 'มุ่งสู่ดวงดาว', 'นางสาวสุพัตรา นามวงค์', '', '1', '', 'ออทิสติก', 'ออทิสติก', '1', '', '', '01/05/2562', '7 ปี 5 เดือน', '', '', 'หมายเหตุแถว 4']  // Row 4 (Same Name!)
];
const mockDuplicateSheet = new MockSheet('duplicate_sheet', duplicateNameData, { strictBounds: true });
activeMockSheet = mockDuplicateSheet;

// 11.1 updateStudent without studentId must HALT immediately
assert.throws(() => {
  code.updateStudent({
    rowNumber: 3,
    name: 'เด็กชายสมชาย ใจดี',
    classroom: 'แก้ไขห้องเรียน',
    teacher: 'ครูทดสอบ',
    serviceInCenter: true,
    dateOfBirth: '10/11/2562'
    // studentId omitted!
  });
}, /พบชื่อนักเรียนซ้ำกัน 2 รายการ.*กรุณาระบุรหัสนักเรียน SET.*เพื่อยืนยันตัวตน/, 'Must halt update when student name is ambiguous and studentId is missing');

// 11.2 deleteStudent without studentId must HALT immediately
assert.throws(() => {
  code.deleteStudent(3, 'เด็กชายสมชาย ใจดี');
}, /พบชื่อนักเรียนซ้ำกัน 2 รายการ.*กรุณาระบุรหัสนักเรียน SET.*เพื่อยืนยันตัวตน/, 'Must halt delete when student name is ambiguous and studentId is missing');

// 11.3 updateStudent with unmatched studentId must HALT
assert.throws(() => {
  code.updateStudent({
    rowNumber: 3,
    studentId: '069099', // Non-matching ID!
    name: 'เด็กชายสมชาย ใจดี',
    classroom: 'แก้ไขห้องเรียน',
    teacher: 'ครูทดสอบ',
    serviceInCenter: true,
    dateOfBirth: '10/11/2562'
  });
}, /พบชื่อนักเรียนซ้ำกัน 2 รายการ.*แต่ไม่มีแถวใดตรงกับรหัสนักเรียน SET/, 'Must halt update when studentId does not match any duplicate candidate');

// 11.4 updateStudent with verified studentId '069012' must update Row 4 only
const updateResDup = code.updateStudent({
  rowNumber: 3, // Outdated reportedRow points to Row 3, but studentId '069012' targets Row 4!
  studentId: '069012',
  name: 'เด็กชายสมชาย ใจดี',
  classroom: 'มุ่งสู่ดวงดาว VIP',
  teacher: 'นางสาวสุพัตรา นามวงค์',
  serviceUnit: true,
  dateOfBirth: '01/05/2562'
});
assert.strictEqual(updateResDup.success, true);
// Row 3 must NOT be touched
assert.strictEqual(mockDuplicateSheet.data[2][0], '069011');
assert.strictEqual(mockDuplicateSheet.data[2][2], 'แสงตะวันฉาย');
// Row 4 must be updated
assert.strictEqual(mockDuplicateSheet.data[3][0], '069012');
assert.strictEqual(mockDuplicateSheet.data[3][2], 'มุ่งสู่ดวงดาว VIP');

// 11.5 deleteStudent with verified studentId '069011' must delete Row 3 safely
const deleteResDup = code.deleteStudent(99, 'เด็กชายสมชาย ใจดี', '069011');
assert.strictEqual(deleteResDup.success, true);
// Now only 1 student remains ('069012')
assert.strictEqual(mockDuplicateSheet.getLastRow(), 3); // 2 header rows + 1 remaining student
assert.strictEqual(mockDuplicateSheet.data[2][0], '069012');

// 11.6 Duplicate names in Legacy sheet (where no SET ID exists to disambiguate) must HALT
const legacyDupData = [
  ...legacy16Data.slice(0, 2),
  ['เด็กหญิงชื่อซ้ำ เลกาซี', 'แสงตะวันฉาย', 'ครูหนึ่ง', '1', '', '', '', '', '', '', '', '10/11/2562', '6 ปี', '', '', ''],
  ['เด็กหญิงชื่อซ้ำ เลกาซี', 'มุ่งสู่ดวงดาว', 'ครูสอง', '', '1', '', '', '', '', '', '', '01/01/2563', '6 ปี', '', '', '']
];
const mockLegacyDup = new MockSheet('legacy_dup_sheet', legacyDupData, { strictBounds: true });
activeMockSheet = mockLegacyDup;

assert.throws(() => {
  code.updateStudent({
    rowNumber: 3,
    name: 'เด็กหญิงชื่อซ้ำ เลกาซี',
    classroom: 'แก้ห้อง',
    teacher: 'ครู',
    serviceInCenter: true,
    dateOfBirth: '10/11/2562'
  });
}, /พบชื่อนักเรียนซ้ำกัน 2 รายการ.*และชีตไม่มีคอลัมน์รหัสนักเรียน SET/, 'Must halt update on Legacy duplicate names');
console.log('  ✅ Passed Case 11: Duplicate names and ambiguous identity protection test');

// =========================================================================
// Case 12: Staging Isolation & Strict Sheet Selection Guards
// =========================================================================
console.log('\nCase 12: Staging Isolation & Strict Sheet Selection Guards');
// 12.1: getAppConfig must throw when APP_SPREADSHEET_ID is missing (NEVER fallback to Production)
const originalProps = global.PropertiesService.getScriptProperties;
try {
  global.PropertiesService.getScriptProperties = () => ({
    getProperty: (k) => (k === 'APP_SPREADSHEET_ID' ? '' : 'mock-sheet')
  });
  assert.throws(() => {
    code.getAppConfig();
  }, /ไม่ได้กำหนดค่า APP_SPREADSHEET_ID.*ระงับการทำงานเพื่อความปลอดภัย/, 'Must halt when APP_SPREADSHEET_ID is missing without fallback to Production');

  // 12.2: getAppConfig must throw when APP_SHEET_NAME is missing
  global.PropertiesService.getScriptProperties = () => ({
    getProperty: (k) => (k === 'APP_SPREADSHEET_ID' ? 'staging-id' : '')
  });
  assert.throws(() => {
    code.getAppConfig();
  }, /ไม่ได้กำหนดค่า APP_SHEET_NAME.*ระงับการทำงานเพื่อความปลอดภัย/, 'Must halt when APP_SHEET_NAME is missing');

  // 12.3: getDbSheet must throw when sheetName cannot be found (NEVER fallback to GID 0 or first sheet)
  global.PropertiesService.getScriptProperties = () => ({
    getProperty: (k) => {
      if (k === 'APP_SPREADSHEET_ID') return 'staging-id';
      if (k === 'APP_SHEET_NAME') return 'แท็บที่ไม่มีจริง_404';
      return null;
    }
  });

  const dummySheet = new MockSheet('แผ่นงานอื่น_GID0', [['หัวตาราง']], { strictBounds: true });
  dummySheet.getSheetId = () => 0;

  global.SpreadsheetApp.openById = () => ({
    getSheetByName: (name) => (name === 'แผ่นงานอื่น_GID0' ? dummySheet : null),
    getSheets: () => [dummySheet]
  });

  assert.throws(() => {
    code.getDbSheet();
  }, /ไม่พบแผ่นงานชื่อ 'แท็บที่ไม่มีจริง_404'.*ไม่อนุญาตให้เลือกแผ่นงานแรกโดยอัตโนมัติ/, 'Must halt when sheetName not found without falling back to GID 0 or sheets[0]');

  console.log('  ✅ Passed Case 12: Staging isolation and strict sheet selection guard tests');
} finally {
  // Restore original mock
  global.PropertiesService.getScriptProperties = originalProps;
  global.SpreadsheetApp.openById = () => ({
    getSheetByName: () => activeMockSheet,
    getSheets: () => [activeMockSheet]
  });
}

// =========================================================================
// Case 13: Owner Decision — Option A Admin Authentication & Fail-Closed Guard Tests
// =========================================================================
console.log('\nCase 13: Owner Decision Option A Security & Fail-Closed Tests');

let dynamicScriptProps = {
  APP_SPREADSHEET_ID: 'mock-staging-id',
  APP_SHEET_NAME: 'mock-sheet',
  APP_REPORT_DATE: '21/10/2569',
  ENABLE_WRITES: 'true',
  TOKEN_SECRET: 'test-secret-key-32-bytes-minimum-length-random',
  TOKEN_EPOCH: '1'
};

const savedPropsCase13 = global.PropertiesService.getScriptProperties;
global.PropertiesService.getScriptProperties = () => ({
  getProperty: (k) => dynamicScriptProps[k] !== undefined ? dynamicScriptProps[k] : null,
  setProperty: (k, v) => { dynamicScriptProps[k] = String(v); },
  setProperties: (obj) => {
    for (const k in obj) {
      dynamicScriptProps[k] = String(obj[k]);
    }
  }
});

// Setup active sheet for mock writes
const case13SheetData = [
  ['รหัสนักเรียน SET', 'ชื่อ-สกุล', 'ห้องเรียน/หน่วยบริการ', 'ครูผู้รับผิดชอบ', 'รับบริการที่ศูนย์', 'รับบริการที่หน่วยบริการ', 'รับบริการที่บ้าน', 'ความพิการตามบัตร', 'ความพิการตามคัดกรอง', 'บัตรประจำตัวคนพิการ', 'ใบรับรองความพิการ', 'แบบคัดกรองทางการศึกษา', 'วัน/เดือน/ปีเกิด', 'อายุ', 'ไม่ใช่สัญชาติไทย', 'พิการภายหลัง', 'หมายเหตุ'],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['069001', 'เด็กชายทดสอบ ระบบความปลอดภัย', 'ห้องเรียน 1', 'ครูสมชาย', '1', '', '', 'บุคคลออทิสติก', 'บุคคลออทิสติก', '1', '1', '1', '01/01/2560', '=DATEDIF(M3,NOW(),"Y")', '', '', '-']
];
const case13Sheet = new MockSheet('mock-sheet', case13SheetData, { strictBounds: true });
activeMockSheet = case13Sheet;

try {
  // -----------------------------------------------------------------------
  // 13.1 Fail-closed ENABLE_WRITES
  // -----------------------------------------------------------------------
  dynamicScriptProps.ENABLE_WRITES = 'false';
  assert.throws(() => {
    code.checkWritesEnabled(global.PropertiesService.getScriptProperties());
  }, /ENABLE_WRITES != true/, 'Must block checkWritesEnabled when ENABLE_WRITES is false');

  assert.throws(() => {
    code.createStudent({ name: 'ทดสอบ' });
  }, /ENABLE_WRITES != true/, 'Must block createStudent when ENABLE_WRITES is false');

  assert.throws(() => {
    code.updateStudent({ rowNumber: 3, name: 'ทดสอบ' });
  }, /ENABLE_WRITES != true/, 'Must block updateStudent when ENABLE_WRITES is false');

  assert.throws(() => {
    code.deleteStudent(3, 'เด็กชายทดสอบ');
  }, /ENABLE_WRITES != true/, 'Must block deleteStudent when ENABLE_WRITES is false');

  const saveConfigBlocked = code.saveAppConfig('mock-sheet', '21/10/2569', 'name,classroom');
  assert.strictEqual(saveConfigBlocked.success, false);
  assert.match(saveConfigBlocked.message, /ENABLE_WRITES != true/, 'Must block saveAppConfig when ENABLE_WRITES is false');

  // Missing / empty ENABLE_WRITES
  delete dynamicScriptProps.ENABLE_WRITES;
  assert.throws(() => {
    code.checkWritesEnabled(global.PropertiesService.getScriptProperties());
  }, /ENABLE_WRITES != true/, 'Must fail-closed when ENABLE_WRITES is missing');

  // Re-enable writes strictly
  dynamicScriptProps.ENABLE_WRITES = 'true';
  assert.doesNotThrow(() => {
    code.checkWritesEnabled(global.PropertiesService.getScriptProperties());
  }, 'Must permit checkWritesEnabled when ENABLE_WRITES is strictly "true"');

  // -----------------------------------------------------------------------
  // 13.2 CSPRNG (No Math.random) & HMAC Secret Fallback Elimination
  // -----------------------------------------------------------------------
  // 13.2.1 CSPRNG verification
  const randomHex16 = code.generateRandomHex(16);
  assert.strictEqual(typeof randomHex16, 'string');
  assert.strictEqual(randomHex16.length, 32);
  assert.match(randomHex16, /^[0-9a-f]{32}$/);

  // Verify that Code.gs has ZERO usage of Math.random
  const fs = require('fs');
  const codeGsSource = fs.readFileSync('./Code.gs', 'utf8');
  assert.strictEqual(codeGsSource.includes('Math.random'), false, 'Code.gs MUST NOT contain Math.random()');

  // 13.2.2 HMAC Secret fallback elimination (Fail-closed on missing ADMIN_HMAC_SECRET)
  const savedHmacSecret = dynamicScriptProps.ADMIN_HMAC_SECRET || dynamicScriptProps.TOKEN_SECRET;
  delete dynamicScriptProps.ADMIN_HMAC_SECRET;
  delete dynamicScriptProps.TOKEN_SECRET;

  assert.throws(() => {
    code.generateAdminSessionToken(global.PropertiesService.getScriptProperties());
  }, (err) => err.code === 'AUTH_NOT_CONFIGURED', 'generateAdminSessionToken must throw AUTH_NOT_CONFIGURED when ADMIN_HMAC_SECRET is missing');

  assert.throws(() => {
    code.validateWriteAuth({ token: '12345.abcd.1.ef01' }, global.PropertiesService.getScriptProperties());
  }, (err) => err.code === 'AUTH_NOT_CONFIGURED', 'validateWriteAuth must throw AUTH_NOT_CONFIGURED when ADMIN_HMAC_SECRET is missing');

  // Restore secure HMAC Secret
  dynamicScriptProps.ADMIN_HMAC_SECRET = 'secure-random-hmac-secret-32bytes-hex-value';

  // -----------------------------------------------------------------------
  // 13.2.3 Constant-Time String Equality (Timing Attack Prevention)
  // -----------------------------------------------------------------------
  assert.strictEqual(code.constantTimeEquals('secret-token-abc', 'secret-token-abc'), true, 'Identical strings must return true');
  assert.strictEqual(code.constantTimeEquals('secret-token-abc', 'secret-token-abd'), false, 'Different content same length must return false');
  assert.strictEqual(code.constantTimeEquals('secret-token-abc', 'secret-token-ab'), false, 'Different length must return false');
  assert.strictEqual(code.constantTimeEquals('', ''), true, 'Empty strings must return true');
  assert.strictEqual(code.constantTimeEquals(null, 'abc'), false, 'null must return false');
  assert.strictEqual(code.constantTimeEquals('abc', undefined), false, 'undefined must return false');
  assert.strictEqual(code.constantTimeEquals(12345, '12345'), false, 'non-string must return false');

  // -----------------------------------------------------------------------
  // 13.2.4 UTF-8 Encoding, Byte Handling & Signed/Unsigned Normalization
  // -----------------------------------------------------------------------
  // Test strings: ASCII, Thai Unicode, complex characters, surrogate pairs, and unpaired surrogates
  const testUtf8Strings = [
    'password123',
    'รหัสผ่านภาษาไทย๑๒๓๔_ปกศลำปาง',
    'Mix_ภาษาไทย_and_English_2569!@#$',
    'Emoji test 🌍 🚀 ✨ \uD83D\uDE00',
    'unpaired_high_\uD800_end',
    'unpaired_low_\uDC00_end',
    '\uD800',
    '\uDC00',
    '\uD800\uD800',
    '\uDC00\uDC00',
    ''
  ];

  for (const s of testUtf8Strings) {
    const expectedBuf = Buffer.from(s, 'utf8');
    // Test stringToUtf8ByteArray
    const resBytes = code.stringToUtf8ByteArray(s);
    assert.strictEqual(Buffer.compare(Buffer.from(resBytes), expectedBuf), 0, `stringToUtf8ByteArray must match Buffer.from for: ${JSON.stringify(s)}`);

    // Test pure RFC 3629 encoder
    const pureBytes = code.utf8EncodePure(s);
    assert.strictEqual(Buffer.compare(Buffer.from(pureBytes), expectedBuf), 0, `utf8EncodePure must match Buffer.from for: ${JSON.stringify(s)}`);
  }

  // Unpaired High/Low surrogate explicit U+FFFD replacement verification
  const highSurrogateBytes = code.utf8EncodePure('\uD800');
  const lowSurrogateBytes = code.utf8EncodePure('\uDC00');
  const ufffdBytes = Buffer.from('\uFFFD', 'utf8'); // 0xEF, 0xBF, 0xBD
  assert.strictEqual(Buffer.compare(Buffer.from(highSurrogateBytes), ufffdBytes), 0, 'Unpaired high surrogate must be replaced with U+FFFD');
  assert.strictEqual(Buffer.compare(Buffer.from(lowSurrogateBytes), ufffdBytes), 0, 'Unpaired low surrogate must be replaced with U+FFFD');

  // Byte to hex normalization: signed vs unsigned byte arrays
  // In Java/GAS: signed byte -1 is 0xFF (255), -128 is 0x80 (128)
  const signedJavaBytes = [-128, -1, 0, 127];
  const unsignedBytes = new Uint8Array([128, 255, 0, 127]);
  assert.strictEqual(code.bytesToHex(signedJavaBytes), '80ff007f', 'bytesToHex must correctly normalize signed Java bytes to hex');
  assert.strictEqual(code.bytesToHex(unsignedBytes), '80ff007f', 'bytesToHex must correctly format Uint8Array to hex');

  // Test stringToUtf8ByteArray when simulated in Google Apps Script with Utilities.newBlob
  const savedGlobalUtilities = global.Utilities;
  try {
    global.Utilities = {
      newBlob(str) {
        return {
          getBytes() {
            // Simulate Java signed byte[] array where values >= 128 are negative (-128 to -1)
            const buf = Buffer.from(str, 'utf8');
            return Array.from(buf, b => (b >= 128 ? b - 256 : b));
          }
        };
      }
    };
    const thaiTest = 'รหัสผ่าน_Thai_2569';
    const gasSimBytes = code.stringToUtf8ByteArray(thaiTest);
    assert.ok(gasSimBytes instanceof Uint8Array, 'Must return Uint8Array');
    assert.strictEqual(Buffer.compare(Buffer.from(gasSimBytes), Buffer.from(thaiTest, 'utf8')), 0, 'GAS Utilities.newBlob signed bytes must be normalized to unsigned Uint8Array');
  } finally {
    global.Utilities = savedGlobalUtilities;
  }

  // -----------------------------------------------------------------------
  // 13.2.5 PBKDF2-HMAC-SHA256 Known-Answer Test Vectors & Pure JS Engine Verification
  // -----------------------------------------------------------------------
  // Reference: PBKDF2-HMAC-SHA256 Known-Answer Test Vectors (IETF draft-josefsson-pbkdf2-test-vectors / Christian Winnerlein)
  // Note: RFC 6070 standardizes HMAC-SHA1 vectors; the test vectors below test HMAC-SHA256 per standard KAT suites.
  // Vector 1: Iterations = 1
  const rfcSalt1 = code.hexToBytes('73616c74'); // "salt"
  const rfcResult1 = code.pbkdf2HmacSha256Pure('password', rfcSalt1, 1);
  assert.strictEqual(rfcResult1, '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b', 'Must match PBKDF2-HMAC-SHA256 KAT iteration=1 vector');

  // Vector 2: Iterations = 2
  const rfcResult2 = code.pbkdf2HmacSha256Pure('password', rfcSalt1, 2);
  assert.strictEqual(rfcResult2, 'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43', 'Must match PBKDF2-HMAC-SHA256 KAT iteration=2 vector');

  // Vector 3: Iterations = 4096
  const rfcResult4096 = code.pbkdf2HmacSha256Pure('password', rfcSalt1, 4096);
  assert.strictEqual(rfcResult4096, 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a', 'Must match PBKDF2-HMAC-SHA256 KAT iteration=4096 vector');

  // Thai Password PBKDF2 cross-validation: Pure JS vs Node.js crypto.pbkdf2Sync
  const thaiPass = 'รหัสผ่านครูลำปาง_2569_ปลอดภัย';
  const thaiSalt = code.hexToBytes('a1b2c3d4e5f6789012345678abcdef01');
  const pureThaiHash = code.pbkdf2HmacSha256Pure(thaiPass, thaiSalt, 1000);
  const crypto = require('crypto');
  const nodeThaiHash = crypto.pbkdf2Sync(thaiPass, Buffer.from('a1b2c3d4e5f6789012345678abcdef01', 'hex'), 1000, 32, 'sha256').toString('hex');
  assert.strictEqual(pureThaiHash, nodeThaiHash, 'Pure JS PBKDF2 hash of Thai password must match Node.js crypto.pbkdf2Sync byte-for-byte');

  // 13.2.6 Isolated GAS V8 Sandbox Verification (No TextEncoder, No Node crypto)
  // Ensures pbkdf2HmacSha256Pure runs without ReferenceError: TextEncoder is not defined
  const vm = require('vm');
  const isolatedSandbox = {
    console,
    Math,
    Date,
    Uint8Array,
    Int32Array,
    DataView,
    Array,
    String,
    Number,
    parseInt
  };
  vm.createContext(isolatedSandbox);
  const codeGsRaw = fs.readFileSync('./Code.gs', 'utf8');
  vm.runInContext(codeGsRaw, isolatedSandbox);
  assert.strictEqual(typeof isolatedSandbox.TextEncoder, 'undefined', 'TextEncoder must be undefined in isolated sandbox');
  assert.strictEqual(typeof isolatedSandbox.crypto, 'undefined', 'crypto must be undefined in isolated sandbox');
  const isolatedResult = isolatedSandbox.pbkdf2HmacSha256Pure('password', isolatedSandbox.hexToBytes('73616c74'), 10);
  assert.strictEqual(typeof isolatedResult, 'string', 'pbkdf2HmacSha256Pure must succeed in isolated GAS V8 sandbox without TextEncoder');
  assert.strictEqual(isolatedResult.length, 64, 'Output must be 64-character hex');

  // -----------------------------------------------------------------------
  // 13.3 PBKDF2 Adaptive Hashing & Security Bounds
  // -----------------------------------------------------------------------
  const testPassword = 'CorrectAdminPassword@2026';

  // Subtest: Reject sub-standard iterations (< 600,000 per project OWASP policy)
  assert.throws(() => {
    code.setupAdminPassword(testPassword, 10000);
  }, (err) => err.code === 'INSUFFICIENT_ITERATIONS', 'Must reject 10,000 iterations as INSUFFICIENT_ITERATIONS');

  assert.throws(() => {
    code.setupAdminPassword(testPassword, 50000);
  }, (err) => err.code === 'INSUFFICIENT_ITERATIONS', 'Must reject 50,000 iterations as INSUFFICIENT_ITERATIONS');

  assert.throws(() => {
    code.setupAdminPassword(testPassword, 210000);
  }, (err) => err.code === 'INSUFFICIENT_ITERATIONS', 'Must reject 210,000 iterations as INSUFFICIENT_ITERATIONS');

  // Setup with OWASP Standard (600,000 iterations)
  code.setupAdminPassword(testPassword, 600000);
  assert.ok(dynamicScriptProps.ADMIN_PASSWORD_PBKDF2.startsWith('pbkdf2_sha256$600000$'), 'ADMIN_PASSWORD_PBKDF2 must be formatted correctly with 600,000 iters');

  // Measure verification time with 600,000 iterations
  const t0 = Date.now();
  const loginSuccess = code.handleAdminLogin({ password: testPassword });
  const pbkdf2Duration600k = Date.now() - t0;
  console.log(`    ⏱️ Measured PBKDF2 verification time (600,000 iterations): ${pbkdf2Duration600k}ms`);
  assert.strictEqual(loginSuccess.valid, true, 'valid flag must be true');
  assert.ok(loginSuccess.token && typeof loginSuccess.token === 'string', 'Token must be issued');
  assert.ok(loginSuccess.expiresAt > Date.now(), 'Token must have future expiry');
  const sessionToken = loginSuccess.token;

  // Incorrect password
  const badLogin = code.handleAdminLogin({ password: 'WrongPassword999' });
  assert.strictEqual(badLogin.valid, false);
  assert.strictEqual(badLogin.code, 'INVALID_CREDENTIALS', 'Must reject bad password with INVALID_CREDENTIALS');

  // Empty password
  const emptyLogin = code.handleAdminLogin({ password: '' });
  assert.strictEqual(emptyLogin.valid, false);
  assert.strictEqual(emptyLogin.code, 'INVALID_CREDENTIALS', 'Must reject empty password with INVALID_CREDENTIALS');

  // doPost verifyAdminPassword endpoint checks
  const postLoginOk = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({ action: 'verifyAdminPassword', payload: { password: testPassword } }) }
  }).getContent());
  assert.strictEqual(postLoginOk.status, 'success');
  assert.strictEqual(postLoginOk.data.valid, true);

  const postLoginFail = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({ action: 'verifyAdminPassword', payload: { password: 'WrongPassword' } }) }
  }).getContent());
  assert.strictEqual(postLoginFail.status, 'error');
  assert.strictEqual(postLoginFail.code, 'INVALID_CREDENTIALS');

  // Direct Plaintext Password Verification in Script Properties (User Directive: Option A Direct Setting)
  // Test 1: ADMIN_PASSWORD = '123'
  delete dynamicScriptProps.ADMIN_PASSWORD_PBKDF2;
  dynamicScriptProps.ADMIN_PASSWORD = '123';
  const directLoginOk = code.handleAdminLogin({ password: '123' });
  assert.strictEqual(directLoginOk.valid, true, 'Direct ADMIN_PASSWORD must pass handleAdminLogin');
  assert.ok(directLoginOk.token, 'Direct ADMIN_PASSWORD must issue valid session token');

  const directLoginWrong = code.handleAdminLogin({ password: 'wrong' });
  assert.strictEqual(directLoginWrong.valid, false);
  assert.strictEqual(directLoginWrong.code, 'INVALID_CREDENTIALS');

  // Test 2: ADMIN_PASSWORD_PBKDF2 = '123' (User setting plaintext in PBKDF2 property)
  delete dynamicScriptProps.ADMIN_PASSWORD;
  dynamicScriptProps.ADMIN_PASSWORD_PBKDF2 = '123';
  const directLoginPbkdf2Ok = code.handleAdminLogin({ password: '123' });
  assert.strictEqual(directLoginPbkdf2Ok.valid, true, 'Direct password in ADMIN_PASSWORD_PBKDF2 must pass handleAdminLogin');

  // Restore PBKDF2 hash for remaining token and session tests
  code.setupAdminPassword(testPassword, 600000);

  // -----------------------------------------------------------------------
  // 13.4 Token validation (tampered, expired, revoked) & Logout Authorization
  // -----------------------------------------------------------------------
  // Valid token
  assert.doesNotThrow(() => {
    code.validateWriteAuth({ token: sessionToken }, global.PropertiesService.getScriptProperties());
  }, 'Valid token must pass validateWriteAuth');

  // Missing token
  assert.throws(() => {
    code.validateWriteAuth({}, global.PropertiesService.getScriptProperties());
  }, (err) => err.code === 'UNAUTHORIZED', 'Missing token must throw UNAUTHORIZED');

  // Tampered signature
  const tamperedSigToken = sessionToken.slice(0, -6) + 'ffffff';
  assert.throws(() => {
    code.validateWriteAuth({ token: tamperedSigToken }, global.PropertiesService.getScriptProperties());
  }, (err) => err.code === 'UNAUTHORIZED', 'Tampered signature must throw UNAUTHORIZED');

  // Expired token (created 20 minutes ago)
  const expiredToken = code.generateAdminSessionToken(global.PropertiesService.getScriptProperties(), Date.now() - 20 * 60 * 1000);
  assert.throws(() => {
    code.validateWriteAuth({ token: expiredToken }, global.PropertiesService.getScriptProperties());
  }, (err) => err.code === 'SESSION_EXPIRED', 'Expired token must throw SESSION_EXPIRED');

  // 13.4.1 Logout Authorization: Unauthenticated adminLogout via doPost MUST BE REJECTED
  const postLogoutNoAuth = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({ action: 'adminLogout', payload: {} }) }
  }).getContent());
  assert.strictEqual(postLogoutNoAuth.status, 'error');
  assert.strictEqual(postLogoutNoAuth.code, 'UNAUTHORIZED', 'Unauthenticated adminLogout must be rejected with UNAUTHORIZED');

  // Authenticated adminLogout via doPost succeeds and bumps TOKEN_EPOCH
  const currentEpochBeforeLogout = dynamicScriptProps.TOKEN_EPOCH;
  const postLogoutAuth = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({ action: 'adminLogout', payload: { token: sessionToken } }) }
  }).getContent());
  assert.strictEqual(postLogoutAuth.status, 'success', 'Authenticated adminLogout must succeed');
  assert.notStrictEqual(dynamicScriptProps.TOKEN_EPOCH, currentEpochBeforeLogout, 'TOKEN_EPOCH must be incremented on authenticated logout');

  // Old sessionToken must now be rejected as SESSION_REVOKED
  assert.throws(() => {
    code.validateWriteAuth({ token: sessionToken }, global.PropertiesService.getScriptProperties());
  }, (err) => err.code === 'SESSION_REVOKED', 'Old token must throw SESSION_REVOKED after authenticated logout');

  // -----------------------------------------------------------------------
  // 13.5 Server-side direct POST rejection across all mutations
  // -----------------------------------------------------------------------
  // Generate fresh token after logout
  const freshLogin = code.handleAdminLogin({ password: testPassword });
  const freshToken = freshLogin.token;

  // Unauthenticated createStudent
  const postCreateNoAuth = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({ action: 'createStudent', payload: { name: 'นักเรียนใหม่' } }) }
  }).getContent());
  assert.strictEqual(postCreateNoAuth.status, 'error');
  assert.strictEqual(postCreateNoAuth.code, 'UNAUTHORIZED', 'doPost createStudent without token must be UNAUTHORIZED');

  // Unauthenticated updateStudent
  const postUpdateNoAuth = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({ action: 'updateStudent', payload: { rowNumber: 3, name: 'แก้ไขชื่อ' } }) }
  }).getContent());
  assert.strictEqual(postUpdateNoAuth.status, 'error');
  assert.strictEqual(postUpdateNoAuth.code, 'UNAUTHORIZED', 'doPost updateStudent without token must be UNAUTHORIZED');

  // Unauthenticated deleteStudent
  const postDeleteNoAuth = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({ action: 'deleteStudent', payload: { rowNumber: 3, studentName: 'เด็กชายทดสอบ ระบบความปลอดภัย' } }) }
  }).getContent());
  assert.strictEqual(postDeleteNoAuth.status, 'error');
  assert.strictEqual(postDeleteNoAuth.code, 'UNAUTHORIZED', 'doPost deleteStudent without token must be UNAUTHORIZED');

  // Unauthenticated saveAppConfig
  const postSaveConfigNoAuth = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({ action: 'saveAppConfig', payload: { sheetName: 'mock-sheet' } }) }
  }).getContent());
  assert.strictEqual(postSaveConfigNoAuth.status, 'error');
  assert.strictEqual(postSaveConfigNoAuth.code, 'UNAUTHORIZED', 'doPost saveAppConfig without token must be UNAUTHORIZED');

  // Authenticated saveAppConfig
  const postSaveConfigAuth = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({
      action: 'saveAppConfig',
      payload: {
        token: freshToken,
        sheetName: 'mock-sheet',
        reportDate: '25/10/2569',
        columnOrder: 'name,classroom,teacher'
      }
    }) }
  }).getContent());
  assert.strictEqual(postSaveConfigAuth.status, 'success', 'Authenticated saveAppConfig must succeed');
  assert.strictEqual(dynamicScriptProps.APP_REPORT_DATE, '25/10/2569');

  // -----------------------------------------------------------------------
  // 13.6 Config repoint rejection (Spreadsheet ID immutability)
  // -----------------------------------------------------------------------
  const baseSpreadsheetId = dynamicScriptProps.APP_SPREADSHEET_ID;
  const repointAttempt = JSON.parse(code.doPost({
    postData: { contents: JSON.stringify({
      action: 'saveAppConfig',
      payload: {
        token: freshToken,
        spreadsheetId: 'malicious-attacker-spreadsheet-id',
        sheetName: 'mock-sheet',
        reportDate: '26/10/2569',
        columnOrder: 'name,classroom'
      }
    }) }
  }).getContent());
  assert.strictEqual(repointAttempt.status, 'success');
  assert.strictEqual(dynamicScriptProps.APP_SPREADSHEET_ID, baseSpreadsheetId, 'APP_SPREADSHEET_ID must remain unchanged despite malicious payload');
  assert.notStrictEqual(dynamicScriptProps.APP_SPREADSHEET_ID, 'malicious-attacker-spreadsheet-id', 'Attacker spreadsheetId must be rejected/ignored');

  // -----------------------------------------------------------------------
  // 13.7 Public/SET preview zero-write verification
  // -----------------------------------------------------------------------
  const sheetDataBefore = JSON.stringify(case13Sheet.data);
  const getStudentRes = JSON.parse(code.doGet({
    parameter: { action: 'getStudentDataAndConfig' }
  }).getContent());
  assert.strictEqual(getStudentRes.status, 'success', 'Public doGet must succeed without authentication');
  assert.ok(Array.isArray(getStudentRes.data.students), 'Public doGet must return students list');

  const getTabsRes = JSON.parse(code.doGet({
    parameter: { action: 'getTabs' }
  }).getContent());
  assert.strictEqual(getTabsRes.status, 'success', 'Public getTabs must succeed');

  const sheetDataAfter = JSON.stringify(case13Sheet.data);
  assert.strictEqual(sheetDataAfter, sheetDataBefore, 'Public doGet and preview actions must perform ZERO sheet writes');

  console.log('  ✅ Passed Case 13: Option A admin authentication, PBKDF2 hash verifier, and fail-closed guards');
} finally {
  global.PropertiesService.getScriptProperties = savedPropsCase13;
}

console.log('\n🎉 ALL 13 TARGETED PHASE 2 TEST SCENARIOS PASSED SUCCESSFULLY!\n');
