@echo off
cd /d "%~dp0web"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js 24 first.
 pause
 exit /b 1
)
if not exist node_modules call npm install
if errorlevel 1 (
 pause
 exit /b 1
)
call npm run build
if errorlevel 1 (
 pause
 exit /b 1
)
start "" "http://127.0.0.1:8151"
call npm start
pause
