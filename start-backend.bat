@echo off
cd /d "%~dp0backend"
python -m src.main --port 8765
pause
