(() => {
  const videoEl = document.getElementById("video");
  const canvasEl = document.getElementById("overlay");
  const ctx = canvasEl.getContext("2d");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const downloadCsvBtn = document.getElementById("downloadCsvBtn");
  const downloadVideoBtn = document.getElementById("downloadVideoBtn");
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");
  const logBody = document.getElementById("logBody");
  const focusStatus = document.getElementById("focusStatus");
  const timerEl = document.getElementById("timer");
  const summaryEl = document.getElementById("summary");
  const httpsNotice = document.getElementById("httpsNotice");
  const sessionCount = document.getElementById("sessionCount");
  const totalTime = document.getElementById("totalTime");
  const currentScore = document.getElementById("currentScore");

  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let startTimeMs = null;
  let timerInterval = null;
  let isPaused = false;
  let sessionHistory = [];
  let totalSessionTime = 0;
  let currentSessionId = null;

  // Models
  let cocoModel = null;
  let faceModel = null;

  // Detection state
  const events = [];
  let lastFaceSeenMs = null;
  let lastFocusOkMs = null;
  let lookingAwayActive = false;
  let absenceActive = false;
  let multiFaceActive = false;

  // Settings
  const SAMPLE_HZ = 5; // ~5 FPS detection loop
  const LOOK_AWAY_THRESHOLD_MS = 5000; // > 5s
  const ABSENCE_THRESHOLD_MS = 10000; // > 10s
  const OBJECT_MIN_SCORE = 0.6;
  const OBJECTS_OF_INTEREST = new Set([
    "cell phone",
    "book",
    "laptop",
    "keyboard",
    "remote",
  ]);

  function checkHttpsRequirement() {
    if (
      location.protocol !== "https:" &&
      location.hostname !== "localhost" &&
      location.hostname !== "127.0.0.1"
    ) {
      httpsNotice.style.display = "block";
      return false;
    }
    httpsNotice.style.display = "none";
    return true;
  }

  function msSinceStart() {
    return Date.now() - (startTimeMs ?? Date.now());
  }

  function formatTime(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function updateSessionStats() {
    sessionCount.textContent = `Sessions: ${sessionHistory.length}`;
    totalTime.textContent = `Total Time: ${formatTime(totalSessionTime)}`;

    if (events.length > 0) {
      const durationMs = msSinceStart();
      const lostFocusCount = events.filter(
        (e) => e.type === "FOCUS_LOST"
      ).length;
      const absenceCount = events.filter((e) => e.type === "NO_FACE").length;
      const multiCount = events.filter(
        (e) => e.type === "MULTIPLE_FACES"
      ).length;
      const objectEvents = events.filter((e) => e.type === "OBJECT");
      const deductions =
        lostFocusCount * 2 +
        absenceCount * 3 +
        multiCount * 5 +
        objectEvents.length * 2;
      const integrity = Math.max(0, 100 - deductions);
      currentScore.textContent = `Integrity Score: ${integrity}`;
    } else {
      currentScore.textContent = `Integrity Score: --`;
    }
  }

  function addEvent(type, detail) {
    const t = msSinceStart();
    events.push({ timeMs: t, type, detail });
    const tr = document.createElement("tr");
    const timeTd = document.createElement("td");
    timeTd.textContent = formatTime(t);
    const typeTd = document.createElement("td");
    typeTd.innerHTML = `<span class="chip">${type}</span>`;
    const detailTd = document.createElement("td");
    detailTd.textContent = detail;
    tr.append(timeTd, typeTd, detailTd);
    logBody.prepend(tr);
  }

  async function initStream() {
    try {
      // Check if we're on HTTPS or localhost
      if (
        location.protocol !== "https:" &&
        location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1"
      ) {
        throw new Error(
          "Camera access requires HTTPS. Please use a local server or deploy to HTTPS."
        );
      }

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera access not supported in this browser.");
      }

      updateStatus("Requesting camera access...");

      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user", // Front camera
        },
        audio: false,
      });

      videoEl.srcObject = mediaStream;

      // Wait for video to be ready
      await new Promise((resolve, reject) => {
        videoEl.onloadedmetadata = resolve;
        videoEl.onerror = reject;
        videoEl.load();
      });

      await videoEl.play();
      resizeCanvas();
      updateStatus("Camera ready");
    } catch (error) {
      console.error("Camera initialization failed:", error);
      let errorMessage = "Camera access failed. ";

      if (error.name === "NotAllowedError") {
        errorMessage += "Please allow camera permissions and refresh the page.";
      } else if (error.name === "NotFoundError") {
        errorMessage += "No camera found. Please connect a camera.";
      } else if (error.name === "NotReadableError") {
        errorMessage += "Camera is being used by another application.";
      } else if (error.message.includes("HTTPS")) {
        errorMessage = error.message;
      } else {
        errorMessage += error.message;
      }

      updateStatus(errorMessage);
      throw error;
    }
  }

  function startRecording() {
    recordedChunks = [];
    try {
      mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: "video/webm; codecs=vp9",
      });
    } catch (e) {
      mediaRecorder = new MediaRecorder(mediaStream);
    }
    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data);
    };
    mediaRecorder.onstop = () => {
      if (recordedChunks.length) {
        const blob = new Blob(recordedChunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        downloadVideoBtn.href = url;
        downloadVideoBtn.download = `interview_${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}.webm`;
        downloadVideoBtn.disabled = false;
      }
    };
    mediaRecorder.start();
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive")
      mediaRecorder.stop();
  }

  function resizeCanvas() {
    const rect = videoEl.getBoundingClientRect();
    canvasEl.width = rect.width * devicePixelRatio;
    canvasEl.height = rect.height * devicePixelRatio;
  }
  window.addEventListener("resize", resizeCanvas);

  async function loadModels() {
    try {
      updateStatus("Loading AI models...");

      // Load COCO-SSD model for object detection
      try {
        updateStatus("Loading object detection model...");
        cocoModel = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        console.log("COCO-SSD model loaded successfully");
      } catch (error) {
        console.warn("Failed to load COCO-SSD model:", error);
        updateStatus("Object detection unavailable - model failed to load");
      }

      // Load face detection model
      try {
        updateStatus("Loading face detection model...");
        faceModel = await faceDetection.createDetector(
          faceDetection.SupportedModels.BlazeFace,
          {
            maxFaces: 5,
            // Optional thresholds can be tuned if needed
          }
        );
        console.log("Face detection model loaded successfully");
      } catch (error) {
        console.warn("Failed to load face detection model:", error);
        updateStatus("Face detection unavailable - model failed to load");
      }

      // Check if at least one model loaded
      if (!cocoModel && !faceModel) {
        throw new Error(
          "Failed to load any AI models. Please check your internet connection."
        );
      }

      updateStatus("Models loaded successfully");
    } catch (error) {
      console.error("Model loading failed:", error);
      updateStatus("Model loading failed: " + error.message);
      throw error;
    }
  }

  function drawDetections(faces, objects) {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.save();
    ctx.scale(devicePixelRatio, devicePixelRatio);
    // Faces
    ctx.strokeStyle = "#4cc9f0";
    ctx.lineWidth = 2;
    faces.forEach((f) => {
      const { xMin, yMin, width, height } = f.box;
      ctx.strokeRect(xMin, yMin, width, height);
    });
    // Objects
    ctx.strokeStyle = "#f72585";
    objects.forEach((o) => {
      ctx.strokeRect(o.bbox[0], o.bbox[1], o.bbox[2], o.bbox[3]);
      ctx.fillStyle = "rgba(247,37,133,0.15)";
      ctx.fillRect(o.bbox[0], o.bbox[1], o.bbox[2], o.bbox[3]);
      ctx.fillStyle = "#f1b3cf";
      ctx.font = "12px Inter";
      ctx.fillText(
        `${o.class} ${(o.score * 100).toFixed(0)}%`,
        o.bbox[0] + 4,
        o.bbox[1] + 14
      );
    });
    ctx.restore();
  }

  function updateStatus(text) {
    focusStatus.textContent = text;
  }

  function computeFocusSignals(faces) {
    if (!faces.length)
      return { facePresent: false, multiFaces: false, lookingAway: false };
    const multiFaces = faces.length > 1;
    // Use the most prominent face by area
    let main = faces[0];
    let maxArea = 0;
    for (const f of faces) {
      const area = f.box.width * f.box.height;
      if (area > maxArea) {
        maxArea = area;
        main = f;
      }
    }
    // Estimate gaze by comparing face center against frame center
    const faceCenterX = main.box.xMin + main.box.width / 2;
    const faceCenterY = main.box.yMin + main.box.height / 2;
    const elRect = videoEl.getBoundingClientRect();
    const frameCenterX = elRect.width / 2;
    const frameCenterY = elRect.height / 2;
    const dx = (faceCenterX - frameCenterX) / (elRect.width / 2);
    const dy = (faceCenterY - frameCenterY) / (elRect.height / 2);
    const dist = Math.hypot(dx, dy);
    const lookingAway = dist > 0.35; // heuristic threshold
    return { facePresent: true, multiFaces, lookingAway };
  }

  function updateSummary() {
    const durationMs = msSinceStart();
    const lostFocusCount = events.filter((e) => e.type === "FOCUS_LOST").length;
    const absenceCount = events.filter((e) => e.type === "NO_FACE").length;
    const multiCount = events.filter((e) => e.type === "MULTIPLE_FACES").length;
    const objectEvents = events.filter((e) => e.type === "OBJECT");
    const uniqueObjects = new Set(
      objectEvents.map((e) => e.detail.split(":")[0])
    );
    const deductions =
      lostFocusCount * 2 +
      absenceCount * 3 +
      multiCount * 5 +
      objectEvents.length * 2;
    const integrity = Math.max(0, 100 - deductions);
    summaryEl.innerHTML = `
			<div>
				<strong>Interview Duration:</strong> ${formatTime(durationMs)}
			</div>
			<div>
				<strong>Focus Lost:</strong> ${lostFocusCount} &nbsp; | &nbsp; <strong>No Face:</strong> ${absenceCount} &nbsp; | &nbsp; <strong>Multiple Faces:</strong> ${multiCount}
			</div>
			<div>
				<strong>Suspicious Objects:</strong> ${objectEvents.length} (Types: ${
      [...uniqueObjects].join(", ") || "None"
    })
			</div>
			<div>
				<strong>Integrity Score:</strong> ${integrity}
			`;
  }

  function toCsv() {
    const headers = ["time", "type", "detail"];
    const rows = events.map((e) => [
      formatTime(e.timeMs),
      e.type,
      e.detail.replace(/,/g, ";"),
    ]);
    return [headers, ...rows].map((r) => r.join(",")).join("\n");
  }

  function generateSessionSummary() {
    const durationMs = msSinceStart();
    const lostFocusCount = events.filter((e) => e.type === "FOCUS_LOST").length;
    const absenceCount = events.filter((e) => e.type === "NO_FACE").length;
    const multiCount = events.filter((e) => e.type === "MULTIPLE_FACES").length;
    const objectEvents = events.filter((e) => e.type === "OBJECT");
    const uniqueObjects = new Set(
      objectEvents.map((e) => e.detail.split(":")[0])
    );
    const deductions =
      lostFocusCount * 2 +
      absenceCount * 3 +
      multiCount * 5 +
      objectEvents.length * 2;
    const integrity = Math.max(0, 100 - deductions);

    return {
      duration: formatTime(durationMs),
      lostFocusCount,
      absenceCount,
      multiCount,
      objectEvents: objectEvents.length,
      uniqueObjects: [...uniqueObjects],
      integrity,
      totalEvents: events.length,
    };
  }

  function downloadReport() {
    const name =
      prompt("Candidate Name (optional for report):", "") || "Anonymous";
    const summary = generateSessionSummary();

    // Download CSV
    const csv = toCsv();
    const csvBlob = new Blob([csv], { type: "text/csv" });
    const csvUrl = URL.createObjectURL(csvBlob);
    const csvLink = document.createElement("a");
    csvLink.href = csvUrl;
    csvLink.download = `proctoring_report_${name}_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv`;
    csvLink.click();

    // Download PDF
    generatePDF(name, summary);
  }

  function generatePDF(candidateName, summary) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Title
    doc.setFontSize(20);
    doc.text("Interview Proctoring Report", 20, 20);

    // Candidate info
    doc.setFontSize(12);
    doc.text(`Candidate: ${candidateName}`, 20, 35);
    doc.text(`Session ID: ${currentSessionId}`, 20, 45);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 55);
    doc.text(`Duration: ${summary.duration}`, 20, 65);

    // Summary
    doc.setFontSize(16);
    doc.text("Summary", 20, 85);

    doc.setFontSize(12);
    doc.text(`Focus Lost: ${summary.lostFocusCount} times`, 20, 100);
    doc.text(`No Face Detected: ${summary.absenceCount} times`, 20, 110);
    doc.text(`Multiple Faces: ${summary.multiCount} times`, 20, 120);
    doc.text(`Suspicious Objects: ${summary.objectEvents} detections`, 20, 130);
    doc.text(
      `Object Types: ${summary.uniqueObjects.join(", ") || "None"}`,
      20,
      140
    );

    // Integrity Score
    doc.setFontSize(16);
    doc.text("Integrity Score", 20, 160);
    doc.setFontSize(24);
    doc.setTextColor(
      summary.integrity >= 80
        ? [0, 128, 0]
        : summary.integrity >= 60
        ? [255, 165, 0]
        : [255, 0, 0]
    );
    doc.text(`${summary.integrity}/100`, 20, 180);

    // Events table
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text("Event Log", 20, 200);

    let yPos = 215;
    doc.setFontSize(10);
    events.slice(0, 20).forEach((event, index) => {
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(
        `${formatTime(event.timeMs)} - ${event.type}: ${event.detail}`,
        20,
        yPos
      );
      yPos += 5;
    });

    if (events.length > 20) {
      doc.text(`... and ${events.length - 20} more events`, 20, yPos);
    }

    // Save PDF
    doc.save(
      `proctoring_report_${candidateName}_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.pdf`
    );
  }

  function enableControls(on) {
    startBtn.disabled = on;
    stopBtn.disabled = !on;
    pauseBtn.disabled = !on || isPaused;
    resumeBtn.disabled = !on || !isPaused;
    downloadCsvBtn.disabled = !on;
    downloadPdfBtn.disabled = !on;
  }

  function pauseProctoring() {
    isPaused = true;
    stopTimers();
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.pause();
    }
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "inline-block";
    updateStatus("Proctoring paused");
  }

  function resumeProctoring() {
    isPaused = false;
    startTimers();
    if (mediaRecorder && mediaRecorder.state === "paused") {
      mediaRecorder.resume();
    }
    pauseBtn.style.display = "inline-block";
    resumeBtn.style.display = "none";
    updateStatus("Proctoring resumed");
  }

  let detectionTimer = null;
  async function detectionLoop() {
    if (!mediaStream || isPaused) return;
    try {
      // Face detection
      let faces = [];
      if (faceModel) {
        try {
          faces = await faceModel.estimateFaces(videoEl, {
            flipHorizontal: true,
          });
        } catch (error) {
          console.warn("Face detection error:", error);
        }
      }

      // Object detection
      let objects = [];
      if (cocoModel) {
        try {
          objects = await cocoModel.detect(videoEl);
          objects = objects.filter(
            (o) =>
              OBJECTS_OF_INTEREST.has(o.class) && o.score >= OBJECT_MIN_SCORE
          );
        } catch (error) {
          console.warn("Object detection error:", error);
        }
      }

      drawDetections(
        faces.map((f) => ({
          box: {
            xMin: f.box.xMin,
            yMin: f.box.yMin,
            width: f.box.width,
            height: f.box.height,
          },
        })),
        objects
      );

      const focus = computeFocusSignals(faces.map((f) => ({ box: f.box })));
      const now = Date.now();

      if (focus.facePresent) {
        lastFaceSeenMs = now;
        if (!focus.lookingAway) lastFocusOkMs = now;
      }

      // Looking away > threshold
      if (
        focus.facePresent &&
        focus.lookingAway &&
        lastFocusOkMs &&
        now - lastFocusOkMs > LOOK_AWAY_THRESHOLD_MS
      ) {
        if (!lookingAwayActive) {
          lookingAwayActive = true;
          addEvent("FOCUS_LOST", "User looking away > 5s");
        }
      } else if (!focus.lookingAway) {
        lookingAwayActive = false;
      }

      // No face > threshold
      if (
        !focus.facePresent &&
        lastFaceSeenMs &&
        now - lastFaceSeenMs > ABSENCE_THRESHOLD_MS
      ) {
        if (!absenceActive) {
          absenceActive = true;
          addEvent("NO_FACE", "No face detected > 10s");
        }
      } else if (focus.facePresent) {
        absenceActive = false;
      }

      // Multiple faces
      if (focus.multiFaces) {
        if (!multiFaceActive) {
          multiFaceActive = true;
          addEvent("MULTIPLE_FACES", "Multiple faces detected");
        }
      } else {
        multiFaceActive = false;
      }

      // Objects of interest
      for (const o of objects) {
        addEvent("OBJECT", `${o.class}: ${(o.score * 100).toFixed(0)}%`);
      }

      // Status text
      if (!faceModel) {
        updateStatus("Face detection unavailable");
      } else if (!focus.facePresent) {
        updateStatus("No face detected");
      } else if (focus.multiFaces) {
        updateStatus("Multiple faces detected");
      } else if (focus.lookingAway) {
        updateStatus("Looking away");
      } else {
        updateStatus("Focused");
      }

      updateSummary();
      updateSessionStats();
    } catch (err) {
      console.error(err);
    }
  }

  function startTimers() {
    startTimeMs = Date.now();
    timerInterval = setInterval(() => {
      timerEl.textContent = formatTime(msSinceStart());
    }, 250);
    detectionTimer = setInterval(detectionLoop, 1000 / SAMPLE_HZ);
  }

  function stopTimers() {
    clearInterval(timerInterval);
    clearInterval(detectionTimer);
    timerInterval = null;
    detectionTimer = null;
  }

  function resetSession() {
    lastFaceSeenMs = null;
    lastFocusOkMs = null;
    lookingAwayActive = false;
    absenceActive = false;
    multiFaceActive = false;
    isPaused = false;
    events.length = 0;
    while (logBody.firstChild) logBody.removeChild(logBody.firstChild);
    focusStatus.textContent = "Ready";
    summaryEl.textContent = "";
    pauseBtn.style.display = "inline-block";
    resumeBtn.style.display = "none";
    updateSessionStats();
  }

  // Initialize on page load
  checkHttpsRequirement();

  // Buttons
  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.textContent = "Initializing...";

    try {
      resetSession();
      currentSessionId = generateSessionId();

      // Check HTTPS requirement
      if (!checkHttpsRequirement()) {
        throw new Error("HTTPS required for camera access");
      }

      // Initialize camera first
      await initStream();

      // Load AI models
      await loadModels();

      // Start recording and detection
      startRecording();
      startTimers();
      enableControls(true);
      downloadCsvBtn.disabled = false;
      downloadPdfBtn.disabled = false;

      startBtn.textContent = "Start Proctoring";
      updateStatus("Proctoring started - Detection active");
      addEvent("SESSION_START", `Session ${currentSessionId} started`);
    } catch (e) {
      console.error("Initialization failed:", e);
      updateStatus("Initialization failed: " + e.message);
      startBtn.disabled = false;
      startBtn.textContent = "Start Interview";

      // Clean up on failure
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;
      }
    }
  });

  stopBtn.addEventListener("click", () => {
    const sessionDuration = msSinceStart();
    totalSessionTime += sessionDuration;

    // Save session data
    const sessionData = {
      id: currentSessionId,
      startTime: new Date(startTimeMs).toISOString(),
      duration: sessionDuration,
      events: [...events],
      summary: generateSessionSummary(),
    };
    sessionHistory.push(sessionData);

    addEvent(
      "SESSION_END",
      `Session ${currentSessionId} ended - Duration: ${formatTime(
        sessionDuration
      )}`
    );

    stopTimers();
    stopRecording();
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    enableControls(false);
    startBtn.disabled = false;
    updateSummary();
    updateSessionStats();

    // Auto-download report
    setTimeout(() => {
      downloadReport();
    }, 1000);
  });

  pauseBtn.addEventListener("click", () => {
    pauseProctoring();
    addEvent("SESSION_PAUSE", "Proctoring paused");
  });

  resumeBtn.addEventListener("click", () => {
    resumeProctoring();
    addEvent("SESSION_RESUME", "Proctoring resumed");
  });

  downloadCsvBtn.addEventListener("click", () => {
    const name =
      prompt("Candidate Name (optional for report):", "") || "Anonymous";
    if (name) addEvent("META", `Candidate: ${name}`);
    const csv = toCsv();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    downloadCsvBtn.href = url;
    downloadCsvBtn.download = `proctoring_report_${name}_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv`;
    // auto click for convenience
    downloadCsvBtn.click();
  });

  downloadPdfBtn.addEventListener("click", () => {
    const name =
      prompt("Candidate Name (optional for report):", "") || "Anonymous";
    if (name) addEvent("META", `Candidate: ${name}`);
    const summary = generateSessionSummary();
    generatePDF(name, summary);
  });

  // Prepare anchors for downloads
  downloadCsvBtn.tagName !== "A" &&
    (function patchAnchor(btn) {
      const a = document.createElement("a");
      a.id = "downloadCsvBtn";
      a.textContent = btn.textContent;
      a.className = btn.className;
      a.href = "#";
      a.setAttribute("download", "report.csv");
      a.disabled = btn.disabled;
      btn.replaceWith(a);
      // rebind
      document
        .getElementById("downloadCsvBtn")
        .addEventListener("click", (e) => {
          e.preventDefault();
          const name =
            prompt("Candidate Name (optional for report):", "") || "";
          if (name) addEvent("META", `Candidate: ${name}`);
          const csv = toCsv();
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          e.target.href = url;
          e.target.download = `proctoring_report_${new Date()
            .toISOString()
            .replace(/[:.]/g, "-")}.csv`;
        });
    })(downloadCsvBtn);

  downloadVideoBtn.tagName !== "A" &&
    (function patchAnchor(btn) {
      const a = document.createElement("a");
      a.id = "downloadVideoBtn";
      a.textContent = btn.textContent;
      a.className = btn.className;
      a.href = "#";
      a.setAttribute("download", "video.webm");
      a.disabled = btn.disabled;
      btn.replaceWith(a);
    })(downloadVideoBtn);
})();
