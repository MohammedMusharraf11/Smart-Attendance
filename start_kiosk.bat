@echo off
title Smart Attendance Kiosk
setlocal

cd /d "%~dp0attendance-backend"

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found!
    echo Please run setup_client.bat first to configure dependencies.
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo   Starting Smart Attendance System...
echo ============================================================
echo Starting backend server on http://0.0.0.0:8000 ...

:: Launch FastAPI backend in a background window
start "Smart Attendance Server" /min .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

:: Wait 3 seconds for server to start
timeout /t 3 /nobreak >nul

echo Launching Kiosk Interface in browser...

:: Try to launch Chrome in app mode; fall back to Edge or default browser
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --start-fullscreen --app=http://localhost:8000
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --start-fullscreen --app=http://localhost:8000
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --start-fullscreen --app=http://localhost:8000
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --start-fullscreen --app=http://localhost:8000
) else (
    start http://localhost:8000
)

echo.
echo ============================================================
echo   System is running! Keep this window open.
echo   Press Ctrl+C or close this window to stop the system.
echo ============================================================
echo.
pause
