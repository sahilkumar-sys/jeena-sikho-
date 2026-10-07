@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%runtime\Repair-Portable-Python.ps1"
if errorlevel 1 (
  echo Portable Python repair failed.
  pause
  exit /b 1
)
set "VECTOR_RUNTIME=%PROJECT_ROOT%runtime\vector-cache"
set "HF_HOME=%VECTOR_RUNTIME%\models"
set "HF_HUB_OFFLINE=1"
set "TRANSFORMERS_OFFLINE=1"
set "PYTHONUTF8=1"
set "BROLL_VECTOR_BIND=0.0.0.0"
set "PATH=%PROJECT_ROOT%runtime\tools;%PATH%"
set "PYTHON_EXE=%VECTOR_RUNTIME%\venv\Scripts\python.exe"
"%PYTHON_EXE%" "%PROJECT_ROOT%vector-retrieval-service.py"
echo Vector retrieval stopped.
pause
