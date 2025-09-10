#!/bin/bash

echo "Starting local server for Interview Proctor..."
echo ""
echo "Choose your preferred method:"
echo "1. Python 3 (recommended)"
echo "2. Python 2"
echo "3. Node.js (if you have npx)"
echo "4. PHP (if you have PHP installed)"
echo ""
read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo "Starting Python 3 server on http://localhost:8000"
        python3 -m http.server 8000
        ;;
    2)
        echo "Starting Python 2 server on http://localhost:8000"
        python -m SimpleHTTPServer 8000
        ;;
    3)
        echo "Starting Node.js server on http://localhost:3000"
        npx serve . -p 3000
        ;;
    4)
        echo "Starting PHP server on http://localhost:8000"
        php -S localhost:8000
        ;;
    *)
        echo "Invalid choice. Please run the script again."
        exit 1
        ;;
esac
