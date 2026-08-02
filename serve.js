const http = require('http');
const fs = require('fs');
const path = require('path');

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

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
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
  console.log(`🚀 [Static Dev Server] is running at:`);
  console.log(`   👉 http://localhost:${port}`);
  console.log(`==================================================\n`);
  console.log(`Press Ctrl+C to stop the server.`);
});
