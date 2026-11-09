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
  // 13.2 Password verification with PBKDF2
  // -----------------------------------------------------------------------
  const testPassword = 'CorrectAdminPassword@2026';
  code.setupAdminPassword(testPassword, 10000);
  assert.ok(dynamicScriptProps.ADMIN_PASSWORD_PBKDF2.startsWith('pbkdf2_sha256$10000$'), 'ADMIN_PASSWORD_PBKDF2 must be formatted correctly');

  // Measure verification time with correct password
  const t0 = Date.now();
  const loginSuccess = code.handleAdminLogin({ password: testPassword });
  const pbkdf2Duration = Date.now() - t0;
  console.log(`    ⏱️ Measured PBKDF2 verification time (10,000 iterations): ${pbkdf2Duration}ms`);
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

  // -----------------------------------------------------------------------
  // 13.3 Token validation (tampered, expired, revoked)
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

  // Revoked token via adminLogout bumping TOKEN_EPOCH
  code.handleAdminLogout(global.PropertiesService.getScriptProperties());
  assert.strictEqual(dynamicScriptProps.TOKEN_EPOCH, '2', 'TOKEN_EPOCH must be bumped to 2');
  assert.throws(() => {
    code.validateWriteAuth({ token: sessionToken }, global.PropertiesService.getScriptProperties());
  }, (err) => err.code === 'SESSION_REVOKED', 'Old token must throw SESSION_REVOKED after epoch bump');

  // -----------------------------------------------------------------------
  // 13.4 Server-side direct POST rejection across all mutations
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
  // 13.5 Config repoint rejection (Spreadsheet ID immutability)
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
  // 13.6 Public/SET preview zero-write verification
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
