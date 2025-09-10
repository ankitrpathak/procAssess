# 🎯 Interview Proctor - Enhanced Usage Guide

## 🚀 **Quick Start**

1. **Start the server** (your Python server is already running at `http://localhost:8000`)
2. **Open your browser** and go to: `http://localhost:8000`
3. **Click "Start Proctoring"** and allow camera permissions
4. **The system will continuously monitor** and automatically generate reports!

## ✨ **New Features Added**

### 🔄 **Continuous Proctoring Mode**

- **Automatic Session Management**: Each session gets a unique ID
- **Session History**: Track multiple proctoring sessions
- **Real-time Statistics**: See total sessions, time, and current integrity score
- **Pause/Resume**: Pause proctoring without losing data

### 📊 **Enhanced Reporting**

- **Automatic Downloads**: Reports download automatically when session ends
- **Multiple Formats**: CSV and PDF reports
- **Detailed Analytics**: Comprehensive session summaries
- **Professional PDFs**: Formatted reports with integrity scores

### 🎮 **New Controls**

- **Start Proctoring**: Begin continuous monitoring
- **Pause**: Temporarily stop detection (keeps recording)
- **Resume**: Continue from where you paused
- **Stop Session**: End session and auto-download reports
- **Download Report (CSV)**: Manual CSV download
- **Download Report (PDF)**: Manual PDF download

## 📋 **How to Use**

### **Starting a Proctoring Session**

1. Click **"Start Proctoring"**
2. Allow camera permissions when prompted
3. Wait for AI models to load
4. Proctoring begins automatically!

### **During Proctoring**

- **Real-time Detection**: Face focus, object detection, multiple faces
- **Event Logging**: All events are logged with timestamps
- **Live Statistics**: See current integrity score and session stats
- **Pause Anytime**: Use pause/resume for breaks

### **Ending a Session**

1. Click **"Stop Session"**
2. Enter candidate name when prompted
3. **Reports download automatically**:
   - CSV file with detailed event log
   - PDF report with summary and integrity score

## 📈 **Session Statistics**

The dashboard shows:

- **Sessions**: Total number of proctoring sessions
- **Total Time**: Cumulative time across all sessions
- **Integrity Score**: Current session's integrity score

## 📊 **Report Contents**

### **CSV Report**

- Timestamp for each event
- Event type (FOCUS_LOST, NO_FACE, OBJECT, etc.)
- Event details and confidence scores

### **PDF Report**

- Candidate information
- Session summary with statistics
- Integrity score with color coding
- Event log (first 20 events)
- Professional formatting

## 🎯 **Detection Features**

### **Focus Detection**

- **Looking Away**: Detects when user looks away for >5 seconds
- **No Face**: Alerts when no face detected for >10 seconds
- **Multiple Faces**: Flags when multiple people are detected

### **Object Detection**

- **Suspicious Items**: Phones, books, laptops, keyboards, remotes
- **Confidence Scoring**: Only reports objects with >60% confidence
- **Real-time Alerts**: Immediate notifications for violations

## 🔧 **Technical Details**

### **Integrity Scoring**

- **Base Score**: 100 points
- **Focus Lost**: -2 points per incident
- **No Face**: -3 points per incident
- **Multiple Faces**: -5 points per incident
- **Suspicious Objects**: -2 points per detection

### **Session Management**

- **Unique IDs**: Each session gets a timestamp-based ID
- **Persistent History**: Sessions are stored in browser memory
- **Auto-cleanup**: Old sessions can be cleared by refreshing

## 🚨 **Troubleshooting**

### **Camera Issues**

- Ensure you're on HTTPS or localhost
- Check camera permissions in browser
- Try refreshing the page

### **Model Loading Issues**

- Check internet connection (models load from CDN)
- Wait for models to fully load before starting
- Use the test setup page to diagnose issues

### **Download Issues**

- Ensure pop-ups are allowed
- Check browser download settings
- Try manual download buttons

## 💡 **Pro Tips**

1. **Test First**: Use `test-setup.html` to verify everything works
2. **Name Sessions**: Always enter candidate names for better reports
3. **Monitor Integrity**: Watch the real-time integrity score
4. **Use Pause**: Pause for breaks without losing session data
5. **Review Reports**: Check both CSV and PDF for comprehensive analysis

## 🎉 **Ready to Use!**

Your enhanced Interview Proctor is now ready for continuous proctoring with automatic report generation. The system will:

- ✅ Continuously monitor candidates
- ✅ Generate detailed reports automatically
- ✅ Track multiple sessions
- ✅ Provide professional PDF reports
- ✅ Maintain session history

**Start proctoring now at: `http://localhost:8000`**
