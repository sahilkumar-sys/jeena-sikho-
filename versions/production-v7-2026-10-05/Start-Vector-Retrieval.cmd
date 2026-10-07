@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "HF_HOME=C:\Users\js19187\Documents\Codex\Heygen-Vector-Cache\models"
set "HF_HUB_OFFLINE=1"
set "TRANSFORMERS_OFFLINE=1"
set "PYTHONUTF8=1"
rem Docker Desktop reaches the host through host.docker.internal, not 127.0.0.1.
set "BROLL_VECTOR_BIND=0.0.0.0"
set "PYTHON_EXE=C:\Users\js19187\Documents\Codex\Heygen-Vector-Cache\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
  echo Local embedding Python environment not found: %PYTHON_EXE%
  pause
  exit /b 1
)
"%PYTHON_EXE%" "%PROJECT_ROOT%vector-retrieval-service.py"
echo Vector retrieval stopped.
pause
