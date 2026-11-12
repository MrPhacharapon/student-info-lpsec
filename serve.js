const http = require('http');
const fs = require('fs');
const path = require('path');
const gatewayHandler = require('./api/students.js');

const port = 3000;
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${port}`);

  // Route API requests to api/students.js (Vercel Edge Simulator)
  if (reqUrl.pathname === '/api/students' || reqUrl.pathname.startsWith('/api/students')) {
    // Shim Vercel helpers on req and res
    req.query = Object.fromEntries(reqUrl.searchParams);
    res.status = function(code) { this.statusCode = code; return this; };
    res.json = function(data) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(data));
      return this;
    };

    if (req.method === 'POST') {
      let bodyData = '';
      req.on('data', chunk => { bodyData += chunk; });
      req.on('end', async () => {
        try {
          req.body = bodyData ? JSON.parse(bodyData) : {};
        } catch (e) {
          req.body = {};
        }
        await gatewayHandler(req, res);
      });
      return;
    }

    await gatewayHandler(req, res);
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : reqUrl.pathname;
  filePath = path.join(__dirname, filePath);

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if(error.code == 'ENOENT'){
        // Fallback to index.html for SPA if not found
        fs.readFile(path.join(__dirname, 'index.html'), (error, content) => {
           res.writeHead(200, { 'Content-Type': 'text/html' });
           res.end(content, 'utf-8');
        });
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 [Static Dev Server + Edge Gateway] is running at:`);
  console.log(`   👉 http://localhost:${port}`);
  console.log(`==================================================\n`);
  console.log(`Press Ctrl+C to stop the server.`);
});
