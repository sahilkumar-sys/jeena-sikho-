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
set "PATH=%PROJECT_ROOT%runtime\tools;%PATH%"
set "PYTHON_EXE=%VECTOR_RUNTIME%\venv\Scripts\python.exe"
"%PYTHON_EXE%" "%PROJECT_ROOT%vector-index\index_clips.py" --root "%PROJECT_ROOT%broll-assets" --db "%PROJECT_ROOT%vector-index\local-clips.sqlite" --ffmpeg "%PROJECT_ROOT%runtime\tools\ffmpeg.exe" --ffprobe "%PROJECT_ROOT%runtime\tools\ffprobe.exe" --progress-file "%VECTOR_RUNTIME%\logs\progress-project.json" --label "project gallery"
if errorlevel 1 (
  echo Indexing needs attention. Read the error above.
  pause
  exit /b 1
)
echo Index updated. Restart Start-Vector-Retrieval.cmd to load the new records.
pause
