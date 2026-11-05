/**
 * Unit Tests for Phase 2: Google Sheets A-Q Layout & CRUD Operations (Mock Sheet)
 * Tests Code.gs without touching real Google Sheets or deploying Apps Script.
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
    const result = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      const rowIndex = (this.startRow - 1) + r;
      for (let c = 0; c < this.numCols; c++) {
        const colIndex = (this.startCol - 1) + c;
        const val = (this.sheet.data[rowIndex] && this.sheet.data[rowIndex][colIndex] !== undefined)
          ? this.sheet.data[rowIndex][colIndex]
          : "";
        result.push(val !== null ? val.toString() : "");
      }
      result.push(row);
    }
    // Correct 2D array structure
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

  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const rowIndex = (this.startRow - 1) + r;
      if (!this.sheet.data[rowIndex]) {
        this.sheet.data[rowIndex] = [];
      }
      for (let c = 0; c < values[r].length; c++) {
        const colIndex = (this.startCol - 1) + c;
        this.sheet.data[rowIndex][colIndex] = values[r][c];
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
  constructor(name, data) {
    this.name = name;
    this.data = JSON.parse(JSON.stringify(data)); // Deep copy 2D array
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
    return new MockRange(this, startRow, startCol, numRows, numCols);
  }

  insertRowBefore(rowNumber) {
    const index = rowNumber - 1;
    this.data.splice(index, 0, new Array(this.getLastColumn()).fill(""));
  }

  deleteRow(rowNumber) {
    const index = rowNumber - 1;
    this.data.splice(index, 1);
  }
}

// Set up global environment for Code.gs
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

console.log('🧪 Starting Phase 2 Tests for Google Sheets Integration...\n');

// Standard 17-column header (Row 1 & 2)
const headerAQ = [
  ['เลขประจำตัวนักเรียน', 'ชื่อ-สกุล', 'ห้องเรียน,หน่วยบริการ,ปรับบ้านฯ', 'ครูผู้รับผิดชอบ ภาคเรียนที่ 1 ปีการศึกษา 2569', 'ประเภทการรับบริการ', '', '', 'ประเภทความพิการตามบัตรประจำตัวคนพิการ', 'ประเภทความพิการตามแบบคัดกรองฯ', 'บัตรประจำตัวคนพิการ', 'เอกสารรับรองความพิการ', 'แบบคัดกรองทางการศึกษา', 'วันเดือนปีเกิด', 'อายุ', 'พิการภายหลัง', 'ไม่ใช่สัญชาติไทย', 'หมายเหตุ'],
  ['', '', '', '', 'ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน', '', '', '', '', '', '', '', '', '', '']
];

// 1. Test Sheet Layout Detection
console.log('Test 1: Sheet Layout Detection (NEW_AQ vs LEGACY_AP vs UNKNOWN)');
const mockSheetAQ = new MockSheet('พย69', [
  ...headerAQ,
  ['069001', 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', '']
]);
const layoutAQ = code.detectSheetLayout(mockSheetAQ);
assert.strictEqual(layoutAQ.type, 'NEW_AQ', 'Should detect NEW_AQ layout');
assert.strictEqual(layoutAQ.studentIdCol, 1, 'Column A (1) should be studentIdCol');
assert.strictEqual(layoutAQ.nameCol, 2, 'Column B (2) should be nameCol');
assert.strictEqual(layoutAQ.colCount, 17, 'Should have 17 columns');

// Legacy 16-column header
const headerLegacy = [
  ['ชื่อ-สกุล', 'ห้องเรียน', 'ครูผู้รับผิดชอบ', 'ในศูนย์', 'หน่วยบริการ', 'ปรับบ้าน', 'ตามบัตร', 'ตามคัดกรอง', 'บัตร', 'ใบรับรอง', 'คัดกรอง', 'วันเกิด', 'อายุ', 'พิการภายหลัง', 'ไม่ใช่ไทย', 'หมายเหตุ'],
  ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
];
const mockSheetLegacy = new MockSheet('ต.ค.69', [
  ...headerLegacy,
  ['เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', '']
]);
const layoutLegacy = code.detectSheetLayout(mockSheetLegacy);
assert.strictEqual(layoutLegacy.type, 'LEGACY_AP', 'Should detect LEGACY_AP layout');
assert.strictEqual(layoutLegacy.nameCol, 1, 'Column A (1) should be nameCol in legacy');
assert.strictEqual(layoutLegacy.studentIdCol, null, 'No studentIdCol in legacy');

// Unknown header
const mockSheetUnknown = new MockSheet('ไม่ทราบโครงสร้าง', [
  ['คอลัมน์ที่ไม่รู้จัก 1', 'คอลัมน์ 2'],
  ['ข้อมูล 1', 'ข้อมูล 2']
]);
const layoutUnknown = code.detectSheetLayout(mockSheetUnknown);
assert.strictEqual(layoutUnknown.type, 'UNKNOWN', 'Should detect UNKNOWN layout');
console.log('  ✅ Passed Sheet Layout Detection tests');

// 2. Test Reading A-Q with Student ID & Leading Zeros Preservation
console.log('\nTest 2: Reading A-Q Data (Preserve Leading Zeroes, Correct Column Mapping)');
const testDataAQ = [
  ...headerAQ,
  ['069001', 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'บกพร่องทางสติปัญญา', 'บกพร่องทางสติปัญญา', '1', '', '', '10/11/2562', '6 ปี 11 เดือน', '', '', 'เด็กเรียนดี'],
  ['069002', 'เด็กหญิงพัณภัช บูรณวุฒิ', 'แสงตะวันฉาย', 'นางสาวอรสา แข็งเขตการณ์', '1', '', '', 'พิการซ้อน (2,5)', 'บกพร่องทางสติปัญญา', '1', '', '', '11/11/2562', '6 ปี 11 เดือน', '', '', ''],
  ['', 'เด็กชายไร้รหัส ทะเบียนเก่า', 'มุ่งสู่ดวงดาว', 'นางสาวสุพัตรา นามวงค์', '', '1', '', 'ออทิสติก', 'ออทิสติก', '', '1', '', '01/01/2563', '6 ปี 9 เดือน', '', '', ''],
  ['', 'รวมทั้งหมด 3 คน', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''] // Summary footer row
];
activeMockSheet = new MockSheet('พย69', testDataAQ);
const studentsAQ = code.getStudentData();

assert.strictEqual(studentsAQ.length, 3, 'Should read exactly 3 students and exclude summary footer row');

// Verify student 1
const s1 = studentsAQ[0];
assert.strictEqual(s1.studentId, '069001', 'Must preserve leading zero in studentId as string');
assert.strictEqual(s1.name, 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ', 'Column B must map to name');
assert.strictEqual(s1.classroom, 'แสงตะวันฉาย', 'Column C must map to classroom');
assert.strictEqual(s1.teacher, 'นางสาวอรสา แข็งเขตการณ์', 'Column D must map to teacher');
assert.strictEqual(s1.serviceInCenter, 1, 'Column E must map to serviceInCenter');
assert.strictEqual(s1.serviceUnit, 0, 'Column F must map to serviceUnit');
assert.strictEqual(s1.serviceAdjustHome, 0, 'Column G must map to serviceAdjustHome');
assert.strictEqual(s1.disabilityByCard, 'บกพร่องทางสติปัญญา', 'Column H must map to disabilityByCard');
assert.strictEqual(s1.disabilityByScreening, 'บกพร่องทางสติปัญญา', 'Column I must map to disabilityByScreening');
assert.strictEqual(s1.hasDisabilityCard, 1, 'Column J must map to hasDisabilityCard');
assert.strictEqual(s1.hasDisabilityCert, 0, 'Column K must map to hasDisabilityCert');
assert.strictEqual(s1.hasEducationScreening, 0, 'Column L must map to hasEducationScreening');
assert.strictEqual(s1.dateOfBirth, '10/11/2562', 'Column M must map to dateOfBirth');
assert.strictEqual(s1.age, '6 ปี 11 เดือน', 'Column N must map to age');
assert.strictEqual(s1.disabledLater, 0, 'Column O must map to disabledLater');
assert.strictEqual(s1.nonThai, 0, 'Column P must map to nonThai');
assert.strictEqual(s1.remarks, 'เด็กเรียนดี', 'Column Q must map to remarks');

// Verify student 3 (Blank studentId safely handled as empty string)
const s3 = studentsAQ[2];
assert.strictEqual(s3.studentId, '', 'Blank studentId should be safe empty string');
assert.strictEqual(s3.name, 'เด็กชายไร้รหัส ทะเบียนเก่า');
assert.strictEqual(s3.serviceUnit, 1);
assert.strictEqual(s3.hasDisabilityCert, 1);
console.log('  ✅ Passed Reading A-Q Data and Leading Zeroes tests');

// 3. Test findInsertionRow with blank studentId
console.log('\nTest 3: findInsertionRow (Handle blank student IDs without premature stopping)');
const insertRow = code.findInsertionRow(activeMockSheet);
// Rows: Row 1 (header1), Row 2 (header2), Row 3 (student1), Row 4 (student2), Row 5 (student3), Row 6 (summary)
// findInsertionRow should detect row 6 as summary row and return 6 (1-based index)
assert.strictEqual(insertRow, 6, 'Insertion row must be row 6 (before summary row)');
console.log('  ✅ Passed findInsertionRow test');

// 4. Test findRowByStudentName self-healing in NEW_AQ
console.log('\nTest 4: findRowByStudentName (Self-healing lookup in Column B)');
const rowS2 = code.findRowByStudentName(activeMockSheet, 'เด็กหญิงพัณภัช บูรณวุฒิ');
assert.strictEqual(rowS2, 4, 'Should find student 2 at row 4');
const rowS3 = code.findRowByStudentName(activeMockSheet, 'เด็กชายไร้รหัส ทะเบียนเก่า');
assert.strictEqual(rowS3, 5, 'Should find student 3 at row 5');
const rowNotFound = code.findRowByStudentName(activeMockSheet, 'คนไม่มีตัวตน');
assert.strictEqual(rowNotFound, -1, 'Unknown student must return -1');
console.log('  ✅ Passed findRowByStudentName test');

// 5. Test createStudent in Mock Sheet
console.log('\nTest 5: createStudent (Never invent IDs, write A-Q correctly)');
const newStudentObj = {
  name: 'เด็กชายสมหมาย มาใหม่',
  classroom: 'มุ่งสู่ดวงดาว',
  teacher: 'นางสาวสุพัตรา นามวงค์',
  serviceInCenter: true,
  serviceUnit: false,
  serviceAdjustHome: false,
  disabilityByCard: 'ออทิสติก',
  disabilityByScreening: 'ออทิสติก',
  hasDisabilityCard: true,
  hasDisabilityCert: false,
  hasEducationScreening: false,
  dateOfBirth: '20/05/2563',
  disabledLater: false,
  nonThai: false,
  remarks: 'นักเรียนใหม่'
  // No studentId provided -> Must NOT invent ID!
};

const createRes = code.createStudent(newStudentObj);
assert.strictEqual(createRes.success, true);
// Verify newly inserted row in activeMockSheet at row 6
const insertedData = activeMockSheet.data[5]; // index 5 is row 6
assert.strictEqual(insertedData[0], '', 'Column A must be safe empty string when no verified studentId is provided');
assert.strictEqual(insertedData[1], 'เด็กชายสมหมาย มาใหม่', 'Column B must be student name');
assert.strictEqual(insertedData[2], 'มุ่งสู่ดวงดาว', 'Column C must be classroom');
assert.strictEqual(insertedData[12], '20/05/2563', 'Column M must be DOB');
assert.strictEqual(insertedData[16], 'นักเรียนใหม่', 'Column Q must be remarks');

// Test create with explicit verified studentId
const newStudentWithId = {
  name: 'เด็กหญิงกานดา มีรหัสเซ็ต',
  studentId: '069099',
  classroom: 'มุ่งสู่ดวงดาว',
  teacher: 'นางสาวสุพัตรา นามวงค์',
  serviceInCenter: true,
  disabilityByCard: 'ออทิสติก',
  disabilityByScreening: 'ออทิสติก',
  hasDisabilityCard: true,
  dateOfBirth: '15/08/2562'
};
code.createStudent(newStudentWithId);
const insertedWithId = activeMockSheet.data[6];
assert.strictEqual(insertedWithId[0], '069099', 'Column A must preserve explicit verified studentId');
assert.strictEqual(insertedWithId[1], 'เด็กหญิงกานดา มีรหัสเซ็ต');

// Test duplicate studentId rejection on creation
assert.throws(() => {
  code.createStudent({
    name: 'เด็กชายคนอื่น รหัสซ้ำ',
    studentId: '069099', // Duplicate!
    classroom: 'มุ่งสู่ดวงดาว',
    teacher: 'ครู',
    serviceInCenter: true,
    disabilityByCard: 'บกพร่องทางสติปัญญา',
    disabilityByScreening: 'บกพร่องทางสติปัญญา',
    dateOfBirth: '01/01/2562'
  });
}, /รหัสนักเรียน '069099' มีอยู่ในฐานข้อมูลแล้ว/, 'Must reject duplicate studentId on creation');
console.log('  ✅ Passed createStudent tests');

// 6. Test updateStudent: Must NOT unintentionally overwrite Column A
console.log('\nTest 6: updateStudent (Protect existing Column A studentId from overwrite)');
// Edit student 1 ('069001', row 3)
const updatePayload = {
  rowNumber: 3,
  name: 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ',
  classroom: 'ห้องเรียนปรับปรุงใหม่',
  teacher: 'นางสาวอรสา แข็งเขตการณ์',
  serviceInCenter: true,
  disabilityByCard: 'บกพร่องทางสติปัญญา',
  disabilityByScreening: 'บกพร่องทางสติปัญญา',
  hasDisabilityCard: true,
  dateOfBirth: '10/11/2562',
  remarks: 'อัปเดตข้อมูลแล้ว'
  // Notice: studentId is undefined/not passed in form
};
const updateRes = code.updateStudent(updatePayload);
assert.strictEqual(updateRes.success, true);
const updatedRow = activeMockSheet.data[2]; // row 3 is index 2
assert.strictEqual(updatedRow[0], '069001', 'CRITICAL GUARD: Existing studentId "069001" must NOT be overwritten with blank');
assert.strictEqual(updatedRow[1], 'เด็กชายเย็นศิระ วงศ์เราประเสริฐ');
assert.strictEqual(updatedRow[2], 'ห้องเรียนปรับปรุงใหม่', 'Classroom should be updated');
assert.strictEqual(updatedRow[16], 'อัปเดตข้อมูลแล้ว', 'Remarks should be updated');
console.log('  ✅ Passed updateStudent protection tests');

// 7. Test deleteStudent
console.log('\nTest 7: deleteStudent (Self-healing deletion in NEW_AQ)');
const countBefore = activeMockSheet.data.length;
const deleteRes = code.deleteStudent(4, 'เด็กหญิงพัณภัช บูรณวุฒิ');
assert.strictEqual(deleteRes.success, true);
assert.strictEqual(activeMockSheet.data.length, countBefore - 1, 'Row count should decrease by 1');
assert.strictEqual(code.findRowByStudentName(activeMockSheet, 'เด็กหญิงพัณภัช บูรณวุฒิ'), -1, 'Deleted student should not be found');
console.log('  ✅ Passed deleteStudent test');

// 8. Test Write Guard on UNKNOWN Layout
console.log('\nTest 8: Write Guard on UNKNOWN Layout (Block writes on unexpected structure)');
activeMockSheet = mockSheetUnknown;
assert.throws(() => {
  code.createStudent(newStudentObj);
}, /โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย/, 'Must block create on unknown layout');
assert.throws(() => {
  code.updateStudent(updatePayload);
}, /โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย/, 'Must block update on unknown layout');
assert.throws(() => {
  code.deleteStudent(1, 'ทดสอบ');
}, /โครงสร้างคอลัมน์ของชีตไม่ตรงตามที่คาดหมาย/, 'Must block delete on unknown layout');
console.log('  ✅ Passed Write Guard on UNKNOWN Layout test');

console.log('\n🎉 ALL PHASE 2 GOOGLE SHEETS TESTS PASSED SUCCESSFULLY!');
