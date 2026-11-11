(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const themes = [
    { name: "亮紅", bg: "#ff1744", accent: "#ff1744" }, { name: "活力橘", bg: "#ff9100", accent: "#ff9100" },
    { name: "陽光黃", bg: "#f4d600", accent: "#f4d600" }, { name: "翠綠", bg: "#00c853", accent: "#00c853" },
    { name: "亮青", bg: "#00cfe8", accent: "#00cfe8" }, { name: "電光藍", bg: "#2962ff", accent: "#2962ff" },
    { name: "鮮紫", bg: "#d500f9", accent: "#d500f9" }, { name: "桃紅", bg: "#f5008f", accent: "#f5008f" }
  ];
  const alarmNames = ["清亮鈴音", "柔和鐘聲", "雙響提示", "上揚音階", "下降音階", "古典鐘聲", "電子脈衝", "木琴提示", "水晶音", "警示節拍", "晨間和弦", "歡快旋律"];
  const defaults = Array.from({length:4}, () => ({seconds:0}));
  const stored = (() => { try { return JSON.parse(localStorage.getItem("countdownClockV2") || "{}"); } catch (_) { return {}; } })();
  let timers = Array.isArray(stored.timers) ? Array.from({length:4}, (_,i) => ({seconds: Math.max(0, Number(stored.timers[i]?.seconds)||0)})) : defaults;
  let sound = {tickEnabled:true,tickVolume:70,alarmType:"bright",alarmVolume:75,alarmMode:"repeat",...(stored.sound||{})};
  let themeIndex = Number.isInteger(stored.themeIndex) && stored.themeIndex >= 0 && stored.themeIndex < 8 ? stored.themeIndex : 0;
  let selectedIndex = Number.isInteger(stored.selectedIndex) && stored.selectedIndex >= 0 && stored.selectedIndex < 4 ? stored.selectedIndex : -1;
  let duration = selectedIndex >= 0 ? timers[selectedIndex].seconds : 0, remaining = duration;
  let running=false, finished=false, endAt=0, rafId=null, tickTimer=null, lastTickAt=0, audioCtx=null, wakeLock=null, deferredInstall=null;
  const alarmPatterns = [
    [[1047,.16],[1319,.22],[1568,.42]], [[659,.55],[784,.65]], [[880,.22],[660,.22],[880,.5]], [[523,.18],[659,.18],[784,.18],[1047,.45]],
    [[1047,.2],[784,.2],[659,.2],[523,.45]], [[784,.32],[988,.32],[1175,.65]], [[1200,.09],[0,.08],[1200,.09],[0,.08],[1500,.3]],
    [[784,.2],[988,.2],[1175,.35],[988,.5]], [[1319,.25],[1760,.3],[1568,.45]], [[880,.12],[0,.1],[880,.12],[0,.1],[880,.35]],
    [[523,.23],[659,.23],[784,.23],[1047,.65]], [[659,.18],[784,.18],[988,.18],[1319,.25],[1047,.45]]
  ];
  function save(){localStorage.setItem("countdownClockV2",JSON.stringify({timers,sound,themeIndex,selectedIndex}));}
  function fmt(n){n=Math.max(0,Math.ceil(n));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return h?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;}
  function setStatus(s){$("statusText").textContent=s;}
  function render(){
    $("timerDisplay").textContent=fmt(remaining); document.documentElement.style.setProperty("--accent",themes[themeIndex].accent);
    const fill = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
    $("clockFill").style.height = `${fill * 100}%`;
    $("startPauseBtn").textContent=running?"暫停":(finished?"再開始":(remaining>0&&remaining<duration?"繼續":"開始"));
    document.querySelectorAll(".quick-btn").forEach((b,i)=>b.classList.toggle("active",i===selectedIndex));
  }
  function renderSlots(){
    const wrap=$("quickButtons");wrap.innerHTML="";
    timers.forEach((t,i)=>{const b=document.createElement("button");b.className="quick-btn";b.dataset.index=i;b.textContent=t.seconds?fmt(t.seconds):"設定";b.setAttribute("aria-label",`第 ${i+1} 組：${t.seconds?fmt(t.seconds):"未設定"}`);b.disabled=!t.seconds;b.addEventListener("click",()=>selectSlot(i,true));wrap.appendChild(b);});render();
  }
  function selectSlot(i,autoStart){const t=timers[i];if(!t||!t.seconds)return;stopTicker();running=false;finished=false;selectedIndex=i;duration=t.seconds;remaining=duration;save();setStatus("準備就緒");render();if(autoStart)start();}
  function getAudio(){if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;audioCtx=new AC();}if(audioCtx.state==="suspended")audioCtx.resume();return audioCtx;}
  function tone(freq,start,length,volume,wave="sine",endFreq=null){const ctx=getAudio();if(!ctx||volume<=0||freq<=0)return;const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=wave;osc.frequency.setValueAtTime(freq,start);if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),start+length);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),start+Math.min(.012,length/4));gain.gain.exponentialRampToValueAtTime(.0001,start+length);osc.connect(gain);gain.connect(ctx.destination);osc.start(start);osc.stop(start+length+.02);}
  function tickSound(){if(!sound.tickEnabled||sound.tickVolume<=0)return;const ctx=getAudio();if(!ctx)return; // Raised, band-limited tick with a soft peak ceiling to keep max setting clear without clipping.
    const v=.34*Math.sqrt(sound.tickVolume/100);tone(1250,ctx.currentTime,.045,v,"triangle",920);}
  function tickInterval(){const r=duration?remaining/duration:0;if(r<=.10)return 500;if(r>=.30)return 1000;return 1000-500*(.30-r)/.20;}
  function scheduleTick(){clearTimeout(tickTimer);if(!running||!sound.tickEnabled)return;const interval=tickInterval(),now=performance.now();if(!lastTickAt||now-lastTickAt>=interval){tickSound();lastTickAt=now;}tickTimer=setTimeout(scheduleTick,Math.max(40,interval-(performance.now()-lastTickAt)));}
  function stopTicker(){clearTimeout(tickTimer);tickTimer=null;lastTickAt=0;}
  function playAlarmOnce(){const ctx=getAudio();if(!ctx)return;const pattern=alarmPatterns[alarmNames.indexOf(sound.alarmType)>=0?alarmNames.indexOf(sound.alarmType):0],vol=(sound.alarmVolume/100)*.26;let at=ctx.currentTime+.04;pattern.forEach(([f,d])=>{if(f) {tone(f,at,d,vol,"sine",f*.98);tone(f*2,at,d*.72,vol*.18,"sine");}at+=d+.04;});}
  function playAlarm(){const count=sound.alarmMode==="once"?1:5,spacing=sound.alarmMode==="long"?1.75:1.65;for(let i=0;i<count;i++)if(i===0)playAlarmOnce();else setTimeout(playAlarmOnce,i*spacing*1000);}
  function start(){if(selectedIndex<0||!duration){setStatus("請先編輯並選擇時間");return;}if(remaining<=0||finished){remaining=duration;finished=false;}getAudio();running=true;endAt=Date.now()+remaining*1000;setStatus("倒數進行中");lastTickAt=0;scheduleTick();acquireWakeLock();cancelAnimationFrame(rafId);loop();render();}
  function pause(){if(!running)return;remaining=Math.max(0,(endAt-Date.now())/1000);running=false;cancelAnimationFrame(rafId);stopTicker();releaseWakeLock();setStatus("已暫停");render();}
  function finish(){running=false;finished=true;remaining=0;cancelAnimationFrame(rafId);stopTicker();releaseWakeLock();setStatus("時間到！");render();playAlarm();}
  function loop(){if(!running)return;remaining=Math.max(0,(endAt-Date.now())/1000);render();if(remaining<=0){finish();return;}rafId=requestAnimationFrame(loop);}
  function restart(){stopTicker();running=false;finished=false;remaining=duration;cancelAnimationFrame(rafId);releaseWakeLock();setStatus(duration?"重新準備":"請設定時間");render();}
  function stop(){pause();remaining=duration;finished=false;setStatus(duration?"已結束":"請設定時間");render();}
  async function acquireWakeLock(){try{if("wakeLock" in navigator)wakeLock=await navigator.wakeLock.request("screen");}catch(_){}}
  function releaseWakeLock(){if(wakeLock){wakeLock.release().catch(()=>{});wakeLock=null;}}
  function openTimerEditor(){const wrap=$("timerFields");wrap.innerHTML="";timers.forEach((t,i)=>{const row=document.createElement("div");row.className="timer-edit-row";row.innerHTML=`<span class="slot-number">${i+1}</span><label class="field">時<input data-part="h" data-slot="${i}" type="number" min="0" max="99" value="${Math.floor(t.seconds/3600)}"></label><label class="field">分<input data-part="m" data-slot="${i}" type="number" min="0" max="59" value="${Math.floor(t.seconds%3600/60)}"></label><label class="field">秒<input data-part="s" data-slot="${i}" type="number" min="0" max="59" value="${t.seconds%60}"></label>`;wrap.appendChild(row);});$("timerDialog").showModal();}
  $("startPauseBtn").addEventListener("click",()=>running?pause():start());$("restartBtn").addEventListener("click",restart);$("stopBtn").addEventListener("click",stop);
  $("settingsBtn").addEventListener("click",()=>{$("tickEnabled").checked=sound.tickEnabled;$("tickVolume").value=sound.tickVolume;$("tickVolumeText").textContent=sound.tickVolume+"%";$("alarmType").value=sound.alarmType;$("alarmVolume").value=sound.alarmVolume;$("alarmVolumeText").textContent=sound.alarmVolume+"%";$("alarmMode").value=sound.alarmMode;$("settingsDialog").showModal();});
  $("settingsForm").addEventListener("submit",()=>{sound={tickEnabled:$("tickEnabled").checked,tickVolume:Number($("tickVolume").value),alarmType:$("alarmType").value,alarmVolume:Number($("alarmVolume").value),alarmMode:$("alarmMode").value};save();if(running){stopTicker();scheduleTick();}});
  $("alarmType").innerHTML=alarmNames.map((n,i)=>`<option value="${n}">${String(i+1).padStart(2,"0")} · ${n}</option>`).join("");if(!alarmNames.includes(sound.alarmType))sound.alarmType=alarmNames[0];
  $("tickVolume").addEventListener("input",e=>$("tickVolumeText").textContent=e.target.value+"%");$("alarmVolume").addEventListener("input",e=>$("alarmVolumeText").textContent=e.target.value+"%");
  $("testAlarmBtn").addEventListener("click",()=>{sound.alarmType=$("alarmType").value;sound.alarmVolume=Number($("alarmVolume").value);sound.alarmMode="once";playAlarmOnce();});
  $("editTimerBtn").addEventListener("click",openTimerEditor);
  $("timerForm").addEventListener("submit",e=>{if(e.submitter&&e.submitter.id!=="saveTimersBtn")return;const vals=Array.from({length:4},(_,i)=>{const v=p=>Number($("timerFields").querySelector(`[data-slot="${i}"][data-part="${p}"]`).value)||0;return Math.max(0,Math.min(99,v("h")))*3600+Math.max(0,Math.min(59,v("m")))*60+Math.max(0,Math.min(59,v("s")));});timers=vals.map(seconds=>({seconds}));if(selectedIndex>=0&&!timers[selectedIndex].seconds){selectedIndex=-1;duration=remaining=0;running=false;stopTicker();}else if(selectedIndex>=0){duration=remaining=timers[selectedIndex].seconds;}save();renderSlots();setStatus("時間已儲存");$("timerDialog").close();});
  $("themeButtons").innerHTML=themes.map((t,i)=>`<button type="button" class="theme-swatch${i===themeIndex?" active":""}" style="--swatch:${t.bg}" title="${t.name}" aria-label="${t.name}" data-theme="${i}"></button>`).join("");
  $("themeButtons").addEventListener("click",e=>{const b=e.target.closest("[data-theme]");if(!b)return;themeIndex=Number(b.dataset.theme);save();document.querySelectorAll(".theme-swatch").forEach((x,i)=>x.classList.toggle("active",i===themeIndex));render();});
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").classList.remove("hidden");});$("installBtn").addEventListener("click",async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").classList.add("hidden");});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&running){remaining=Math.max(0,(endAt-Date.now())/1000);if(remaining<=0)finish();else render();}});
  if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  renderSlots();render();
})();
