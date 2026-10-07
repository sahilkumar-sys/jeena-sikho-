@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
set "HF_HOME=C:\Users\js19187\Documents\Codex\Heygen-Vector-Cache\models"
set "HF_HUB_OFFLINE=1"
set "TRANSFORMERS_OFFLINE=1"
set "PYTHONUTF8=1"
set "PYTHON_EXE=C:\Users\js19187\Documents\Codex\Heygen-Vector-Cache\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
  echo Local embedding Python environment not found: %PYTHON_EXE%
  pause
  exit /b 1
)
"%PYTHON_EXE%" "%PROJECT_ROOT%vector-index\index_clips.py" --root "%PROJECT_ROOT%broll-assets" --db "%PROJECT_ROOT%vector-index\local-clips.sqlite" --ffmpeg ffmpeg --ffprobe ffprobe
if errorlevel 1 (
  echo Indexing needs attention. Read the error above.
  pause
  exit /b 1
)
echo Index updated. Restart Start-Vector-Retrieval.cmd to load the new records.
pause
