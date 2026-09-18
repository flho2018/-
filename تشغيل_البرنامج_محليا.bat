@echo off
chcp 65001 > nul
title بيت الورد - نظام نقاط البيع المحاسبي
echo ========================================================
echo   🌸 جاري تشغيل برنامج بيت الورد للزهور والهدايا...
echo ========================================================
echo.
echo   - الرابط المحلي: http://localhost:8080
echo   - جاري فتح المتصفح تلقائياً...
echo.
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --kiosk-printing --app="http://localhost:8080"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --kiosk-printing --app="http://localhost:8080"
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --kiosk-printing --app="http://localhost:8080"
) else (
    start http://localhost:8080
)
node -e "
const http = require('http');
const fs = require('fs');
const path = require('path');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

const baseDir = path.join('%~dp0', 'firebase_live_app');

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  let filePath = path.normalize(path.join(baseDir, reqPath));

  if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(baseDir, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading ' + reqPath);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(8080, '127.0.0.1', () => {
  console.log('✅ البرنامج يعمل الآن بنجاح على: http://localhost:8080');
  console.log('💡 اترك هذه النافذة مفتوحة أثناء استخدام البرنامج.');
});