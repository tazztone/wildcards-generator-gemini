@echo off
REM Change directory to the repository root
cd /d "%~dp0.."

REM Create a virtual environment if it doesn't exist
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate the virtual environment
call venv\Scripts\activate.bat

REM Install required packages
echo Installing requirements...
pip install -r requirements.txt

echo Virtual environment setup complete.
pause
