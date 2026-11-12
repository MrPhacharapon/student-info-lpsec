// scratch/test_gateway.js
const handler = require('../api/students.js');

async function runTest() {
  console.log('Testing api/students.js...');

  // Mock Request 1: GET getStudentDataAndConfig (Public / Anonymous)
  const reqPublic = {
    method: 'GET',
    query: { action: 'getStudentDataAndConfig' },
    headers: {}
  };

  let publicData = null;
  const resPublic = {
    statusCode: 200,
    headers: {},
    setHeader(name, val) { this.headers[name.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(data) { publicData = data; return this; },
    end() {}
  };

  await handler(reqPublic, resPublic);
  console.log('Public GET Status:', resPublic.statusCode);
  console.log('Cache-Control Header:', resPublic.headers['cache-control']);
  console.log('Public Data Status:', publicData?.status);
  console.log('Public Students Count:', publicData?.data?.students?.length);
  
  if (publicData?.data?.students?.length > 0) {
    const s0 = publicData.data.students[0];
    console.log('Sample Public Student Keys:', Object.keys(s0));
    console.log('Citizen ID present?:', 'citizenId' in s0);
    console.log('Spreadsheet ID present in config?:', 'spreadsheetId' in (publicData.data.config || {}));
    console.log('Age value:', s0.age);
    console.log('DateOfBirth value:', s0.dateOfBirth);
  }

  // Mock Request 2: Unauthorized Action
  const reqBad = {
    method: 'GET',
    query: { action: 'dropAllTables' },
    headers: {}
  };
  let badData = null;
  const resBad = {
    statusCode: 200,
    headers: {},
    setHeader(name, val) { this.headers[name.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(data) { badData = data; return this; }
  };
  await handler(reqBad, resBad);
  console.log('Bad Action Status:', resBad.statusCode, 'Message:', badData?.message);

  // Mock Request 3: POST without Token
  const reqPostNoToken = {
    method: 'POST',
    body: { action: 'deleteStudent', payload: { rowNumber: 3 } },
    headers: {}
  };
  let postNoTokenData = null;
  const resPostNoToken = {
    statusCode: 200,
    headers: {},
    setHeader(name, val) { this.headers[name.toLowerCase()] = val; },
    status(code) { this.statusCode = code; return this; },
    json(data) { postNoTokenData = data; return this; }
  };
  await handler(reqPostNoToken, resPostNoToken);
  console.log('POST No Token Status:', resPostNoToken.statusCode, 'Message:', postNoTokenData?.message);
}

runTest().catch(console.error);
