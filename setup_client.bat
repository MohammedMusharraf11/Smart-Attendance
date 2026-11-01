@echo off
title Smart Attendance - One-Time Client Setup
setlocal enabledelayedexpansion

echo ============================================================
echo   Smart Attendance System - Automatic Setup
echo ============================================================
echo.

:: 1. Check for Python installation
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH!
    echo Please install Python 3.10 or 3.11 from python.org and check "Add Python to PATH".
    echo Or run: winget install --id Python.Python.3.11 -e
    echo.
    pause
    exit /b 1
)

echo [1/4] Found Python:
python --version
echo.

:: 2. Create virtual environment
echo [2/4] Setting up Python virtual environment (.venv)...
cd /d "%~dp0attendance-backend"
if not exist ".venv" (
    python -m venv .venv
    echo Created .venv successfully.
) else (
    echo .venv already exists.
)
echo.

:: 3. Install backend dependencies
echo [3/4] Installing dependencies from requirements.txt...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
echo.

:: 4. Pre-download and cache AI models offline
echo [4/4] Pre-caching InsightFace and MediaPipe AI models for offline operation...
python -c "from app.model import get_model; get_model(); from app.liveness import get_face_landmarker; get_face_landmarker(); print('--- AI Models Cached Successfully! ---')"
echo.

echo ============================================================
echo   SETUP COMPLETE!
echo   All models and dependencies are cached for offline use.
echo   You can now launch the system anytime using start_kiosk.bat
echo ============================================================
echo.
pause

