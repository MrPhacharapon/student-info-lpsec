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
      return null;
    },
    setProperty: () => {}
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

console.log('\n🎉 ALL 7 TARGETED PHASE 2 TEST SCENARIOS PASSED SUCCESSFULLY!\n');
