@echo off
setlocal
cd /d "%~dp0"

py -3 -c "import sys; assert sys.version_info >= (3, 8)" >nul 2>&1
if not errorlevel 1 (
    py -3 scripts\serve.py --open
    goto done
)

python -c "import sys; assert sys.version_info >= (3, 8)" >nul 2>&1
if not errorlevel 1 (
    python scripts\serve.py --open
    goto done
)

echo Python 3.8 or newer is required to start this application.
echo Install Python from https://www.python.org/downloads/windows/
echo Then double-click this launcher again.

:done
pause
