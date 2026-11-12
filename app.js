(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const themes = [
    { name: "亮紅", bg: "#ff1744", accent: "#ff1744", ink: "#10131a" }, { name: "活力橘", bg: "#ff9100", accent: "#ff9100", ink: "#10131a" },
    { name: "陽光黃", bg: "#f4d600", accent: "#f4d600", ink: "#10131a" }, { name: "翠綠", bg: "#00c853", accent: "#00c853", ink: "#10131a" },
    { name: "亮青", bg: "#00cfe8", accent: "#00cfe8", ink: "#10131a" }, { name: "電光藍", bg: "#2962ff", accent: "#2962ff", ink: "#ffffff" },
    { name: "鮮紫", bg: "#d500f9", accent: "#d500f9", ink: "#10131a" }, { name: "桃紅", bg: "#f5008f", accent: "#f5008f", ink: "#10131a" }
  ];
  const alarmNames = ["清亮鈴音", "柔和鐘聲", "雙響提示", "上揚音階", "下降音階", "古典鐘聲", "電子脈衝", "木琴提示", "水晶音", "警示節拍", "晨間和弦", "歡快旋律", "傳統鬧鐘", "雙鈴急響", "電子蜂鳴", "清晨警報", "急促上行", "三段警鈴", "金屬鬧鈴", "高頻喚醒"];
  const defaults = Array.from({length:4}, () => ({seconds:0}));
  const stored = (() => { try { return JSON.parse(localStorage.getItem("countdownClockV2") || "{}"); } catch (_) { return {}; } })();
  let timers = Array.isArray(stored.timers) ? Array.from({length:4}, (_,i) => ({seconds: Math.max(0, Number(stored.timers[i]?.seconds)||0)})) : defaults;
  let sound = {tickEnabled:true,tickVolume:70,alarmType:"bright",alarmVolume:75,alarmMode:"repeat",...(stored.sound||{})};
  let themeIndex = Number.isInteger(stored.themeIndex) && stored.themeIndex >= 0 && stored.themeIndex < 8 ? stored.themeIndex : 0;
  const textColorChoices=[{name:"黑色",color:"#111111"},{name:"白色",color:"#ffffff"},{name:"淺灰",color:"#d9dde3"},{name:"深灰",color:"#4b5563"},{name:"粉紅",color:"#ff6fae"},{name:"亮黃",color:"#ffe45e"},{name:"天空藍",color:"#70d6ff"},{name:"薄荷綠",color:"#7cffb2"}];
  let buttonTextColor=textColorChoices.some(c=>c.color===String(stored.buttonTextColor))?String(stored.buttonTextColor):themes[themeIndex].ink;
  const sizeOptions=["small","normal","medium","mediumLarge","large"],savedTextSizes=stored.textSizes||{};
  const readTextSize=k=>sizeOptions.includes(savedTextSizes[k])?savedTextSizes[k]:"normal";
  let textSizes={clockDigit:readTextSize("clockDigit"),slotDigit:readTextSize("slotDigit"),controlText:readTextSize("controlText"),settingsIcon:readTextSize("settingsIcon")};
  let runningTimeColor=textColorChoices.some(c=>c.color===String(stored.runningTimeColor))?String(stored.runningTimeColor):"#ff6fae";
  let clockSize = ["0.6","0.7","0.8","0.9","fullscreen"].includes(String(stored.clockSize)) ? String(stored.clockSize) : "0.9";
  let selectedIndex = Number.isInteger(stored.selectedIndex) && stored.selectedIndex >= 0 && stored.selectedIndex < 4 ? stored.selectedIndex : -1;
  let editingSlotIndex = 0;
  let duration = selectedIndex >= 0 ? timers[selectedIndex].seconds : 0, remaining = duration;
  let running=false, finished=false, endAt=0, rafId=null, tickTimer=null, lastTickAt=0, audioCtx=null, alarmBus=null, alarmLimiter=null, alarmTimeouts=[], wakeLock=null, deferredInstall=null;
  const alarmPatterns = [
    [[1047,.16],[1319,.22],[1568,.42]], [[659,.55],[784,.65]], [[880,.22],[660,.22],[880,.5]], [[523,.18],[659,.18],[784,.18],[1047,.45]],
    [[1047,.2],[784,.2],[659,.2],[523,.45]], [[784,.32],[988,.32],[1175,.65]], [[1200,.09],[0,.08],[1200,.09],[0,.08],[1500,.3]],
    [[784,.2],[988,.2],[1175,.35],[988,.5]], [[1319,.25],[1760,.3],[1568,.45]], [[880,.12],[0,.1],[880,.12],[0,.1],[880,.35]],
    [[523,.23],[659,.23],[784,.23],[1047,.65]], [[659,.18],[784,.18],[988,.18],[1319,.25],[1047,.45]],
    [[880,.12],[0,.06],[880,.12],[0,.06],[988,.12],[0,.06],[880,.12],[0,.06],[988,.3]],
    [[784,.16],[988,.16],[784,.16],[988,.16],[1175,.32],[988,.16],[1175,.32]],
    [[1320,.18],[0,.07],[1320,.18],[0,.07],[1568,.2],[0,.07],[1320,.36]],
    [[740,.2],[0,.08],[740,.2],[0,.08],[988,.2],[0,.08],[740,.2],[0,.08],[988,.4]],
    [[523,.13],[659,.13],[784,.13],[988,.13],[1175,.22],[988,.13],[1175,.3]],
    [[1047,.12],[0,.05],[1047,.12],[0,.05],[784,.12],[0,.05],[1047,.12],[0,.05],[784,.3]],
    [[1568,.17],[1319,.17],[1568,.17],[1319,.17],[1760,.28],[1568,.38]],
    [[988,.14],[740,.14],[988,.14],[740,.14],[1175,.14],[880,.14],[1175,.32]]
  ];
  function save(){localStorage.setItem("countdownClockV2",JSON.stringify({timers,sound,themeIndex,clockSize,buttonTextColor,runningTimeColor,textSizes,selectedIndex}));}
  function applyClockSize(){$("app").dataset.clockSize=clockSize;}
  function applyTextSizes(){const app=$("app");app.dataset.clockDigitSize=textSizes.clockDigit;app.dataset.slotDigitSize=textSizes.slotDigit;app.dataset.controlTextSize=textSizes.controlText;app.dataset.settingsIconSize=textSizes.settingsIcon;}
  function fmt(n){n=Math.max(0,Math.ceil(n));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return h?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;}
  function setStatus(s){$("statusText").textContent=s;}
  function render(){
    const timeText=fmt(remaining), display=$("timerDisplay");display.textContent=timeText;display.classList.toggle("wide-time",timeText.length>5);document.documentElement.style.setProperty("--accent",themes[themeIndex].accent);document.documentElement.style.setProperty("--clock-theme-bg",themes[themeIndex].bg);document.documentElement.style.setProperty("--clock-theme-ink",buttonTextColor);document.documentElement.style.setProperty("--running-time-ink",runningTimeColor);
    $("app").dataset.running=running?"true":"false";
    const fill = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
    $("clockFill").style.height = `${fill * 100}%`;
    $("startPauseBtn").textContent=running?"暫停":(finished?"再開始":(remaining>0&&remaining<duration?"繼續":"開始"));
    document.querySelectorAll(".quick-btn").forEach((b,i)=>{b.classList.toggle("active",i===selectedIndex);b.classList.toggle("running",running&&i===selectedIndex);});
  }
  function renderSlots(){
    const wrap=$("quickButtons");wrap.innerHTML="";
    timers.forEach((t,i)=>{
      const b=document.createElement("button");b.className="quick-btn";b.dataset.index=i;const label=document.createElement("span");label.className="slot-time";label.textContent=t.seconds?fmt(t.seconds):"--:--";b.classList.toggle("long-time",label.textContent.length>5);b.appendChild(label);b.setAttribute("aria-label",`第 ${i+1} 組：${t.seconds?fmt(t.seconds):"未設定，長按兩秒編輯"}`);
      let holdTimer=null, keyboardHoldTimer=null, didLongPress=false;
      const beginHold=()=>{didLongPress=false;clearTimeout(holdTimer);holdTimer=setTimeout(()=>{didLongPress=true;openTimerEditor(i);setTimeout(()=>{didLongPress=false;},1000);},1000);};
      const clearHold=()=>{clearTimeout(holdTimer);clearTimeout(keyboardHoldTimer);};
      b.addEventListener("pointerdown",e=>{if(e.button!==undefined&&e.button!==0)return;try{b.setPointerCapture(e.pointerId);}catch(_){}beginHold();});
      ["pointerup","pointercancel","lostpointercapture"].forEach(type=>b.addEventListener(type,clearHold));
      b.addEventListener("keydown",e=>{if(e.code==="Space"&&!e.repeat){e.preventDefault();didLongPress=false;keyboardHoldTimer=setTimeout(()=>{didLongPress=true;openTimerEditor(i);setTimeout(()=>{didLongPress=false;},1000);},1000);}});
      b.addEventListener("keyup",e=>{if(e.code==="Space")clearHold();});
      b.addEventListener("contextmenu",e=>e.preventDefault());
      b.addEventListener("click",()=>{if(didLongPress){didLongPress=false;return;}if(!t.seconds){setStatus("長按這組時間兩秒即可編輯");return;}selectSlot(i,true);});
      wrap.appendChild(b);
    });render();
  }
  function selectSlot(i,autoStart){const t=timers[i];if(!t||!t.seconds)return;stopTicker();running=false;finished=false;selectedIndex=i;duration=t.seconds;remaining=duration;save();setStatus("準備就緒");render();if(autoStart)start();}
  function getAudio(){if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;audioCtx=new AC();}if(audioCtx.state==="suspended")audioCtx.resume();return audioCtx;}
  function tone(freq,start,length,volume,wave="sine",endFreq=null,bus=null){const ctx=getAudio();if(!ctx||volume<=0||freq<=0)return;const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=wave;osc.frequency.setValueAtTime(freq,start);if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),start+length);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+Math.min(.012,length/4));gain.gain.exponentialRampToValueAtTime(.0001,start+length);osc.connect(gain);gain.connect(bus||ctx.destination);osc.start(start);osc.stop(start+length+.02);}
  function tickSound(){if(!sound.tickEnabled||sound.tickVolume<=0)return;const ctx=getAudio();if(!ctx)return; // Raised, band-limited tick with a soft peak ceiling to keep max setting clear without clipping.
    const v=.408*Math.sqrt(sound.tickVolume/100);tone(1250,ctx.currentTime,.045,v,"triangle",920);}
  function tickInterval(){const r=duration?remaining/duration:0;if(r<=.10)return 500;if(r>=.30)return 1000;return 1000-500*(.30-r)/.20;}
  function scheduleTick(){clearTimeout(tickTimer);if(!running||!sound.tickEnabled)return;const interval=tickInterval(),now=performance.now();if(!lastTickAt||now-lastTickAt>=interval){tickSound();lastTickAt=now;}tickTimer=setTimeout(scheduleTick,Math.max(40,interval-(performance.now()-lastTickAt)));}
  function stopTicker(){clearTimeout(tickTimer);tickTimer=null;lastTickAt=0;}
  function getAlarmBus(){const ctx=getAudio();if(!ctx)return null;if(!alarmBus){alarmBus=ctx.createGain();alarmBus.gain.value=1;alarmLimiter=ctx.createDynamicsCompressor();alarmLimiter.threshold.value=-2;alarmLimiter.knee.value=0;alarmLimiter.ratio.value=20;alarmLimiter.attack.value=.002;alarmLimiter.release.value=.08;alarmBus.connect(alarmLimiter);alarmLimiter.connect(ctx.destination);}return alarmBus;}
  function stopAlarm(){alarmTimeouts.forEach(clearTimeout);alarmTimeouts=[];if(alarmBus&&audioCtx){alarmBus.gain.cancelScheduledValues(audioCtx.currentTime);alarmBus.gain.setTargetAtTime(0,audioCtx.currentTime,.006);}}
  function playAlarmOnce(){const ctx=getAudio(),bus=getAlarmBus();if(!ctx||!bus)return;bus.gain.cancelScheduledValues(ctx.currentTime);bus.gain.setValueAtTime(1,ctx.currentTime);const index=Math.max(0,alarmNames.indexOf(sound.alarmType)),pattern=alarmPatterns[index],wave=index>=12?(index%2?"sawtooth":"square"):"sine",vol=(sound.alarmVolume/100)*.39;let at=ctx.currentTime+.04;pattern.forEach(([f,d])=>{if(f) {tone(f,at,d,vol,wave,f*.98,bus);tone(f*2,at,d*.72,vol*.2,"sine",null,bus);}at+=d+.04;});}
  function playAlarm(){stopAlarm();const count=sound.alarmMode==="once"?1:5,spacing=sound.alarmMode==="long"?1.75:1.65;for(let i=0;i<count;i++)if(i===0)playAlarmOnce();else alarmTimeouts.push(setTimeout(playAlarmOnce,i*spacing*1000));}
  function start(){if(selectedIndex<0||!duration){setStatus("請先編輯並選擇時間");return;}if(remaining<=0||finished){remaining=duration;finished=false;}getAudio();running=true;endAt=Date.now()+remaining*1000;setStatus("倒數進行中");lastTickAt=0;scheduleTick();acquireWakeLock();cancelAnimationFrame(rafId);loop();render();}
  function pause(){if(!running)return;remaining=Math.max(0,(endAt-Date.now())/1000);running=false;cancelAnimationFrame(rafId);stopTicker();releaseWakeLock();setStatus("已暫停");render();}
  function finish(){running=false;finished=true;remaining=0;cancelAnimationFrame(rafId);stopTicker();releaseWakeLock();setStatus("時間到！");render();playAlarm();}
  function loop(){if(!running)return;remaining=Math.max(0,(endAt-Date.now())/1000);render();if(remaining<=0){finish();return;}rafId=requestAnimationFrame(loop);}
  function restart(){stopTicker();running=false;finished=false;remaining=duration;cancelAnimationFrame(rafId);releaseWakeLock();setStatus(duration?"重新準備":"請設定時間");render();}
  function stop(){pause();remaining=duration;finished=false;setStatus(duration?"已結束":"請設定時間");render();}
  async function acquireWakeLock(){try{if("wakeLock" in navigator)wakeLock=await navigator.wakeLock.request("screen");}catch(_){}}
  function releaseWakeLock(){if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null;}}
  function openTimerEditor(i){editingSlotIndex=i;if(running&&selectedIndex===i)pause();const t=timers[i],wrap=$("timerFields");$("timerDialogTitle").textContent=`設定第 ${i+1} 組時間`;wrap.innerHTML="";const row=document.createElement("div");row.className="timer-edit-row";row.innerHTML=`<label class="field">時<input data-part="h" type="number" min="0" max="99" value="${Math.floor(t.seconds/3600)}"></label><label class="field">分<input data-part="m" type="number" min="0" max="59" value="${Math.floor(t.seconds%3600/60)}"></label><label class="field">秒<input data-part="s" type="number" min="0" max="59" value="${t.seconds%60}"></label>`;wrap.appendChild(row);$("timerDialog").showModal();}
  $("startPauseBtn").addEventListener("click",()=>running?pause():start());$("restartBtn").addEventListener("click",restart);$("stopBtn").addEventListener("click",stop);
  $("settingsBtn").addEventListener("click",()=>{$("tickEnabled").checked=sound.tickEnabled;$("tickVolume").value=sound.tickVolume;$("tickVolumeText").textContent=sound.tickVolume+"%";$("alarmType").value=sound.alarmType;$("alarmVolume").value=sound.alarmVolume;$("alarmVolumeText").textContent=sound.alarmVolume+"%";$("alarmMode").value=sound.alarmMode;$("clockSize").value=clockSize;$("clockDigitSize").value=textSizes.clockDigit;$("slotDigitSize").value=textSizes.slotDigit;$("controlTextSize").value=textSizes.controlText;$("settingsIconSize").value=textSizes.settingsIcon;$("settingsDialog").showModal();});
  $("clockSize").addEventListener("change",()=>{clockSize=$("clockSize").value;applyClockSize();save();});
  $("textColorButtons").innerHTML=textColorChoices.map(c=>`<button type="button" class="theme-swatch text-color-swatch${c.color===buttonTextColor?" active":""}" style="--swatch:${c.color}" title="${c.name}" aria-label="${c.name}" data-text-color="${c.color}"></button>`).join("");
  $("textColorButtons").addEventListener("click",e=>{const b=e.target.closest("[data-text-color]");if(!b)return;buttonTextColor=b.dataset.textColor;document.querySelectorAll(".text-color-swatch").forEach(x=>x.classList.toggle("active",x.dataset.textColor===buttonTextColor));render();save();});
  $("runningColorButtons").innerHTML=textColorChoices.map(c=>`<button type="button" class="theme-swatch running-color-swatch${c.color===runningTimeColor?" active":""}" style="--swatch:${c.color}" title="${c.name}" aria-label="${c.name}" data-running-color="${c.color}"></button>`).join("");
  $("runningColorButtons").addEventListener("click",e=>{const b=e.target.closest("[data-running-color]");if(!b)return;runningTimeColor=b.dataset.runningColor;document.querySelectorAll(".running-color-swatch").forEach(x=>x.classList.toggle("active",x.dataset.runningColor===runningTimeColor));render();save();});
  const sizeInputMap={clockDigit:"clockDigitSize",slotDigit:"slotDigitSize",controlText:"controlTextSize",settingsIcon:"settingsIconSize"};
  Object.entries(sizeInputMap).forEach(([key,id])=>$(id).addEventListener("change",()=>{textSizes[key]=$(id).value;applyTextSizes();save();}));
  $("settingsForm").addEventListener("submit",()=>{sound={tickEnabled:$("tickEnabled").checked,tickVolume:Number($("tickVolume").value),alarmType:$("alarmType").value,alarmVolume:Number($("alarmVolume").value),alarmMode:$("alarmMode").value};clockSize=$("clockSize").value;Object.entries(sizeInputMap).forEach(([key,id])=>textSizes[key]=$(id).value);applyClockSize();applyTextSizes();render();save();if(running){stopTicker();scheduleTick();}});
  $("alarmType").innerHTML=alarmNames.map((n,i)=>`<option value="${n}">${String(i+1).padStart(2,"0")} · ${n}</option>`).join("");if(!alarmNames.includes(sound.alarmType))sound.alarmType=alarmNames[0];
  $("tickVolume").addEventListener("input",e=>$("tickVolumeText").textContent=e.target.value+"%");$("alarmVolume").addEventListener("input",e=>$("alarmVolumeText").textContent=e.target.value+"%");
  $("testAlarmBtn").addEventListener("click",()=>{sound.alarmType=$("alarmType").value;sound.alarmVolume=Number($("alarmVolume").value);playAlarmOnce();});
  $("timerForm").addEventListener("submit",e=>{if(e.submitter&&e.submitter.id!=="saveTimersBtn")return;const v=p=>Number($("timerFields").querySelector(`[data-part="${p}"]`).value)||0;const seconds=Math.max(0,Math.min(99,v("h")))*3600+Math.max(0,Math.min(59,v("m")))*60+Math.max(0,Math.min(59,v("s")));timers[editingSlotIndex]={seconds};if(selectedIndex===editingSlotIndex){if(seconds){duration=remaining=seconds;}else{selectedIndex=-1;duration=remaining=0;finished=false;}}save();renderSlots();setStatus("時間已儲存");$("timerDialog").close();});
  $("themeButtons").innerHTML=themes.map((t,i)=>`<button type="button" class="theme-swatch${i===themeIndex?" active":""}" style="--swatch:${t.bg}" title="${t.name}" aria-label="${t.name}" data-theme="${i}"></button>`).join("");
  $("themeButtons").addEventListener("click",e=>{const b=e.target.closest("[data-theme]");if(!b)return;themeIndex=Number(b.dataset.theme);save();document.querySelectorAll(".theme-swatch").forEach((x,i)=>x.classList.toggle("active",i===themeIndex));render();});
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").classList.remove("hidden");});$("installBtn").addEventListener("click",async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").classList.add("hidden");});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&running){remaining=Math.max(0,(endAt-Date.now())/1000);if(remaining<=0)finish();else render();}});
  document.addEventListener("pointerdown",e=>{if(e.target.closest("button"))stopAlarm();},true);
  document.addEventListener("click",e=>{if(e.target.closest("button"))stopAlarm();},true);
  document.addEventListener("keydown",()=>stopAlarm(),true);
  if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  applyClockSize();applyTextSizes();renderSlots();render();
})();
