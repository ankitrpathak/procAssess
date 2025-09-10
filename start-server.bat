@echo off
echo Starting local server for Interview Proctor...
echo.
echo Choose your preferred method:
echo 1. Python 3 (recommended)
echo 2. Python 2
echo 3. Node.js (if you have npx)
echo 4. PHP (if you have PHP installed)
echo.
set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    echo Starting Python 3 server on http://localhost:8000
    python -m http.server 8000
) else if "%choice%"=="2" (
    echo Starting Python 2 server on http://localhost:8000
    python -m SimpleHTTPServer 8000
) else if "%choice%"=="3" (
    echo Starting Node.js server on http://localhost:3000
    npx serve . -p 3000
) else if "%choice%"=="4" (
    echo Starting PHP server on http://localhost:8000
    php -S localhost:8000
) else (
    echo Invalid choice. Please run the script again.
    pause
)
