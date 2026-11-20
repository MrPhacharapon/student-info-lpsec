// scratch/test_password_string_body.js
const handler = require('../api/students.js');

async function test() {
  const req = {
    method: 'POST',
    body: JSON.stringify({
      action: 'verifyAdminPassword',
      payload: { password: '123' }
    }),
    headers: {}
  };

  let result = null;
  let code = 200;
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { code = c; return this; },
    json(d) { result = d; return this; }
  };

  await handler(req, res);
  console.log('Result status code:', code);
  console.log('Result data:', result);
}

test().catch(console.error);
