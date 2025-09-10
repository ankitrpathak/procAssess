(() => {
  const videoEl = document.getElementById("video");
  const canvasEl = document.getElementById("overlay");
  const ctx = canvasEl.getContext("2d");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const downloadCsvBtn = document.getElementById("downloadCsvBtn");
  const downloadVideoBtn = document.getElementById("downloadVideoBtn");
  const logBody = document.getElementById("logBody");
  const focusStatus = document.getElementById("focusStatus");
  const timerEl = document.getElementById("timer");
  const summaryEl = document.getElementById("summary");
  const httpsNotice = document.getElementById("httpsNotice");

  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let startTimeMs = null;
  let timerInterval = null;

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
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
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

  function enableControls(on) {
    startBtn.disabled = on;
    stopBtn.disabled = !on;
    downloadCsvBtn.disabled = !on;
  }

  let detectionTimer = null;
  async function detectionLoop() {
    if (!mediaStream) return;
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
    while (logBody.firstChild) logBody.removeChild(logBody.firstChild);
    focusStatus.textContent = "Ready";
    summaryEl.textContent = "";
  }

  // Initialize on page load
  checkHttpsRequirement();

  // Buttons
  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.textContent = "Initializing...";

    try {
      resetSession();

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

      startBtn.textContent = "Start Interview";
      updateStatus("Interview started - Detection active");
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
    stopTimers();
    stopRecording();
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    enableControls(false);
    startBtn.disabled = false;
    updateSummary();
  });

  downloadCsvBtn.addEventListener("click", () => {
    const name = prompt("Candidate Name (optional for report):", "") || "";
    if (name) addEvent("META", `Candidate: ${name}`);
    const csv = toCsv();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    downloadCsvBtn.href = url;
    downloadCsvBtn.download = `proctoring_report_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv`;
    // auto click for convenience
    downloadCsvBtn.click();
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
