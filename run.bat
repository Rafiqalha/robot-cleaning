@echo off
chcp 65001 >nul
title CleanBot 3D
cd /d "%~dp0"
echo.
echo   CleanBot 3D - Robot Pembersih Kelas (A*)
echo   Server akan berjalan di http://localhost:8765  (tutup jendela ini untuk berhenti)
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo [!] Python tidak ditemukan. Pasang Python 3.10+ lalu jalankan: pip install -r requirements.txt
  pause
  exit /b 1
)
python -c "import fastapi, uvicorn" >nul 2>nul
if errorlevel 1 (
  echo Memasang dependensi (fastapi, uvicorn, numpy) ...
  python -m pip install fastapi uvicorn numpy
)
python server.py --open
pause
