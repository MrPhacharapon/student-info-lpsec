// scratch/test_batch1_containment.js
const assert = require('assert');
const gatewayHandler = require('../api/students.js');

async function testBatch1() {
  console.log('🧪 Starting Batch 1 Security Containment Verification...');

  // 1. Verify Public Sanitization & Allowlist
  const reqPublic = {
    method: 'GET',
    query: { action: 'getStudentDataAndConfig' },
    headers: {}
  };
  let publicResult = null;
  const resPublic = {
    statusCode: 200,
    headers: {},
    setHeader(name, val) { this.headers[name.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(data) { publicResult = data; return this; }
  };
  await gatewayHandler(reqPublic, resPublic);

  assert.strictEqual(resPublic.statusCode, 200, 'Public GET should return 200');
  assert.strictEqual(publicResult.status, 'success', 'Status should be success');
  assert.ok(Array.isArray(publicResult.data.students), 'Students must be array');
  assert.strictEqual(publicResult.data.students.length, 249, 'Must return all 249 students');

  // Verify Zero-PII and Allowlist
  const sample = publicResult.data.students[0];
  assert.strictEqual('citizenId' in sample, false, 'citizenId must NOT exist in public output');
  assert.strictEqual('address' in sample, false, 'address must NOT exist in public output');
  assert.strictEqual('phone' in sample, false, 'phone must NOT exist in public output');
  assert.strictEqual('spreadsheetId' in (publicResult.data.config || {}), false, 'spreadsheetId must NOT exist in public config');
  assert.ok(sample.age && sample.age.includes('ปี'), 'Age must be populated for dashboard charts');
  assert.ok(sample.dateOfBirth.includes('เฉพาะเจ้าหน้าที่'), 'DateOfBirth must be masked for public');
  assert.ok(resPublic.headers['cache-control'].includes('s-maxage=300'), 'Must include CDN cache-control');
  console.log('  ✅ [PASS] 1. Public Allowlist & Zero-PII Sanitization Verified');

  // 2. Action Whitelist (Reject Disallowed Action)
  const reqInvalid = {
    method: 'GET',
    query: { action: 'maliciousAction' },
    headers: {}
  };
  let invalidResult = null;
  const resInvalid = {
    statusCode: 200,
    headers: {},
    setHeader(name, val) { this.headers[name.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(data) { invalidResult = data; return this; }
  };
  await gatewayHandler(reqInvalid, resInvalid);
  assert.strictEqual(resInvalid.statusCode, 400, 'Invalid action must return 400');
  assert.strictEqual(invalidResult.code, 'INVALID_ACTION');
  console.log('  ✅ [PASS] 2. Action Whitelist (Rejection of unapproved actions) Verified');

  // 3. POST Mutation Firewall (Block Unauthenticated Mutations)
  const reqPost = {
    method: 'POST',
    body: { action: 'createStudent', payload: { name: 'Test' } },
    headers: {}
  };
  let postResult = null;
  const resPost = {
    statusCode: 200,
    headers: {},
    setHeader(name, val) { this.headers[name.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(data) { postResult = data; return this; }
  };
  await gatewayHandler(reqPost, resPost);
  assert.strictEqual(resPost.statusCode, 401, 'Unauthenticated mutation must return 401');
  assert.strictEqual(postResult.code, 'UNAUTHORIZED');
  console.log('  ✅ [PASS] 3. Edge Mutation Firewall (401 on missing token) Verified');

  // 4. Admin Authorized GET (No-Store & Full Access)
  const reqAdmin = {
    method: 'GET',
    query: { action: 'getStudentDataAndConfig' },
    headers: { 'x-admin-token': 'LPSEC-TEST-ADMIN-TOKEN-VALID' }
  };
  let adminResult = null;
  const resAdmin = {
    statusCode: 200,
    headers: {},
    setHeader(name, val) { this.headers[name.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(data) { adminResult = data; return this; }
  };
  await gatewayHandler(reqAdmin, resAdmin);
  assert.strictEqual(resAdmin.statusCode, 200);
  assert.ok(resAdmin.headers['cache-control'].includes('no-store'), 'Admin response must be private no-store');
  console.log('  ✅ [PASS] 4. Admin Authorized Gateway & Private Cache Policy Verified');

  console.log('\n🎉 ALL BATCH 1 SECURITY CONTAINMENT TESTS PASSED SUCCESSFULLY!\n');
}

testBatch1().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
