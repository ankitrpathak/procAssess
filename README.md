## Focus & Object Detection in Video Interviews

A lightweight browser-based proctoring demo. It records the candidate's webcam, detects focus and suspicious objects in real time, logs events with timestamps, and exports a CSV report.

### Features

- Interview screen with webcam preview and recording (WebM)
- Real-time focus detection: looking away (>5s), no face (>10s), multiple faces
- Object detection (COCO-SSD): cell phone, book, laptop, keyboard, remote
- Event log with timestamps and CSV export
- Summary with integrity score heuristic

### Quick Start

**⚠️ Important: Camera access requires HTTPS or localhost**

#### Option 1: Local Server (Recommended)

```bash
# Using Python
python -m http.server 8000

# Using Node.js (if you have npx)
npx serve .

# Using PHP
php -S localhost:8000
```

Then open: `http://localhost:8000`

#### Option 2: Direct File Access (Limited)

- Open `index.html` directly in Chrome/Edge
- Note: Some features may not work due to CORS restrictions

#### Usage Steps

1. Open the application in your browser
2. Click "Start Interview" and allow camera permissions
3. Run the interview - events will populate in the log
4. Click "Stop & Save" when finished
5. Download the CSV report and recorded video

#### Quick Setup Scripts

- **Windows**: Double-click `start-server.bat`
- **Mac/Linux**: Run `chmod +x start-server.sh && ./start-server.sh`

#### Troubleshooting

If you're having issues, open `test-setup.html` first to diagnose problems with:

- Protocol compatibility (HTTPS/localhost)
- Browser feature support
- Camera access
- AI model loading

No build steps required; AI models are loaded via CDN.

### Notes

- All processing runs locally in the browser using TensorFlow.js.
- Looking-away detection is a heuristic based on face position relative to frame center.
- You can deploy these static files to any static host (GitHub Pages, Netlify, Vercel).

### Deliverables Mapping

- Frontend interview screen: `index.html`, `styles.css`, `app.js`
- Real-time focus and object detection, logging, CSV report
- Optional backend not included (can be added to store logs via API)
