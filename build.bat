@echo off
setlocal
cd /d "%~dp0"

title PDF Binnyash - EXE Builder

echo.
echo ==========================================
echo          PDF BINNYASH EXE BUILDER
echo ==========================================
echo.

REM Check virtual environment
if not exist ".venv\Scripts\python.exe" (
    echo Virtual environment not found.
    echo Please run run.bat first.
    echo.
    pause
    exit /b 1
)

REM Activate virtual environment
call ".venv\Scripts\activate.bat"

REM Make sure required packages are installed
echo Installing requirements...
python -m pip install -r requirements.txt

REM Make sure PyInstaller is installed
echo.
echo Checking PyInstaller...
python -m pip install pyinstaller

REM Check icon
if not exist "assets\windows.ico" (
    echo.
    echo ERROR: assets\windows.ico was not found.
    echo.
    echo Please put your Windows icon here:
    echo.
    echo     assets\windows.ico
    echo.
    pause
    exit /b 1
)

REM Remove previous builds
echo.
echo Cleaning previous build files...

if exist "build" (
    rmdir /s /q "build"
)

if exist "dist" (
    rmdir /s /q "dist"
)

REM Build EXE
echo.
echo Building PDF Binnyash...
echo.

python -m PyInstaller ^
    --noconfirm ^
    --clean ^
    --windowed ^
    --onefile ^
    --name "PDF Binnyash" ^
    --icon "assets\windows.ico" ^
    --add-data "frontend;frontend" ^
    --add-data "assets;assets" ^
    --hidden-import "multiprocessing.popen_spawn_win32" ^
    app.py

if errorlevel 1 (
    echo.
    echo ==========================================
    echo              BUILD FAILED
    echo ==========================================
    echo.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo            BUILD SUCCESSFUL
echo ==========================================
echo.
echo Your EXE is:
echo.
echo     dist\PDF Binnyash.exe
echo.

pause
endlocal