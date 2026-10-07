@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Portable.ps1"
if errorlevel 1 pause
