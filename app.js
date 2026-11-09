(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CIRCUMFERENCE = 2 * Math.PI * 270;
  const defaultTimers = [
    { id: "one", name: "短時間", seconds: 60, color: "#4da3ff" },
    { id: "five", name: "煮菜", seconds: 300, color: "#39c6a5" },
    { id: "ten", name: "休息", seconds: 600, color: "#e5ad4e" },
    { id: "thirty", name: "運動", seconds: 1800, color: "#b28cff" }
  ];

  const stored = loadSettings();
  let timers = stored.timers || defaultTimers;
  let sound = stored.sound || { tickEnabled: true, tickVolume: 35, alarmType: "bright", alarmVolume: 75, alarmMode: "repeat" };
  let selected = timers.find(t => t.id === (stored.selectedId || "five")) || timers[1] || timers[0];
  let duration = selected.seconds;
  let remaining = duration;
  let running = false;
  let finished = false;
  let endAt = 0;
  let rafId = null;
  let tickTimer = null;
  let lastTickAt = 0;
  let audioCtx = null;
  let wakeLock = null;
  let deferredInstall = null;

  $("clockProgress").style.strokeDasharray = String(CIRCUMFERENCE);
  $("clockProgress").style.strokeDashoffset = "0";

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem("countdownClockV2") || "{}"); }
    catch (_) { return {}; }
  }
  function saveSettings() {
    localStorage.setItem("countdownClockV2", JSON.stringify({ timers, sound, selectedId: selected.id }));
  }
  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  function setStatus(text) { $("statusText").textContent = text; }
  function render() {
    $("timerDisplay").textContent = fmt(remaining);
    $("timerName").textContent = selected.name;
    $("clockProgress").style.strokeDashoffset = String(CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, remaining / duration))));
    $("clockProgress").style.stroke = selected.color;
    $("clockFill").style.setProperty("--fill-angle", `${Math.max(0, Math.min(1, remaining / duration)) * 360}deg`);
    document.documentElement.style.setProperty("--accent", selected.color);
    $("startPauseBtn").textContent = running ? "暫停" : (finished ? "再開始" : (remaining < duration ? "繼續" : "開始"));
    document.querySelectorAll(".quick-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.id === selected.id));
  }
  function renderQuickButtons() {
    const wrap = $("quickButtons");
    wrap.innerHTML = "";
    timers.forEach(timer => {
      const b = document.createElement("button");
      b.className = "quick-btn";
      b.dataset.id = timer.id;
      b.textContent = `${timer.name} ${fmt(timer.seconds)}`;
      b.addEventListener("click", () => selectTimer(timer.id, true));
      wrap.appendChild(b);
    });
    render();
  }
  function selectTimer(id, autoStart) {
    const t = timers.find(x => x.id === id);
    if (!t) return;
    stopTicker();
    running = false; finished = false;
    selected = t; duration = t.seconds; remaining = duration;
    saveSettings(); render(); setStatus("準備就緒");
    if (autoStart) start();
  }
  function getAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, start, length, volume, wave = "sine", endFreq = null) {
    const ctx = getAudio();
    if (!ctx || volume <= 0) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq), start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(.018, length / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + length + .03);
  }
  function tickSound() {
    if (!sound.tickEnabled || sound.tickVolume <= 0) return;
    const ctx = getAudio(); if (!ctx) return;
    const v = (sound.tickVolume / 100) * 0.16;
    tone(1150, ctx.currentTime, 0.035, v, "square", 850);
  }
  function tickInterval() {
    const ratio = duration ? remaining / duration : 0;
    if (ratio <= .10) return 500;
    if (ratio >= .30) return 1000;
    // 30% 時每秒一次，平順加快至 10% 時每 0.5 秒一次
    const p = (.30 - ratio) / .20;
    return 1000 - 500 * Math.max(0, Math.min(1, p));
  }
  function scheduleTick() {
    clearTimeout(tickTimer);
    if (!running || !sound.tickEnabled) return;
    const interval = tickInterval();
    const now = performance.now();
    if (!lastTickAt || now - lastTickAt >= interval) {
      tickSound(); lastTickAt = now;
    }
    tickTimer = setTimeout(scheduleTick, Math.max(40, interval - (performance.now() - lastTickAt)));
  }
  function stopTicker() { clearTimeout(tickTimer); tickTimer = null; lastTickAt = 0; }
  function playAlarmOnce() {
    const ctx = getAudio(); if (!ctx) return;
    const base = ctx.currentTime + 0.04, vol = (sound.alarmVolume / 100) * 0.34;
    const type = sound.alarmType;
    const one = (at, f, len, v = vol) => {
      if (type === "soft") {
        tone(f, at, len, v * .65, "sine", f * .94);
        tone(f * 1.5, at + .02, len * .75, v * .2, "sine");
      } else {
        tone(f, at, len, v, "sine", f * .72);
        tone(f * 2, at + .015, len * .7, v * .23, "sine");
      }
    };
    if (type === "double") {
      one(base, 880, .55); one(base + .72, 1175, .65);
    } else {
      one(base, type === "soft" ? 660 : 1046, type === "soft" ? 1.0 : .72);
    }
  }
  function playAlarm() {
    const mode = sound.alarmMode;
    const count = (mode === "repeat" || mode === "long") ? 5 : 1;
    const spacing = mode === "long" ? 1.75 : 1.65;
    for (let i = 0; i < count; i++) {
      const delay = mode === "long" ? i * spacing : (mode === "repeat" ? i * 1.65 : 0);
      if (delay === 0) playAlarmOnce();
      else setTimeout(playAlarmOnce, delay * 1000);
    }
  }
  function start() {
    if (remaining <= 0 || finished) { remaining = duration; finished = false; }
    getAudio(); running = true; endAt = Date.now() + remaining * 1000;
    setStatus("倒數進行中"); lastTickAt = 0; scheduleTick(); acquireWakeLock();
    cancelAnimationFrame(rafId); loop();
    render();
  }
  function pause() {
    if (!running) return;
    remaining = Math.max(0, (endAt - Date.now()) / 1000);
    running = false; cancelAnimationFrame(rafId); stopTicker(); releaseWakeLock();
    setStatus("已暫停"); render();
  }
  function finish() {
    running = false; finished = true; remaining = 0;
    cancelAnimationFrame(rafId); stopTicker(); releaseWakeLock();
    setStatus("時間到！"); render(); playAlarm();
  }
  function loop() {
    if (!running) return;
    remaining = Math.max(0, (endAt - Date.now()) / 1000);
    render();
    if (remaining <= 0) { finish(); return; }
    rafId = requestAnimationFrame(loop);
  }
  function restart() {
    stopTicker(); running = false; finished = false; remaining = duration;
    cancelAnimationFrame(rafId); releaseWakeLock(); setStatus("重新準備"); render();
  }
  function stop() {
    pause(); remaining = duration; finished = false; setStatus("已結束"); render();
  }
  async function acquireWakeLock() {
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (_) {}
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(()=>{}); wakeLock = null; }
  }

  $("startPauseBtn").addEventListener("click", () => running ? pause() : start());
  $("restartBtn").addEventListener("click", restart);
  $("stopBtn").addEventListener("click", stop);
  $("settingsBtn").addEventListener("click", () => {
    $("tickEnabled").checked = sound.tickEnabled;
    $("tickVolume").value = sound.tickVolume; $("tickVolumeText").textContent = sound.tickVolume + "%";
    $("alarmType").value = sound.alarmType; $("alarmVolume").value = sound.alarmVolume;
    $("alarmVolumeText").textContent = sound.alarmVolume + "%"; $("alarmMode").value = sound.alarmMode;
    $("settingsDialog").showModal();
  });
  $("settingsForm").addEventListener("submit", () => {
    sound = {
      tickEnabled: $("tickEnabled").checked,
      tickVolume: Number($("tickVolume").value),
      alarmType: $("alarmType").value,
      alarmVolume: Number($("alarmVolume").value),
      alarmMode: $("alarmMode").value
    };
    saveSettings();
    if (running) { stopTicker(); scheduleTick(); }
  });
  $("tickVolume").addEventListener("input", e => $("tickVolumeText").textContent = e.target.value + "%");
  $("alarmVolume").addEventListener("input", e => $("alarmVolumeText").textContent = e.target.value + "%");
  $("testAlarmBtn").addEventListener("click", () => {
    sound.alarmType = $("alarmType").value;
    sound.alarmVolume = Number($("alarmVolume").value);
    sound.alarmMode = $("alarmMode").value;
    playAlarm();
  });
  $("customBtn").addEventListener("click", () => $("customDialog").showModal());
  $("customForm").addEventListener("submit", (e) => {
    if (e.submitter && e.submitter.id !== "saveCustomBtn") return;
    const h = Math.max(0, Number($("customHours").value) || 0);
    const m = Math.max(0, Math.min(59, Number($("customMinutes").value) || 0));
    const s = Math.max(0, Math.min(59, Number($("customSeconds").value) || 0));
    const seconds = h * 3600 + m * 60 + s;
    if (seconds <= 0) { e.preventDefault(); alert("請輸入大於 0 秒的時間。"); return; }
    const timer = { id: "custom-" + Date.now(), name: $("customName").value.trim() || "自訂時間", seconds, color: $("customColor").value };
    timers.push(timer); renderQuickButtons(); $("customDialog").close();
    selectTimer(timer.id, true);
  });
  $("fullscreenBtn").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) { setStatus("此瀏覽器不支援全螢幕"); }
  });
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault(); deferredInstall = e; $("installBtn").classList.remove("hidden");
  });
  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null;
    $("installBtn").classList.add("hidden");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && running) {
      remaining = Math.max(0, (endAt - Date.now()) / 1000);
      if (remaining <= 0) finish(); else render();
    }
  });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }

  renderQuickButtons();
  render();
  saveSettings();
})();