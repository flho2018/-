const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== PREPARING COMPREHENSIVE POS PACKAGE FOR NEW PC ===');
const rootPackageDir = 'D:\\برنامج_بيت_الورد_كامل_للجهاز_الجديد';

if (fs.existsSync(rootPackageDir)) {
  fs.rmSync(rootPackageDir, { recursive: true, force: true });
}
fs.mkdirSync(rootPackageDir, { recursive: true });

const readyDir = path.join(rootPackageDir, '1-نسخة_التشغيل_المباشرة_Ready_To_Run');
const srcDir = path.join(rootPackageDir, '2-سورس_كود_المشروع_Source_Code');
fs.mkdirSync(readyDir, { recursive: true });
fs.mkdirSync(srcDir, { recursive: true });

// 1. نسخ ملفات dist المترجمة الجاهزة للتشغيل الفوري
console.log('1. Copying dist files to readyDir...');
execSync(`xcopy /E /Y /I "D:\\FL-HO2018\\dist\\*" "${readyDir}\\"`, { stdio: 'ignore' });

// إنشاء سيرفر محلي خفيف يعمل بـ Node.js بدون أي مكتبات إضافية
const serverCode = `const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
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

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !path.extname(reqPath)) {
    reqPath = '/index.html';
  }
  const filePath = path.normalize(path.join(__dirname, reqPath));
  // منع اجتياز المسار: أي طلب يخرج عن مجلد الخادم (../) يُرفض بدل خدمة ملفات النظام
  if (filePath !== __dirname && !filePath.startsWith(__dirname + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(__dirname, 'index.html'), (err2, fallbackData) => {
        if (err2) {
          res.writeHead(404);
          res.end('File not found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fallbackData);
        }
      });
      return;
    }
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('==============================================');
  console.log('   🌸 خادم بيت الورد يعمل الآن بنجاح!        ');
  console.log('   - العنوان المحلي: http://localhost:' + PORT);
  console.log('==============================================');
});
`;
fs.writeFileSync(path.join(readyDir, 'local_server.js'), serverCode, 'utf8');

// 2. نسخ كامل الكود المصدري للتطوير
console.log('2. Copying source code files...');
const sourceFiles = [
  'src',
  'public',
  'package.json',
  'vite.config.js',
  'tailwind.config.js',
  'postcss.config.js',
  'index.html',
  '.env',
  'firebase.json',
  'zip_project.cjs'
];

sourceFiles.forEach(item => {
  const s = path.join('D:\\FL-HO2018', item);
  const d = path.join(srcDir, item);
  if (fs.existsSync(s)) {
    if (fs.statSync(s).isDirectory()) {
      execSync(`xcopy /E /Y /I "${s}\\*" "${d}\\"`, { stdio: 'ignore' });
    } else {
      fs.copyFileSync(s, d);
    }
  }
});

// 3. إنشاء ملفات التشغيل السريع المباشرة (.bat)
console.log('3. Generating batch launcher scripts...');

const runKioskCloudBat = `@echo off
chcp 65001 > nul
title بيت الورد - نظام الكاشير السحابي مع الطباعة الفورية
echo ========================================================
echo   🌸 جاري تشغيل برنامج بيت الورد (نمط الطباعة الفورية)...
echo ========================================================
echo.
set APP_URL=https://flower-house-8888d.web.app

if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%APP_URL%"
    exit
)
if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%APP_URL%"
    exit
)
if exist "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app="%APP_URL%"
    exit
)
if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --app="%APP_URL%"
    exit
)
if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --app="%APP_URL%"
    exit
)
start "" "%APP_URL%"
exit
`;
fs.writeFileSync(path.join(rootPackageDir, '1-تشغيل_الكاشير_السحابي_طباعة_صامتة.bat'), runKioskCloudBat, 'utf8');

const runOfflineLocalBat = `@echo off
chcp 65001 > nul
title بيت الورد - تشغيل أوفلاين محلي
echo ========================================================
echo   🌸 جاري تشغيل نظام بيت الورد محلياً (Offline Server)...
echo ========================================================
echo.
cd /d "%~dp01-نسخة_التشغيل_المباشرة_Ready_To_Run"

echo فحص توفر Node.js...
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo تم العثور على Node.js! تشغيل الخادم المحلي...
    start "" http://localhost:8080
    node local_server.js
) else (
    echo تنبيه: Node.js غير مثبت. جاري فتح صفحة البرنامج في المتصفح مباشرة...
    start "" index.html
)
pause
`;
fs.writeFileSync(path.join(rootPackageDir, '2-تشغيل_البرنامج_أوفلاين_محلياً.bat'), runOfflineLocalBat, 'utf8');

const setupNodeBat = `@echo off
chcp 65001 > nul
title بيت الورد - تثبيت بيئة التطوير
echo ========================================================
echo   🌸 جاري تثبيت حزم ومكتبات المشروع لأول مرة...
echo ========================================================
echo.
cd /d "%~dp02-سورس_كود_المشروع_Source_Code"

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo خطأ: لم يتم العثور على أداة npm أو Node.js!
    echo يرجى تحميل وتثبيت Node.js من الموقع الرسمي: https://nodejs.org
    echo بعد التثبيت، أعد تشغيل هذا الملف.
    pause
    exit /b 1
)

echo جاري تنفيذ npm install...
call npm.cmd install
echo.
echo ========================================================
echo   ✅ تم تثبيت جميع الحزم بنجاح!
echo   يمكنك الآن تشغيل سيرفر التطوير عبر: 4-تشغيل_سيرفر_التطوير_Dev.bat
echo ========================================================
pause
`;
fs.writeFileSync(path.join(rootPackageDir, '3-تثبيت_المشروع_بالكامل_NodeJS.bat'), setupNodeBat, 'utf8');

const devServerBat = `@echo off
chcp 65001 > nul
title بيت الورد - سيرفر التطوير المحلي
echo ========================================================
echo   🌸 جاري تشغيل سيرفر التطوير (Vite Dev Server)...
echo ========================================================
echo.
cd /d "%~dp02-سورس_كود_المشروع_Source_Code"
call npm.cmd run dev
pause
`;
fs.writeFileSync(path.join(rootPackageDir, '4-تشغيل_سيرفر_التطوير_Dev.bat'), devServerBat, 'utf8');

// 4. كتابة دليل الاستخدام والتثبيت
const readmeText = `===================================================================
             🌸 نظام بيت الورد لنقاط البيع والكاشير 🌸
               دليل التثبيت والتشغيل على جهاز جديد
===================================================================

أهلاً بك! يحتوي هذا المجلد المضغوط على كامل ملفات النظام مهيأة للعمل فوراً على أي جهاز كمبيوتر جديد يعمل بنظام Windows.

-------------------------------------------------------------------
الطريقة الأولى: التشغيل الفوري المباشر (للكاشير ونقاط البيع) - بدون تثبيت أي برامج
-------------------------------------------------------------------
1. قم بفك الضغط عن هذا المجلد على سطح المكتب أو القرص D أو C في الجهاز الجديد.
2. اضغط نقرتين على الملف:
   👉 [ 1-تشغيل_الكاشير_السحابي_طباعة_صامتة.bat ]
3. سيفتح البرنامج تلقائياً في متصفح Google Chrome أو Edge بنمط الكشك (Kiosk Printing) مع تفعيل الطباعة الفورية الصامتة لفواتير الكاشير دون ظهور نوافذ منبثقة.
4. ميزة هذه الطريقة:
   - تتصل مباشرة بقاعدة البيانات السحابية (Firebase) لمزامنة المبيعات والمخزون مع باقي الأجهزة والجوال.

-------------------------------------------------------------------
الطريقة الثانية: التشغيل المحلي الأوفلاين (Off-line Local Server)
-------------------------------------------------------------------
1. اضغط نقرتين على الملف:
   👉 [ 2-تشغيل_البرنامج_أوفلاين_محلياً.bat ]
2. سيقوم بتشغيل خادم محلي وسريع على جهازك على المنفذ http://localhost:8080 وفتح المتصفح مباشرة.

-------------------------------------------------------------------
الطريقة الثالثة: للمطورين وتعديل الكود المصدري (Node.js Environment)
-------------------------------------------------------------------
إذا أردت تثبيت بيئة التطوير وتعديل الأكواد البرمجية:
1. تأكد من تثبيت برنامج Node.js من الرابط: https://nodejs.org
2. اضغط نقرتين على:
   👉 [ 3-تثبيت_المشروع_بالكامل_NodeJS.bat ] (لتثبيت مكتبات npm)
3. بعد انتهاء التثبيت، اضغط نقرتين على:
   👉 [ 4-تشغيل_سيرفر_التطوير_Dev.bat ]
4. سيفتح خادم التطوير السريع على http://localhost:3000

-------------------------------------------------------------------
محتويات الحزمة:
-------------------------------------------------------------------
- مجلد [ 1-نسخة_التشغيل_المباشرة_Ready_To_Run ]: النسخة المترجمة والمجهزة للإنتاج الكامل مع جميع الأيقونات والخطوط والتصميم.
- مجلد [ 2-سورس_كود_المشروع_Source_Code ]: كامل الكود المصدري React + Vite + Tailwind CSS ومفاتيح الربط والملفات الأصلية.
- ملفات التشغيل السريع (.bat) لتشغيل بنقرة واحدة.

===================================================================
              نتمنى لكم تجارة رابحة وعملاً موفقاً 🌸
===================================================================
`;
fs.writeFileSync(path.join(rootPackageDir, 'دليل_التثبيت_والتشغيل_اقرأني_أولاً.txt'), readmeText, 'utf8');

console.log('4. Package folder successfully generated at: ' + rootPackageDir);
