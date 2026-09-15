@echo off
chcp 65001 >nul
title بيت الورد - وضع الكاشير (طباعة مباشرة)

REM ============================================================
REM  تشغيل البرنامج في وضع الكاشير مع الطباعة المباشرة
REM
REM  المتصفح لا يسمح بالطباعة بدون نافذة إعدادات إلا إذا شُغّل
REM  بخيار kiosk-printing. هذا الملف يفتح كروم بهذا الخيار،
REM  فتُطبع الفاتورة فوراً على الطابعة الافتراضية بدون أي نافذة.
REM
REM  قبل الاستخدام مرة واحدة فقط:
REM   1) اجعل طابعة الفواتير هي الطابعة الافتراضية في ويندوز
REM   2) من خصائص الطابعة فعّل خيار فتح درج الكاشير مع كل طباعة
REM      (Open Cash Drawer / Cash Drawer: Before printing)
REM ============================================================

REM غيّر الرابط هنا إذا كنت تشغّل نسخة محلية:
set APP_URL=https://flower-house-8888d.web.app

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe

if not exist "%CHROME%" (
  echo.
  echo [تنبيه] لم يتم العثور على متصفح جوجل كروم.
  echo ثبّت كروم ثم أعد تشغيل هذا الملف.
  echo.
  pause
  exit /b 1
)

echo.
echo تشغيل بيت الورد في وضع الطباعة المباشرة...
echo الرابط: %APP_URL%
echo.

start "" "%CHROME%" --kiosk-printing --disable-print-preview --app=%APP_URL% --user-data-dir="%LocalAppData%\BaytAlward\ChromeProfile"

exit /b 0
