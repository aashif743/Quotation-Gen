@echo off
REM Double-click this to start the attendance bridge.
REM It captures attendance AND serves the enrollment page at http://localhost:5580
cd /d "%~dp0"
python zkbridge.py serve
pause
