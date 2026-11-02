@echo off
title Smart Attendance - Update System
setlocal

cd /d "%~dp0"

echo ============================================================
echo   Smart Attendance System - Update
echo ============================================================
echo.

echo [1/3] Pulling latest code and pre-compiled frontend from GitHub...
git pull origin main
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git pull failed! Please check your internet connection or git status.
    pause
    exit /b 1
)
echo.

echo [2/3] Updating Python virtual environment dependencies...
cd /d "%~dp0attendance-backend"
call .venv\Scripts\activate.bat
pip install -r requirements.txt
echo.

echo [3/3] Verifying database schema and offline models...
python -c "from app.attendance_log import init_db; init_db(); print('Database schema up to date!')"
echo.

echo ============================================================
echo   UPDATE COMPLETED SUCCESSFULLY!
echo   Double-click start_kiosk.bat to launch the updated system.
echo ============================================================
echo.
pause

