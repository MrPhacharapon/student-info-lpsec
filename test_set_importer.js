/**
 * Unit Test Suite for SET Importer & Diff Preview Engine
 */

const assert = require('assert');
const SETImporter = require('./set-importer.js');

console.log('🧪 Starting Unit Tests for SET Importer...\n');

// 1. Test cleanCitizenId & maskCitizenId
console.log('Test 1: Citizen ID handling (Leading zero, cleaning, checksum, masking)');
const idWithZeros = '0123456789012';
assert.strictEqual(SETImporter.cleanCitizenId(idWithZeros), '0123456789012', 'Should preserve leading zero');
assert.strictEqual(SETImporter.cleanCitizenId('1-5099-00123-45-6'), '1509900123456', 'Should strip dashes');
assert.strictEqual(SETImporter.cleanCitizenId(' 1509900123456 '), '1509900123456', 'Should trim whitespace');
assert.strictEqual(SETImporter.maskCitizenId('1509900123456'), '1-5099-xxxxx-45-6', 'Should mask middle digits');

// Thai ID checksum test
assert.strictEqual(SETImporter.isValidCitizenId('1509900123453'), true, 'Valid Thai Citizen ID should pass');
assert.strictEqual(SETImporter.isValidCitizenId('9999999999999'), false, 'Invalid Thai Citizen ID should fail');
assert.strictEqual(SETImporter.isValidCitizenId('G123456789012'), true, 'Valid G-code should pass');
console.log('  ✅ Passed Citizen ID tests');

// 2. Test Thai Name Normalization
console.log('\nTest 2: Thai Name Normalization');
assert.strictEqual(SETImporter.normalizeThaiName('เด็กชายสมมุติ  ทดสอบ'), 'สมมุติทดสอบ', 'Should remove prefix and extra space');
assert.strictEqual(SETImporter.normalizeThaiName('ด.ช. สมมุติ ทดสอบ'), 'สมมุติทดสอบ', 'Should remove abbreviation prefix');
assert.strictEqual(SETImporter.normalizeThaiName('นางสาววิไล ข้อมูลเปลี่ยน'), 'วิไลข้อมูลเปลี่ยน', 'Should remove female prefix');
console.log('  ✅ Passed Name normalization tests');

// 3. Test Date Parsing (BE & AD, Thai months, Excel serials)
console.log('\nTest 3: Date Parsing');
const dob1 = SETImporter.parseDateBE('10/11/2562');
assert.deepStrictEqual(dob1, { day: 10, month: 11, yearBE: 2562, formatted: '10/11/2562' });

const dobAD = SETImporter.parseDateBE('2019-11-10');
assert.deepStrictEqual(dobAD, { day: 10, month: 11, yearBE: 2562, formatted: '10/11/2562' });

const dobThaiText = SETImporter.parseDateBE('10 พฤศจิกายน 2562');
assert.deepStrictEqual(dobThaiText, { day: 10, month: 11, yearBE: 2562, formatted: '10/11/2562' });

const dobExcelSerial = SETImporter.parseDateBE(43779);
assert.strictEqual(dobExcelSerial.formatted, '10/11/2562');
console.log('  ✅ Passed Date parsing tests');

// 4. Test Age Calculation
console.log('\nTest 4: Age Calculation');
const ageResult = SETImporter.calculateAgeExact('10/11/2562', '21/10/2569');
assert.strictEqual(ageResult.years, 6);
assert.strictEqual(ageResult.months, 11);
assert.strictEqual(ageResult.text, '6 ปี 11 เดือน');
console.log('  ✅ Passed Age calculation tests');

// 5. Test Column Detection & Header Validation
console.log('\nTest 5: Column Detection & Header Validation');
const sampleHeaders = ['เลขประจำตัวประชาชน', 'เลขประจำตัวนักเรียน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'วันเดือนปีเกิด', 'ประเภทความพิการ'];
const valResult = SETImporter.validateReportHeaders('general', sampleHeaders);
assert.strictEqual(valResult.valid, true);
assert.strictEqual(valResult.detected.citizenId, 'เลขประจำตัวประชาชน');
assert.strictEqual(valResult.detected.studentId, 'เลขประจำตัวนักเรียน');
assert.strictEqual(valResult.detected.dob, 'วันเดือนปีเกิด');
console.log('  ✅ Passed Column detection tests');

// 6. Test Multi-Report Joining & Diff Generation
console.log('\nTest 6: Multi-Report Joining & Standard Diff Generation');
const mockData = SETImporter.generateMockTestDataset();
const mappingGen = SETImporter.detectColumns(Object.keys(mockData.mockGeneral[0]));
const mappingAddr = SETImporter.detectColumns(Object.keys(mockData.mockAddress[0]));

const normalizedGen = mockData.mockGeneral.map(r => SETImporter.normalizeSetGeneralRow(r, mappingGen));
const normalizedAddr = mockData.mockAddress.map(r => SETImporter.normalizeSetAddressRow(r, mappingAddr));

const joinResult = SETImporter.joinSetReports(normalizedGen, normalizedAddr);
assert.strictEqual(joinResult.joined.length, 4, 'Should have 4 valid joined rows');
assert.strictEqual(joinResult.invalid.length, 1, 'Should have 1 invalid row (bad checksum & date)');

const diffResult = SETImporter.compareWithGoogleSheets(joinResult.joined, mockData.mockSheets);

assert.strictEqual(diffResult.newInSet.length, 1, 'Should identify 1 new student (มาใหม่ ทะเบียนเซ็ต)');
assert.strictEqual(diffResult.updatedDiff.length, 1, 'Should identify 1 student with diff (วิไล ข้อมูลเปลี่ยน)');
assert.strictEqual(diffResult.matched.length, 1, 'Should identify 1 matched student (สมมุติ ทดสอบตรงกัน)');
assert.strictEqual(diffResult.unmatched.length, 1, 'Should identify 1 conflict student (เอกชัย วันเกิดขัดแย้ง)');
assert.strictEqual(diffResult.sheetsOnly.length, 2, 'Should identify 2 students only in Google Sheets');
assert.strictEqual(diffResult.matched[0].matchConfidence, 'predicted', 'Must be classified as predicted match (no unique ID in sheets)');
console.log('  ✅ Passed Standard diff generation tests');

// 7. Targeted QA Test: Verified Match vs Predicted Match
console.log('\nTest 7: Distinction between Verified Match and Predicted Match');
const setWithId = [{
  citizenId: '1509900123453',
  studentId: '69001',
  fullName: 'เด็กชายสมมุติ ทดสอบตรงกัน',
  normalizedName: 'สมมุติทดสอบตรงกัน',
  dob: '10/11/2562',
  disabilityTypeSet: 'บกพร่องทางสติปัญญา'
}];

// Case 7.1: Google Sheets has matching citizenId -> MUST be 'verified'
const sheetsWithCitizenId = [{
  rowNumber: 3,
  name: 'เด็กชายสมมุติ ทดสอบตรงกัน',
  citizenId: '1509900123453',
  dateOfBirth: '10/11/2562',
  disabilityByCard: 'บกพร่องทางสติปัญญา'
}];
const resVerified = SETImporter.compareWithGoogleSheets(setWithId, sheetsWithCitizenId);
assert.strictEqual(resVerified.matched[0].matchConfidence, 'verified', 'Must be verified match when shared citizenId exists');
assert.strictEqual(resVerified.summary.verifiedCount, 1, 'Verified count must be 1');

// Case 7.2: Google Sheets has NO citizenId, matches only on Name + DOB -> MUST be 'predicted'
const sheetsWithoutId = [{
  rowNumber: 3,
  name: 'เด็กชายสมมุติ ทดสอบตรงกัน',
  dateOfBirth: '10/11/2562',
  disabilityByCard: 'บกพร่องทางสติปัญญา'
}];
const resPredicted = SETImporter.compareWithGoogleSheets(setWithId, sheetsWithoutId);
assert.strictEqual(resPredicted.matched[0].matchConfidence, 'predicted', 'Must be predicted match when only Name + DOB match');
assert.strictEqual(resPredicted.summary.predictedCount, 1, 'Predicted count must be 1');
console.log('  ✅ Passed Verified vs Predicted distinction tests');

// 8. Targeted QA Test: Collision in Google Sheets (Duplicate Name + DOB in Sheets)
console.log('\nTest 8: Google Sheets Collision (Multiple students with same Name + DOB)');
const sheetsWithCollision = [
  { rowNumber: 10, name: 'เด็กชายธงชัย ใจดี', dateOfBirth: '01/01/2560', disabilityByCard: 'ออทิสติก' },
  { rowNumber: 11, name: 'เด็กชายธงชัย ใจดี', dateOfBirth: '01/01/2560', disabilityByCard: 'บกพร่องทางสติปัญญา' }
];
const setThongchai = [{
  citizenId: '1509900999991',
  fullName: 'เด็กชายธงชัย ใจดี',
  normalizedName: 'ธงชัยใจดี',
  dob: '01/01/2560',
  disabilityTypeSet: 'ออทิสติก'
}];
const resSheetsCollision = SETImporter.compareWithGoogleSheets(setThongchai, sheetsWithCollision);
assert.strictEqual(resSheetsCollision.matched.length, 0, 'Must NOT auto-match when Google Sheets has duplicate students');
assert.strictEqual(resSheetsCollision.unmatched.length, 1, 'Must place collision record in unmatched for Admin review');
assert.strictEqual(resSheetsCollision.unmatched[0].conflictType, 'collision_sheets_duplicate');
console.log('  ✅ Passed Google Sheets collision protection test');

// 9. Targeted QA Test: Name matches but DOB differs (without shared unique ID)
console.log('\nTest 9: Name Match with DOB Conflict (DO NOT auto-match)');
const sheetsSomchai = [
  { rowNumber: 20, name: 'เด็กชายสมชาย เรียนดี', dateOfBirth: '05/05/2561', disabilityByCard: 'ออทิสติก' }
];
const setSomchaiDiffDob = [{
  citizenId: '1509900888880',
  fullName: 'เด็กชายสมชาย เรียนดี',
  normalizedName: 'สมชายเรียนดี',
  dob: '25/12/2561', // Different DOB
  disabilityTypeSet: 'ออทิสติก'
}];
const resDobConflict = SETImporter.compareWithGoogleSheets(setSomchaiDiffDob, sheetsSomchai);
assert.strictEqual(resDobConflict.matched.length, 0, 'Must NOT auto-match when DOB differs without unique ID');
assert.strictEqual(resDobConflict.updatedDiff.length, 0, 'Must NOT assume same person when DOB differs without unique ID');
assert.strictEqual(resDobConflict.unmatched.length, 1, 'Must flag as name_dob_conflict in unmatched for Admin review');
assert.strictEqual(resDobConflict.unmatched[0].conflictType, 'name_dob_conflict');
console.log('  ✅ Passed Name/DOB conflict protection test');

// 10. Targeted QA Test: Collision in SET (Multiple students in SET with same Name + DOB)
console.log('\nTest 10: SET Collision (Multiple students in SET with same Name + DOB)');
const setDuplicate = [
  { citizenId: '1509900777771', fullName: 'เด็กหญิงดวงใจ มุ่งมั่น', normalizedName: 'ดวงใจมุ่งมั่น', dob: '15/06/2562' },
  { citizenId: '1509900777772', fullName: 'เด็กหญิงดวงใจ มุ่งมั่น', normalizedName: 'ดวงใจมุ่งมั่น', dob: '15/06/2562' }
];
const sheetsDuongjai = [
  { rowNumber: 30, name: 'เด็กหญิงดวงใจ มุ่งมั่น', dateOfBirth: '15/06/2562' }
];
const resSetCollision = SETImporter.compareWithGoogleSheets(setDuplicate, sheetsDuongjai);
assert.strictEqual(resSetCollision.matched.length, 0, 'Must NOT auto-match when SET contains duplicate records');
assert.strictEqual(resSetCollision.unmatched.length, 2, 'Both duplicate SET records must be flagged for Admin review');
assert.strictEqual(resSetCollision.unmatched[0].conflictType, 'collision_set_duplicate');
console.log('  ✅ Passed SET collision protection test');

console.log('\n🎉 ALL 10 UNIT TEST SUITES PASSED SUCCESSFULLY!\n');
