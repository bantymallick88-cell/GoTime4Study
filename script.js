/* ============================================================
   GoTime4Study — script.js
   Modules: Store · Timer · AmbientAudio · Music · Rooms ·
            Stats · Badges · Scenes · Mistakes · StrictFocus · UI
   ============================================================ */
'use strict';

/* ════════════════════════════════════════════════════════════
   1. STORE — persistent state (localStorage)
   ════════════════════════════════════════════════════════════ */
const Store = (() => {
  const KEY = 'gt4s_v1';
  const defaults = {
    theme: 'dark',
    settings: { focus: 25, short: 5, long: 15, custom: 45, rounds: 4, autoStart: false, chime: true, volume: 70, strictMode: false },
    sessions: {},
    sessionsCount: {},
    profile: { nick: '', avatar: '🦉' },
    badges: [],
    scene: null,
    gradient: true,
    spotify: '',
    lb: {},
    subject: '',
    subjectsList: ['Mathematics', 'Physics', 'Computer Science', 'Biology', 'Literature'],
    subjectLogs: {},
    journal: [],
    journalPin: '0000',
    strictInfractions: 0,
  };
  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(defaults);
      return { ...structuredClone(defaults), ...JSON.parse(raw) };
    } catch { return structuredClone(defaults); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }

  return {
    get d() { return data; },
    save,
    todayKey() { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; },
    addFocus(sec) {
      const k = this.todayKey();
      data.sessions[k] = (data.sessions[k] || 0) + sec / 60;
      if (data.subject) {
        const logEntry = { subject: data.subject, minutes: sec / 60, timestamp: Date.now() };
        data.subjectLogs[k] = data.subjectLogs[k] || [];
        data.subjectLogs[k].push(logEntry);
      }
      save();
      try { if (typeof SubjectLogger !== 'undefined' && SubjectLogger.render) SubjectLogger.render(); } catch {}
    },
    addSessionCount() {
      const k = this.todayKey();
      data.sessionsCount[k] = (data.sessionsCount[k] || 0) + 1;
      save();
    },
    reset() { data = structuredClone(defaults); save(); },
  };
})();

/* ════════════════════════════════════════════════════════════
   2. HELPERS
   ════════════════════════════════════════════════════════════ */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtMin(min) {
  min = Math.round(min);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function esc(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg, kind = '') {
  const container = $('#toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 380); }, 3400);
}

/* ════════════════════════════════════════════════════════════
   3. CHIME — synthesized end-of-session sounds (no assets)
   ════════════════════════════════════════════════════════════ */
const Chime = (() => {
  let ctx = null;
  const getCtx = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

  function bell(freq, when, dur = 1.4, vol = 0.5) {
    const c = getCtx(), t = c.currentTime + when;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t); osc.stop(t + dur + 0.1);
  }
  return {
    sessionEnd() {
      if (!Store.d.settings.chime) return;
      const v = (Store.d.settings.volume / 100) * 0.5;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, i * 0.16, 1.6, v));
    },
    breakEnd() {
      if (!Store.d.settings.chime) return;
      const v = (Store.d.settings.volume / 100) * 0.5;
      [783.99, 659.25].forEach((f, i) => bell(f, i * 0.18, 1.2, v));
    },
    customComplete() {
      if (!Store.d.settings.chime) return;
      const v = (Store.d.settings.volume / 100) * 0.5;
      [329.63, 392.00, 493.88, 587.33, 783.99].forEach((f, i) => bell(f, i * 0.1, 0.8, v));
    },
    tick() { bell(880, 0, 0.12, (Store.d.settings.volume / 100) * 0.18); },
  };
})();

/* ════════════════════════════════════════════════════════════
   4. AMBIENT AUDIO — procedurally generated nature sounds
   ════════════════════════════════════════════════════════════ */
const Ambient = (() => {
  const SOUNDS = [
    { id: 'rain',   emoji: '🌧️', name: 'Rain' },
    { id: 'forest', emoji: '🌲', name: 'Forest' },
    { id: 'cafe',   emoji: '☕', name: 'Café' },
    { id: 'waves',  emoji: '🌊', name: 'Waves' },
    { id: 'white',  emoji: '🌫️', name: 'White noise' },
    { id: 'fire',   emoji: '🔥', name: 'Fireplace' },
  ];
  let ctx = null, master = null;
  const nodes = {};

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 1;
    master.connect(ctx.destination);
  }

  function noiseBuffer(seconds = 4) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function loopNoise(filterType, freq, q = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(); src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType; filt.frequency.value = freq; filt.Q.value = q;
    src.connect(filt);
    return { src, out: filt };
  }

  function build(id) {
    stopSound(id);
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
    const n = { gain: g, sources: [], timers: [], audioEls: [] };
    nodes[id] = n;

    if (id === 'rain') {
      const { src, out } = loopNoise('lowpass', 900, 0.4); out.connect(g); src.start(); n.sources.push(src);
      n.timers.push(setInterval(() => {
        if (!nodes[id] || !ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 1200 + Math.random() * 1800;
        og.gain.setValueAtTime(0.03 * Math.random(), t);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        o.connect(og).connect(g); o.start(t); o.stop(t + 0.1);
      }, 300));
    }
    if (id === 'forest') {
      const { src, out } = loopNoise('bandpass', 500, 0.5); out.connect(g); src.start(); n.sources.push(src);
      n.timers.push(setInterval(() => {
        if (!nodes[id] || !ctx) return;
        const t = ctx.currentTime, base = 1800 + Math.random() * 1500;
        [0, 0.09, 0.18].slice(0, 2 + Math.floor(Math.random() * 2)).forEach((off) => {
          const o = ctx.createOscillator(), og = ctx.createGain();
          o.type = 'sine'; o.frequency.value = base + Math.random() * 500;
          og.gain.setValueAtTime(0.05, t + off);
          og.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.09);
          o.connect(og).connect(g); o.start(t + off); o.stop(t + off + 0.12);
        });
      }, 2600));
    }
    if (id === 'cafe') {
      const { src, out } = loopNoise('lowpass', 480, 0.3); out.connect(g); src.start(); n.sources.push(src);
      const { src: s2, out: o2 } = loopNoise('lowpass', 150, 0.2);
      const mg = ctx.createGain(); mg.gain.value = 0.7; o2.connect(mg).connect(g); s2.start(); n.sources.push(s2);
    }
    if (id === 'waves') {
      const { src, out } = loopNoise('lowpass', 620, 0.4); out.connect(g); src.start(); n.sources.push(src);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.09; lg.gain.value = 0.5;
      lfo.connect(lg).connect(g.gain); lfo.start(); n.sources.push(lfo);
    }
    if (id === 'white') {
      const { src, out } = loopNoise('allpass', 1000); out.connect(g); src.start(); n.sources.push(src);
    }
    if (id === 'fire') {
      const { src, out } = loopNoise('lowpass', 260, 0.5); out.connect(g); src.start(); n.sources.push(src);
      n.timers.push(setInterval(() => {
        if (!nodes[id] || !ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'square'; o.frequency.value = 90 + Math.random() * 400;
        og.gain.setValueAtTime(0.05 * Math.random(), t);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        o.connect(og).connect(g); o.start(t); o.stop(t + 0.06);
      }, 180));
    }
  }

  function stopSound(id) {
    const n = nodes[id];
    if (!n) return;
    if (Array.isArray(n.timers)) {
      n.timers.forEach((t) => clearInterval(t));
      n.timers = [];
    }
    if (Array.isArray(n.sources)) {
      n.sources.forEach((s) => {
        try { if (typeof s.stop === 'function') s.stop(0); } catch {}
        try { if (typeof s.disconnect === 'function') s.disconnect(); } catch {}
      });
      n.sources = [];
    }
    if (Array.isArray(n.audioEls)) {
      n.audioEls.forEach((a) => {
        try {
          a.pause();
          a.currentTime = 0;
          a.removeAttribute('src');
          a.src = '';
          a.load();
        } catch {}
      });
      n.audioEls = [];
    }
    if (n.gain) {
      try {
        if (ctx) {
          n.gain.gain.cancelScheduledValues(0);
          n.gain.gain.setValueAtTime(0, ctx.currentTime);
        }
        n.gain.disconnect();
      } catch {}
      n.gain = null;
    }
    delete nodes[id];
  }

  return {
    SOUNDS,
    buildUI(container, onChange) {
      if (!container) return;
      container.innerHTML = SOUNDS.map((s) => `
        <div class="mix-row" data-sound="${s.id}">
          <span class="mix-emoji">${s.emoji}</span>
          <div>
            <div class="mix-name">${s.name}</div>
            <input type="range" min="0" max="100" value="0" aria-label="${s.name} volume" />
          </div>
          <span class="mix-pct">0%</span>
        </div>`).join('');
      container.querySelectorAll('.mix-row').forEach((row) => {
        const id = row.dataset.sound, range = row.querySelector('input');
        range.addEventListener('input', () => {
          row.querySelector('.mix-pct').textContent = range.value + '%';
          onChange(id, range.value / 100);
        });
      });
    },
    set(id, vol) {
      if (vol <= 0) {
        stopSound(id);
        const row = $(`.mix-row[data-sound="${id}"]`);
        row?.classList.remove('on');
        return;
      }
      ensureCtx();
      if (ctx.state === 'suspended') ctx.resume?.().catch(() => {});
      if (!nodes[id]) build(id);
      if (nodes[id]?.gain && ctx) {
        try {
          nodes[id].gain.gain.cancelScheduledValues(0);
          nodes[id].gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
        } catch {
          try { nodes[id].gain.gain.value = vol; } catch {}
        }
        const row = $(`.mix-row[data-sound="${id}"]`);
        row?.classList.add('on');
      }
    },
    stopSound,
    stopAll() {
      Object.keys(nodes).forEach((id) => stopSound(id));
      document.querySelectorAll('audio.ambient-track, audio[data-ambient]').forEach((a) => {
        try {
          a.pause();
          a.currentTime = 0;
          a.removeAttribute('src');
          a.src = '';
          a.load();
        } catch {}
      });
      $$('.mix-row').forEach((r) => {
        const input = r.querySelector('input');
        if (input) input.value = 0;
        const pct = r.querySelector('.mix-pct');
        if (pct) pct.textContent = '0%';
        r.classList.remove('on');
      });
    },
  };
})();

/* ════════════════════════════════════════════════════════════
   5. MUSIC — custom file uploads + Spotify embed
   ════════════════════════════════════════════════════════════ */
const Music = (() => {
  let tracks = [];
  let idx = -1;
  let player = null;

  function stopPlayer() {
    if (player) {
      try {
        player.pause();
        player.currentTime = 0;
        player.removeAttribute('src');
        player.src = '';
        player.load();
      } catch {}
    }
  }

  function render() {
    const playlist = $('#playlist');
    if (!playlist) return;
    playlist.innerHTML = tracks.length
      ? tracks.map((t, i) => `
        <li data-i="${i}" class="${i === idx ? 'playing' : ''}">
          <span>${i === idx ? '▶' : '🎵'}</span>
          <span class="pl-name">${esc(t.name)}</span>
          <span class="pl-del" data-del="${i}" title="Remove">✕</span>
        </li>`).join('')
      : '<li style="cursor:default;opacity:.55;justify-content:center">No tracks yet</li>';
  }
  function play(i) {
    if (i < 0 || i >= tracks.length || !player) return;
    stopPlayer();
    idx = i;
    player.src = tracks[i].url;
    player.hidden = false;
    player.load();
    player.play().catch(() => {});
    render();
  }

  return {
    init() {
      player = $('#customPlayer');
      const zone = $('#uploadZone'), file = $('#audioFile');
      if (!zone || !file || !player) return;

      zone.addEventListener('click', () => file.click());
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag'); this.add(e.dataTransfer.files); });
      file.addEventListener('change', () => this.add(file.files));

      const playlist = $('#playlist');
      if (playlist) {
        playlist.addEventListener('click', (e) => {
          const del = e.target.dataset.del;
          if (del !== undefined) {
            const i = +del;
            URL.revokeObjectURL(tracks[i].url);
            if (i === idx) {
              stopPlayer();
              player.hidden = true;
              idx = -1;
            }
            tracks.splice(i, 1);
            if (i < idx) idx--;
            render();
            return;
          }
          const li = e.target.closest('li[data-i]');
          if (li) play(+li.dataset.i);
        });
      }
      player.addEventListener('ended', () => { if (idx < tracks.length - 1) play(idx + 1); });
      render();
    },
    stop: stopPlayer,
    add(fileList) {
      [...fileList].filter((f) => f.type.startsWith('audio/')).forEach((f) => {
        tracks.push({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) });
      });
      if (tracks.length && idx === -1) play(0); else render();
      toast(`Added ${fileList.length} track${fileList.length > 1 ? 's' : ''} 🎵`, 'good');
    },
    embedSpotify(url) {
      const m = url.match(/(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/);
      if (!m) { toast('That doesn\'t look like a Spotify link', 'bad'); return; }
      const [, type, id] = m;
      const embed = $('#spotifyEmbed');
      if (embed) {
        embed.innerHTML =
          `<iframe style="border:0" width="100%" height="352" loading="lazy"
            src="https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`;
      }
      Store.d.spotify = url; Store.save();
    },
    restore() {
      const input = $('#spotifyUrl');
      if (Store.d.spotify && input) input.value = Store.d.spotify;
    },
  };
})();

/* ════════════════════════════════════════════════════════════
   6. TIMER — pomodoro engine with ring + room sync
   ════════════════════════════════════════════════════════════ */
const Timer = (() => {
  const MODES = {
    focus:     { label: 'Focus',       kind: 'focus' },
    short:     { label: 'Short break', kind: 'break' },
    long:      { label: 'Long break',  kind: 'break' },
    custom:    { label: 'Custom',      kind: 'focus' },
    stopwatch: { label: 'Stopwatch',   kind: 'stopwatch' },
  };
  const RING = 779.1;
  let mode = 'focus', total = 0, left = 0, running = false, count = 0, last = 0, rafId = null;

  // DOM refs — resolved in init()
  let display = null, ring = null, label = null, info = null, btnText = null, card = null;

  function durationFor(m) {
    if (m === 'stopwatch') return 0;
    const s = Store.d.settings;
    return { focus: s.focus, short: s.short, long: s.long, custom: s.custom }[m] * 60;
  }
  function setMode(m, autostart = false) {
    mode = m;
    total = durationFor(m);
    left = total; running = false;
    if (card) card.classList.remove('running');
    if (btnText) btnText.innerHTML = '▶&nbsp; Start Focus';
    if (label) label.textContent = MODES[m].label;

    // Show/hide custom timer controls
    const ctrlEl = $('#customTimerControls');
    if (ctrlEl) ctrlEl.hidden = (m !== 'custom');

    updateInfo(); paint(); stopLoop();
    if (autostart) start();
    Rooms.broadcastState();
    StrictFocus.update();
  }
  function updateInfo() {
    if (!info) return;
    if (mode === 'stopwatch') { info.textContent = 'Counts up · space to toggle'; return; }
    if (mode === 'custom') { info.textContent = `Custom · ${fmtMin(total / 60)} session`; return; }
    const until = Store.d.settings.rounds - (count % Store.d.settings.rounds);
    info.textContent = `Session ${count + 1} · ${until} until long break`;
  }
  function paint() {
    if (!display || !ring) return;
    const timeStr = fmt(left);
    if (mode === 'stopwatch') { display.textContent = timeStr; ring.style.strokeDashoffset = RING; }
    else {
      display.textContent = timeStr;
      ring.style.strokeDashoffset = total ? RING * (1 - left / total) : RING;
    }
    const strictDisp = $('#strictTimerDisplay');
    if (strictDisp) strictDisp.textContent = timeStr;
  }
  function tick() {
    const now = performance.now();
    const dt = (now - last) / 1000; last = now;
    if (mode === 'stopwatch') left += dt;
    else left -= dt;

    if (mode !== 'stopwatch' && left <= 0) { complete(); return; }

    paint();
    if (MODES[mode].kind === 'focus') Rooms.noteFocus(Math.min(dt, 2));
    rafId = requestAnimationFrame(tick);
  }
  function start() {
    if (running) return;
    running = true; last = performance.now();
    if (card) card.classList.add('running');
    if (btnText) btnText.innerHTML = '⏸&nbsp; Pause';
    rafId = requestAnimationFrame(tick);
    Rooms.broadcastState();
    StrictFocus.update();
  }
  function stopLoop() { cancelAnimationFrame(rafId); rafId = null; }
  function pause() {
    running = false;
    if (card) card.classList.remove('running');
    if (btnText) btnText.innerHTML = '▶&nbsp; Resume';
    stopLoop(); Rooms.broadcastState();
    StrictFocus.update();
  }
  function reset() { setMode(mode); }
  function skip() {
    if (mode === 'focus') {
      count++;
      const next = count % Store.d.settings.rounds === 0 ? 'long' : 'short';
      setMode(next, Store.d.settings.autoStart);
    } else setMode('focus', Store.d.settings.autoStart);
  }
  function complete() {
    running = false; stopLoop();
    if (card) card.classList.remove('running');
    if (MODES[mode].kind === 'focus') {
      Store.addFocus(total); Stats.refresh(); Badges.check();
      Store.addSessionCount();
      if (mode === 'custom') Chime.customComplete(); else Chime.sessionEnd();
      toast(`${MODES[mode].label} complete! 🎉`, 'good');
      count++;
      const next = mode === 'custom' ? 'custom' : (count % Store.d.settings.rounds === 0 ? 'long' : 'short');
      setMode(next, Store.d.settings.autoStart);
    } else {
      Chime.breakEnd();
      toast('Break over — back to it! 💪');
      setMode('focus', Store.d.settings.autoStart);
    }
    StrictFocus.update();
  }

  return {
    get mode() { return mode; },
    get running() { return running; },
    get left() { return left; },
    get total() { return total; },
    init() {
      display = $('#timeDisplay');
      ring = $('#ringProgress');
      label = $('#timerLabel');
      info = $('#sessionInfo');
      btnText = $('#startPauseText');
      card = $('.timer-card');

      // Mode tabs
      $$('.mode-tab').forEach((t) => t.addEventListener('click', () => {
        $$('.mode-tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        setMode(t.dataset.mode);
      }));

      // Timer controls
      const btnStartPause = $('#btnStartPause');
      const btnReset = $('#btnReset');
      const btnSkip = $('#btnSkip');
      if (btnStartPause) btnStartPause.addEventListener('click', () => (running ? pause() : start()));
      if (btnReset) btnReset.addEventListener('click', reset);
      if (btnSkip) btnSkip.addEventListener('click', skip);

      // Custom duration controls
      const btnSetCustom = $('#btnSetCustomDuration');
      const inputCustom = $('#inputCustomDuration');
      if (inputCustom) inputCustom.value = Store.d.settings.custom;

      function applyCustomDuration() {
        if (!inputCustom) return;
        const mins = +inputCustom.value;
        if (mins > 0 && mins <= 480) {
          Store.d.settings.custom = mins;
          Store.save();
          if (mode === 'custom') setMode('custom');
          toast(`Custom timer set to ${fmtMin(mins)}`, 'good');
        } else {
          toast('Enter 1–480 minutes', 'bad');
        }
      }
      if (btnSetCustom) btnSetCustom.addEventListener('click', applyCustomDuration);
      if (inputCustom) inputCustom.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCustomDuration(); });

      setMode('focus'); paint();
    },
    setMode, reset, skip, pause,
  };
})();

/* ════════════════════════════════════════════════════════════
   7. ROOMS — YPT-style live co-study rooms with real-time sync
   ════════════════════════════════════════════════════════════ */
const Rooms = (() => {
  const CH = 'gt4s_rooms_v1';
  const LS = 'gt4s_room_state';
  let channel = null, room = null, me = null, focusBuffer = 0;
  let members = {};
  let tickerInterval = null;

  function code() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  function getMyStatus() {
    if (!Timer.running) {
      return (Timer.mode === 'short' || Timer.mode === 'long') ? 'break' : 'offline';
    }
    if (Timer.mode === 'focus' || Timer.mode === 'custom' || Timer.mode === 'stopwatch') {
      return 'studying';
    }
    return 'break';
  }

  function publish() {
    if (!room || !me) return;
    me.subject = (Store.d.subject || 'General Focus').trim() || 'General Focus';
    me.status = getMyStatus();
    me.timerRunning = Timer.running;
    me.timerMode = Timer.mode;
    me.left = Timer.left;
    me.total = Timer.total;
    me.ts = Date.now();
    members[me.id] = { ...me };

    const msg = { type: 'state', room, peer: me };
    try { channel?.postMessage(msg); } catch {}
    try { localStorage.setItem(LS, JSON.stringify(msg)); } catch {}
    render();
  }

  function prune() {
    const now = Date.now();
    Object.keys(members).forEach((id) => {
      if (id === me?.id) return;
      const m = members[id];
      const age = now - (m.ts || 0);
      if (age > 60000) {
        delete members[id];
      } else if (age > 16000) {
        m.status = 'offline';
        m.timerRunning = false;
      }
    });
  }

  function getSubjectIcon(subjName) {
    if (!subjName) return '⚡';
    try {
      if (typeof SubjectLogger !== 'undefined' && SubjectLogger.getNormalizedList) {
        const list = SubjectLogger.getNormalizedList();
        const found = list.find(s => s.name.toLowerCase() === subjName.toLowerCase());
        if (found) {
          const cat = found.category || 'General';
          const iconMap = { Academics: '📚', Science: '🧪', Coding: '💻', Language: '🗣️', Exam: '🎯', Creative: '🎨', General: '⚡' };
          return iconMap[cat] || '📖';
        }
      }
    } catch {}
    return '📖';
  }

  function render() {
    const list = $('#memberList');
    const countStudyingEl = $('#countStudying');
    const countBreakEl = $('#countBreak');
    const countOfflineEl = $('#countOffline');
    const memberCountEl = $('#roomMemberCount');

    if (!room || !me) return;

    // Prune stale peers
    prune();

    const all = Object.values(members).sort((a, b) => {
      const order = { studying: 0, break: 1, offline: 2, idle: 2 };
      const diff = (order[a.status] || 2) - (order[b.status] || 2);
      if (diff !== 0) return diff;
      return (b.focusSec || 0) - (a.focusSec || 0);
    });

    // Compute status counts for Top Bar
    let studyingCount = 0;
    let breakCount = 0;
    let offlineCount = 0;

    all.forEach((m) => {
      if (m.status === 'studying') studyingCount++;
      else if (m.status === 'break') breakCount++;
      else offlineCount++;
    });

    if (countStudyingEl) countStudyingEl.textContent = studyingCount;
    if (countBreakEl) countBreakEl.textContent = breakCount;
    if (countOfflineEl) countOfflineEl.textContent = offlineCount;
    if (memberCountEl) memberCountEl.textContent = `${all.length} Member${all.length > 1 ? 's' : ''}`;

    if (!list) return;

    const now = Date.now();

    list.innerHTML = all.map((m) => {
      const isMe = m.id === me.id;
      const status = m.status || 'offline';
      const subjIcon = getSubjectIcon(m.subject);

      let statusClass = 'status-offline';
      let badgeLabel = 'Offline 💤';
      let timeText = '00:00';

      if (status === 'studying') {
        statusClass = 'status-studying';
        badgeLabel = 'Studying 🔥';
        if (isMe) {
          timeText = fmt(Timer.left);
        } else {
          const elapsed = (now - (m.ts || now)) / 1000;
          if (m.timerMode === 'stopwatch') {
            timeText = fmt((m.left || 0) + elapsed);
          } else {
            timeText = fmt(Math.max(0, (m.left || 0) - elapsed));
          }
        }
      } else if (status === 'break') {
        statusClass = 'status-break';
        badgeLabel = 'On Break ☕';
        if (isMe) {
          timeText = fmt(Timer.left);
        } else {
          const elapsed = (now - (m.ts || now)) / 1000;
          timeText = fmt(Math.max(0, (m.left || 0) - elapsed));
        }
      } else {
        statusClass = 'status-offline';
        badgeLabel = 'Offline 💤';
        timeText = isMe ? fmt(Timer.left) : fmt(m.left || 0);
      }

      return `
        <div class="ypt-member-card ${isMe ? 'is-me' : ''} ${statusClass}">
          <div class="ypt-member-left">
            <div class="ypt-member-avatar-wrap">
              <span class="ypt-member-avatar">${esc(m.avatar || '🦉')}</span>
              <span class="ypt-avatar-status-badge ${statusClass}"></span>
            </div>
            
            <div class="ypt-member-details">
              <div class="ypt-member-name-row">
                <h3 class="ypt-member-name">${esc(m.nick || 'Anonymous')}</h3>
                ${isMe ? '<span class="ypt-you-tag">YOU</span>' : ''}
              </div>
              
              <div class="ypt-member-subject-badge" title="Studying: ${esc(m.subject || 'General Focus')}">
                <span class="ypt-subj-icon">${subjIcon}</span>
                <span class="ypt-subj-name">${esc(m.subject || 'General Focus')}</span>
              </div>
            </div>
          </div>

          <div class="ypt-member-status-box">
            <span class="ypt-badge-pill ${statusClass}">
              ${badgeLabel}
            </span>
            <span class="ypt-member-timer">${timeText}</span>
          </div>
        </div>`;
    }).join('');
  }

  return {
    get inRoom() { return !!room; },
    get me() { return me; },
    init() {
      try {
        channel = new BroadcastChannel(CH);
        channel.onmessage = (e) => this.receive(e.data);
      } catch (err) {
        console.warn('BroadcastChannel not available:', err);
      }

      // Cross-tab fallback via storage events
      window.addEventListener('storage', (e) => {
        if (e.key === LS && e.newValue) {
          try {
            const msg = JSON.parse(e.newValue);
            this.receive(msg);
          } catch {}
        }
      });

      const picker = $('#avatarPicker');
      const AVATARS = ['🦉', '🐺', '🦊', '🐼', '🐙', '🦄', '🐸', '🦋', '🐧', '🦁', '🐨', '🦈'];
      if (picker) {
        picker.innerHTML = AVATARS.map((a, i) => `<button type="button" class="avatar-opt ${i === 0 ? 'sel' : ''}" data-a="${a}">${a}</button>`).join('');
        picker.addEventListener('click', (e) => {
          const b = e.target.closest('.avatar-opt'); if (!b) return;
          picker.querySelectorAll('.avatar-opt').forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
        });
      }

      const btnCreate = $('#btnCreateRoom');
      const btnJoin = $('#btnJoinRoom');
      const joinCode = $('#joinCode');
      const btnCopy = $('#btnCopyCode');
      const btnLeave = $('#btnLeaveRoom');

      if (btnCreate) btnCreate.addEventListener('click', () => this.join(code()));
      if (btnJoin) btnJoin.addEventListener('click', () => {
        const c = joinCode ? joinCode.value.trim().toUpperCase() : '';
        if (c.length < 4) return toast('Enter a valid room code', 'bad');
        this.join(c);
      });
      if (joinCode) joinCode.addEventListener('keydown', (e) => { if (e.key === 'Enter' && btnJoin) btnJoin.click(); });
      if (btnCopy) btnCopy.addEventListener('click', () => {
        if (room) {
          navigator.clipboard?.writeText(room).then(() => toast('Room code copied 📋', 'good'));
        }
      });
      if (btnLeave) btnLeave.addEventListener('click', () => this.leave());

      const p = Store.d.profile || {};
      const nickInput = $('#nicknameInput');
      if (nickInput) nickInput.value = p.nick || '';
      if (picker) picker.querySelectorAll('.avatar-opt').forEach((b) => b.classList.toggle('sel', b.dataset.a === p.avatar));

      // 1-second interval ticker while in room to keep countdown and topbar active
      if (tickerInterval) clearInterval(tickerInterval);
      tickerInterval = setInterval(() => {
        if (room && me) {
          render();
        }
      }, 1000);
    },
    join(c) {
      const nickInput = $('#nicknameInput');
      const nick = nickInput ? nickInput.value.trim() || 'Anonymous' : 'Anonymous';
      const avatar = $('#avatarPicker .sel')?.dataset.a || '🦉';
      Store.d.profile = { nick, avatar };
      Store.save();

      room = c;
      me = {
        id: 'p_' + Math.random().toString(36).slice(2, 10),
        nick,
        avatar,
        subject: (Store.d.subject || 'General Focus').trim() || 'General Focus',
        status: getMyStatus(),
        timerRunning: Timer.running,
        timerMode: Timer.mode,
        left: Timer.left,
        total: Timer.total,
        focusSec: 0,
        ts: Date.now(),
      };
      members = { [me.id]: me };
      focusBuffer = 0;

      const lobby = $('#roomLobby'), view = $('#roomView'), codeEl = $('#roomCode');
      if (lobby) lobby.hidden = true;
      if (view) view.hidden = false;
      if (codeEl) codeEl.textContent = room;

      publish();
      this.heartbeat();
      toast(`Joined room ${room}! Real-time study sync active 👥`, 'good');
    },
    leave() {
      if (me && room) {
        const leaveMsg = { type: 'leave', room, peer: me };
        try { channel?.postMessage(leaveMsg); } catch {}
        try { localStorage.setItem(LS, JSON.stringify(leaveMsg)); } catch {}
      }
      room = null;
      me = null;
      members = {};
      const lobby = $('#roomLobby'), view = $('#roomView');
      if (lobby) lobby.hidden = false;
      if (view) view.hidden = true;
      toast('Left the study room');
    },
    heartbeat() {
      if (!room || !me) return;
      publish();
      setTimeout(() => this.heartbeat(), 3500);
    },
    broadcastState() {
      if (!room || !me) return;
      publish();
    },
    noteFocus(dt) {
      if (!me) return;
      focusBuffer += dt;
      if (focusBuffer >= 4) {
        me.focusSec = (me.focusSec || 0) + focusBuffer;
        focusBuffer = 0;
        publish();
      }
    },
    receive(msg) {
      if (!msg || msg.room !== room) return;
      if (msg.type === 'state') {
        const p = msg.peer;
        if (p && p.id && p.id !== me?.id) {
          p.ts = Date.now();
          members[p.id] = p;
          render();
        }
      } else if (msg.type === 'leave') {
        if (msg.peer && msg.peer.id) {
          delete members[msg.peer.id];
          render();
        }
      }
    },
    leaderboardData(scope) {
      const rows = new Map();
      const mine = Stats.totalsFor(scope);
      rows.set('__me__', { nick: Store.d.profile.nick || 'You', avatar: Store.d.profile.avatar, sec: mine * 60 });
      Object.values(members).forEach((m) => {
        if (m.id === me?.id) return;
        const prev = rows.get(m.nick) || { nick: m.nick, avatar: m.avatar, sec: 0 };
        prev.sec += (m.focusSec || 0);
        rows.set(m.nick, prev);
      });
      return [...rows.values()].sort((a, b) => b.sec - a.sec);
    },
    renderLeaderboard(scope) {
      const data = this.leaderboardData(scope);
      const lb = $('#leaderboard');
      if (!lb) return;
      lb.innerHTML = data.length
        ? data.map((m, i) => `
            <li class="lb-row ${m.nick === (Store.d.profile.nick || 'You') ? 'me' : ''}">
              <span class="lb-rank">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              <span class="lb-avatar">${esc(m.avatar)}</span>
              <span class="lb-name">${esc(m.nick)}${m.nick === (Store.d.profile.nick || 'You') ? ' <span class="member-you">you</span>' : ''}</span>
              <span class="lb-time">${fmtMin(m.sec / 60)}</span>
            </li>`).join('')
        : '<li class="lb-empty">Join a room and study together to compete! 🏁</li>';
    },
    render,
  };
})();

/* ════════════════════════════════════════════════════════════
   8. STATS — analytics + Chart.js chart
   ════════════════════════════════════════════════════════════ */
const Stats = (() => {
  let chart = null, range = 7;

  function series(days) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ k, label: d.toLocaleDateString(undefined, { weekday: 'short' }), min: Store.d.sessions[k] || 0 });
    }
    return out;
  }
  function totals() {
    const s = Store.d.sessions;
    const now = new Date();
    const dayKey = Store.todayKey();
    const wk = new Date(now); wk.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    let week = 0, month = 0, all = 0;
    Object.entries(s).forEach(([k, v]) => {
      const [y, m, d] = k.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      all += v;
      if (dt >= new Date(wk.getFullYear(), wk.getMonth(), wk.getDate())) week += v;
      if (dt >= new Date(now.getFullYear(), now.getMonth(), 1)) month += v;
    });
    return { today: s[dayKey] || 0, week, month, all, sessionsToday: Store.d.sessionsCount[dayKey] || 0 };
  }
  function streak() {
    let n = 0; const d = new Date();
    if (!(Store.d.sessions[Store.todayKey()] > 0)) d.setDate(d.getDate() - 1);
    while ((Store.d.sessions[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] || 0) > 0) {
      n++; d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function renderSubjectBreakdown() {
    const el = $('#subjectBreakdown');
    if (!el) return;
    const logs = Store.d.subjectLogs || {};
    const agg = {};
    Object.values(logs).forEach((dayEntries) => {
      if (!Array.isArray(dayEntries)) return;
      dayEntries.forEach((e) => {
        if (e.subject) agg[e.subject] = (agg[e.subject] || 0) + (e.minutes || 0);
      });
    });
    const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    const maxMin = sorted.length ? sorted[0][1] : 1;
    if (!sorted.length) {
      el.innerHTML = '<p class="hint-sm">No subject data yet. Enter a subject above the timer and study!</p>';
      return;
    }
    el.innerHTML = sorted.map(([subj, mins]) => `
      <div class="subject-row">
        <div>
          <div class="subject-row-name">${esc(subj)}</div>
          <div class="subject-bar-fill" style="width:${Math.round((mins / maxMin) * 100)}%"></div>
        </div>
        <span class="subject-row-time">${fmtMin(mins)}</span>
      </div>`).join('');
  }

  return {
    totalsFor(scope) {
      const t = totals();
      return { week: t.week, month: t.month, all: t.all, today: t.today }[scope] || 0;
    },
    refresh() {
      const t = totals(), st = streak();
      const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
      set('#statToday', fmtMin(t.today)); set('#statStreak', st + '🔥');
      set('#statSessions', t.sessionsToday); set('#statWeek', fmtMin(t.week));
      set('#kpiToday', fmtMin(t.today)); set('#kpiWeek', fmtMin(t.week));
      set('#kpiMonth', fmtMin(t.month)); set('#kpiTotal', fmtMin(t.all));
      set('#focusTotalFoot', fmtMin(t.all));
      this.draw();
      renderSubjectBreakdown();
      Rooms.renderLeaderboard($('#lbSeg .active')?.dataset.scope || 'week');
      if (typeof LocalLeaderboard !== 'undefined') LocalLeaderboard.render();
    },
    draw() {
      if (typeof Chart === 'undefined') return;
      const canvas = $('#statsChart');
      if (!canvas) return;
      const data = series(range);
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;
      const styles = getComputedStyle(document.documentElement);
      const c1 = styles.getPropertyValue('--accent-1').trim() || '#7c6cff';
      const c2 = styles.getPropertyValue('--accent-2').trim() || '#ff7ac6';
      const txt = styles.getPropertyValue('--text-dim').trim() || '#a2a8c8';
      const grid = 'rgba(128,138,180,0.14)';

      if (chart) { chart.destroy(); chart = null; }
      chart = new Chart(ctx2d, {
        type: 'bar',
        data: {
          labels: data.map((d) => d.label),
          datasets: [{
            label: 'Minutes focused',
            data: data.map((d) => Math.round(d.min)),
            backgroundColor: (context) => {
              const area = context?.chart?.chartArea;
              const y0 = area ? area.top : 0;
              const y1 = area ? area.bottom : 190;
              const g = ctx2d.createLinearGradient(0, y0, 0, y1);
              g.addColorStop(0, c1); g.addColorStop(1, c2 + '55');
              return g;
            },
            borderRadius: 7,
            maxBarThickness: 34,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (x) => fmtMin(x.parsed.y) } } },
          scales: {
            x: { grid: { display: false }, ticks: { color: txt, font: { family: 'Outfit', size: 10 } } },
            y: { grid: { color: grid }, ticks: { color: txt, font: { family: 'Outfit', size: 10 } }, beginAtZero: true },
          },
        },
      });
    },
    setRange(r) { range = r; this.draw(); },
  };
})();

/* ════════════════════════════════════════════════════════════
   9. BADGES — gamified milestones
   ════════════════════════════════════════════════════════════ */
const Badges = (() => {
  const DEFS = [
    { id: 'first', ico: '🌱', title: 'First Step',   desc: 'Complete 1 focus session' },
    { id: 'h1',    ico: '⏰', title: 'Hour One',     desc: '1 hour total focus' },
    { id: 'h5',    ico: '🎓', title: 'Scholar',      desc: '5 hours total focus' },
    { id: 'h10',   ico: '📚', title: 'Bookworm',     desc: '10 hours total focus' },
    { id: 'h25',   ico: '🏛️', title: 'Deep Work',    desc: '25 hours total focus' },
    { id: 'h50',   ico: '👑', title: 'Focus Royalty', desc: '50 hours total focus' },
    { id: 's3',    ico: '🔥', title: 'On a Roll',    desc: '3-day streak' },
    { id: 's7',    ico: '⚡', title: 'Unstoppable',  desc: '7-day streak' },
    { id: 's30',   ico: '🌟', title: 'Legend',       desc: '30-day streak' },
    { id: 'night', ico: '🌙', title: 'Night Owl',    desc: 'Study after 10 PM' },
    { id: 'early', ico: '🌅', title: 'Early Bird',   desc: 'Study before 7 AM' },
    { id: 'marathon', ico: '🏃', title: 'Marathon',  desc: 'Focus 2h in one day' },
  ];

  function streakNow() {
    let n = 0; const d = new Date();
    if (!(Store.d.sessions[Store.todayKey()] > 0)) d.setDate(d.getDate() - 1);
    while ((Store.d.sessions[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] || 0) > 0) {
      n++; d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function unlock(id) {
    if (Store.d.badges.includes(id)) return;
    const b = DEFS.find((x) => x.id === id); if (!b) return;
    Store.d.badges.push(id); Store.save();
    toast(`${b.ico} Badge unlocked: ${b.title}!`, 'good');
    render();
  }
  function render() {
    const grid = $('#badgeGrid');
    if (!grid) return;
    grid.innerHTML = DEFS.map((b) => `
      <div class="badge ${Store.d.badges.includes(b.id) ? 'unlocked' : ''}">
        <span class="badge-ico">${b.ico}</span>
        <span class="badge-title">${b.title}</span>
        <span class="badge-desc">${b.desc}</span>
      </div>`).join('');
  }

  return {
    check() {
      const t = Stats.totalsFor('all');
      const today = Store.d.sessions[Store.todayKey()] || 0;
      if (t >= 1 / 60) unlock('first');
      if (t >= 60) unlock('h1'); if (t >= 300) unlock('h5');
      if (t >= 600) unlock('h10'); if (t >= 1500) unlock('h25'); if (t >= 3000) unlock('h50');
      const s = streakNow();
      if (s >= 3) unlock('s3'); if (s >= 7) unlock('s7'); if (s >= 30) unlock('s30');
      const hr = new Date().getHours();
      if (hr >= 22) unlock('night'); if (hr < 7) unlock('early');
      if (today >= 120) unlock('marathon');
      render();
    },
    init() { render(); },
  };
})();

/* ════════════════════════════════════════════════════════════
   10. SCENES — ambient backgrounds (CSS gradients + canvas particles)
   ════════════════════════════════════════════════════════════ */
const Scenes = (() => {
  const SCENES = [
    { id: null,     emoji: '⬛', name: 'None' },
    { id: 'stars',  emoji: '🌌', name: 'Starry night' },
    { id: 'rain',   emoji: '🌧️', name: 'Rainy day' },
    { id: 'snow',   emoji: '❄️', name: 'Snowfall' },
    { id: 'bokeh',  emoji: '🏮', name: 'Cozy café' },
    { id: 'sakura', emoji: '🌸', name: 'Sakura' },
  ];
  const TINTS = {
    stars:  ['#1a1440', '#0a0a1e', '#241a50'],
    rain:   ['#1c2a3a', '#0e141d', '#27394d'],
    snow:   ['#22304a', '#101828', '#3a4a6a'],
    bokeh:  ['#3a2418', '#1a100a', '#503018'],
    sakura: ['#3a1c34', '#1a0e1a', '#502a44'],
  };

  let canvas = null, ctx = null;
  let particles = [], animId = null, current = null;

  function resize() {
    if (!canvas) return;
    canvas.width = innerWidth; canvas.height = innerHeight;
  }
  function makeParticles(kind) {
    if (!canvas) return;
    particles = [];
    const count = kind === 'bokeh' ? 18 : kind === 'snow' ? 90 : 70;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        r: kind === 'bokeh' ? 14 + Math.random() * 40 : kind === 'snow' ? 1 + Math.random() * 3 : 0.8 + Math.random() * 1.8,
        vy: kind === 'rain' ? 9 + Math.random() * 6 : kind === 'snow' ? 0.5 + Math.random() * 1.2 : 0.15 + Math.random() * 0.4,
        vx: kind === 'rain' ? -1.2 : Math.random() * 0.6 - 0.3,
        a: Math.random() * Math.PI * 2, tw: 0.01 + Math.random() * 0.03,
        hue: kind === 'bokeh' ? 20 + Math.random() * 30 : kind === 'sakura' ? 330 + Math.random() * 20 : 220,
        streak: kind === 'rain',
      });
    }
  }
  function loop() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.y += p.vy; p.x += p.vx; p.a += p.tw;
      if (p.y > canvas.height + 60) { p.y = -60; p.x = Math.random() * canvas.width; }
      if (p.x > canvas.width + 60) p.x = -60; if (p.x < -60) p.x = canvas.width + 60;
      const alpha = p.streak ? 0.35 : (current === 'stars' ? 0.4 + Math.sin(p.a) * 0.35 : 0.28);
      if (p.streak) {
        ctx.strokeStyle = `rgba(180,200,255,${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 4, p.y + p.vy * 4); ctx.stroke();
      } else if (current === 'bokeh') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, `hsla(${p.hue},80%,60%,${alpha * 0.5})`);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (current === 'sakura') {
        ctx.fillStyle = `hsla(${p.hue},75%,80%,${alpha})`;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 2, p.r, p.a, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = `rgba(230,235,255,${alpha})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    animId = requestAnimationFrame(loop);
  }
  function apply(id) {
    cancelAnimationFrame(animId);
    const tint = TINTS[id];
    if (tint) {
      const r = document.documentElement;
      r.style.setProperty('--grad-1', tint[0]);
      r.style.setProperty('--grad-2', tint[1]);
      r.style.setProperty('--grad-3', tint[2]);
    } else {
      document.documentElement.style.removeProperty('--grad-1');
      document.documentElement.style.removeProperty('--grad-2');
      document.documentElement.style.removeProperty('--grad-3');
    }
    if (id) { makeParticles(id); loop(); } else if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    current = id;
    Store.d.scene = id; Store.save();
    $$('.scene-card').forEach((c) => c.classList.toggle('sel', c.dataset.id === (id || '')));
  }
  return {
    init() {
      canvas = $('#ambientCanvas');
      if (canvas) ctx = canvas.getContext('2d');

      resize(); addEventListener('resize', () => { resize(); if (current) makeParticles(current); });
      const grid = $('#sceneGrid');
      if (grid) {
        grid.innerHTML = SCENES.map((s) => `<button class="scene-card" data-id="${s.id || ''}">${s.emoji}<small>${s.name}</small></button>`).join('');
        grid.addEventListener('click', (e) => {
          const c = e.target.closest('.scene-card'); if (!c) return;
          apply(c.dataset.id || null);
        });
      }
      const gradToggle = $('#gradientToggle');
      if (gradToggle) {
        gradToggle.addEventListener('change', (e) => {
          const layer = $('#gradientLayer');
          if (layer) layer.classList.toggle('off', !e.target.checked);
          Store.d.gradient = e.target.checked; Store.save();
        });
      }
      if (Store.d.scene) apply(Store.d.scene);
      if (!Store.d.gradient) {
        const layer = $('#gradientLayer');
        if (layer) layer.classList.add('off');
        if (gradToggle) gradToggle.checked = false;
      }
    },
  };
})();

/* ════════════════════════════════════════════════════════════
   11. PERSONAL LIFE JOURNAL — PIN-protected private notes & themes
   ════════════════════════════════════════════════════════════ */
const Journal = (() => {
  let filterQuery = '';
  let unlocked = false;

  function getPin() {
    return Store.d.journalPin || '0000';
  }

  function checkPin(pin) {
    return pin === getPin();
  }

  function unlock() {
    unlocked = true;
    const lockView = $('#journalLockView');
    const contentView = $('#journalContentView');
    const pinModal = $('#diaryPinModal');
    if (pinModal) pinModal.hidden = true;
    if (lockView) lockView.hidden = true;
    if (contentView) contentView.hidden = false;
    const pinInput = $('#journalPinInput');
    if (pinInput) pinInput.value = '';
    render();
    toast('My Personal Diary unlocked 🔓', 'good');
  }

  function lock() {
    unlocked = false;
    const lockView = $('#journalLockView');
    const contentView = $('#journalContentView');
    const pinModal = $('#diaryPinModal');
    if (pinModal) pinModal.hidden = true;
    if (lockView) lockView.hidden = false;
    if (contentView) contentView.hidden = true;
    const pinInput = $('#journalPinInput');
    if (pinInput) pinInput.value = '';
    toast('My Personal Diary locked 🔒');
  }

  function render() {
    if (!unlocked) return;
    const list = $('#journalList');
    const countEl = $('#journalCount');
    if (!list) return;

    const items = Store.d.journal || [];
    if (countEl) countEl.textContent = `${items.length} note${items.length === 1 ? '' : 's'}`;

    const filtered = items
      .map((n, originalIdx) => ({ ...n, originalIdx }))
      .filter((n) => {
        if (!filterQuery) return true;
        const q = filterQuery.toLowerCase();
        return (
          (n.title && n.title.toLowerCase().includes(q)) ||
          (n.text && n.text.toLowerCase().includes(q)) ||
          (n.category && n.category.toLowerCase().includes(q)) ||
          (n.mood && n.mood.toLowerCase().includes(q))
        );
      });

    if (!filtered.length) {
      list.innerHTML = filterQuery
        ? '<li class="hint-sm" style="padding:18px 0;text-align:center">No matching reflections found.</li>'
        : '<li class="hint-sm" style="padding:18px 0;text-align:center">Your personal diary is empty. Write your first reflection, breakthrough, or study milestone above! ✍️</li>';
      return;
    }

    list.innerHTML = filtered.slice().reverse().map((n) => {
      const d = new Date(n.timestamp);
      const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const themeClass = n.color ? `theme-${n.color}` : 'theme-violet';
      return `
        <li class="journal-item ${themeClass}" data-idx="${n.originalIdx}">
          <div class="journal-item-head">
            <div class="journal-item-title-group">
              <span class="journal-item-title">${esc(n.title || 'Untitled Reflection')}</span>
              <div class="journal-item-badges">
                ${n.mood ? `<span class="journal-badge-mood">${esc(n.mood)}</span>` : ''}
                ${n.category ? `<span class="journal-badge-cat">${esc(n.category)}</span>` : ''}
              </div>
            </div>
            <span class="journal-item-date">${dateStr}</span>
          </div>
          <div class="journal-item-body">${esc(n.text)}</div>
          <div class="journal-item-foot">
            <button class="journal-act-btn" data-copy-idx="${n.originalIdx}" title="Copy entry text">📋 Copy</button>
            <button class="journal-act-btn danger" data-del-idx="${n.originalIdx}" title="Delete entry">🗑️ Delete</button>
          </div>
        </li>`;
    }).join('');
  }

  return {
    get isUnlocked() { return unlocked; },
    init() {
      const lockCard = $('#journalLockView');
      const btnOpenDiary = $('#btnOpenDiaryPinModal');
      const diaryModal = $('#diaryPinModal');
      const pinInput = $('#journalPinInput');
      const btnUnlock = $('#btnUnlockJournal');
      const keypad = $('#pinKeypad');
      const btnLock = $('#btnLockJournal');
      const btnOpenPinModal = $('#btnOpenPinModal');
      const pinOverlay = $('#pinOverlay');
      const btnSaveNewPin = $('#btnSaveNewPin');

      function openDiaryModal() {
        if (diaryModal) {
          diaryModal.hidden = false;
          if (pinInput) {
            pinInput.value = '';
            setTimeout(() => pinInput.focus(), 60);
          }
        }
      }

      if (btnOpenDiary) {
        btnOpenDiary.addEventListener('click', (e) => {
          e.stopPropagation();
          openDiaryModal();
        });
      }

      if (lockCard) {
        lockCard.addEventListener('click', () => {
          openDiaryModal();
        });
      }

      // Keypad button handling
      if (keypad && pinInput) {
        keypad.addEventListener('click', (e) => {
          const btn = e.target.closest('.key-btn');
          if (!btn) return;
          const k = btn.dataset.key;
          if (k === 'clear') {
            pinInput.value = '';
          } else if (k === 'back') {
            pinInput.value = pinInput.value.slice(0, -1);
          } else if (k) {
            if (pinInput.value.length < 8) pinInput.value += k;
          }
          if (pinInput.value.length >= 4 && checkPin(pinInput.value)) {
            unlock();
          }
        });
      }

      function attemptUnlock() {
        if (!pinInput) return;
        const entered = pinInput.value.trim();
        if (checkPin(entered)) {
          unlock();
        } else {
          const modalDialog = $('#diaryPinModal .modal') || lockCard;
          if (modalDialog) {
            modalDialog.classList.remove('shake');
            void modalDialog.offsetWidth;
            modalDialog.classList.add('shake');
          }
          toast('Incorrect PIN! Try again.', 'bad');
          pinInput.value = '';
        }
      }

      if (btnUnlock) btnUnlock.addEventListener('click', attemptUnlock);
      if (pinInput) {
        pinInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') attemptUnlock();
        });
      }

      if (btnLock) btnLock.addEventListener('click', lock);

      // Composer handlers
      const titleInput = $('#journalTitle');
      const catSelect = $('#journalCategory');
      const moodSelect = $('#journalMood');
      const colorSelect = $('#journalColor');
      const textInput = $('#journalText');
      const btnSave = $('#btnSaveJournal');
      const btnReset = $('#btnResetJournal');
      const searchInput = $('#journalSearch');
      const list = $('#journalList');

      function saveEntry() {
        if (!textInput) return;
        const text = textInput.value.trim();
        if (!text) { toast('Please write some content for your note', 'bad'); return; }
        const title = (titleInput ? titleInput.value.trim() : '') || 'Untitled Note';
        const category = catSelect ? catSelect.value : 'Personal Life';
        const mood = moodSelect ? moodSelect.value : '🌟 Inspired';
        const color = colorSelect ? colorSelect.value : 'violet';

        Store.d.journal = Store.d.journal || [];
        Store.d.journal.push({
          title,
          category,
          mood,
          color,
          text,
          timestamp: Date.now(),
        });
        Store.save();

        if (titleInput) titleInput.value = '';
        textInput.value = '';
        render();
        toast('Journal note saved ✨', 'good');
      }

      if (btnSave) btnSave.addEventListener('click', saveEntry);
      if (btnReset && textInput) {
        btnReset.addEventListener('click', () => {
          if (titleInput) titleInput.value = '';
          textInput.value = '';
        });
      }

      if (textInput) {
        textInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveEntry();
          }
        });
      }

      if (searchInput) {
        searchInput.addEventListener('input', () => {
          filterQuery = searchInput.value.trim();
          render();
        });
      }

      if (list) {
        list.addEventListener('click', (e) => {
          const delBtn = e.target.closest('[data-del-idx]');
          if (delBtn) {
            const idx = +delBtn.dataset.delIdx;
            if (confirm('Delete this journal entry?')) {
              Store.d.journal.splice(idx, 1);
              Store.save();
              render();
              toast('Journal entry deleted');
            }
            return;
          }

          const copyBtn = e.target.closest('[data-copy-idx]');
          if (copyBtn) {
            const idx = +copyBtn.dataset.copyIdx;
            const item = Store.d.journal[idx];
            if (item) {
              const fullText = `${item.title}\n[${item.category} · ${item.mood}]\n\n${item.text}`;
              navigator.clipboard?.writeText(fullText).then(() => toast('Note copied to clipboard 📋', 'good'));
            }
          }
        });
      }

      // PIN Change Modal handlers
      if (btnOpenPinModal && pinOverlay) {
        btnOpenPinModal.addEventListener('click', () => {
          const curr = $('#currentPinInput'), n1 = $('#newPinInput'), n2 = $('#confirmPinInput');
          if (curr) curr.value = '';
          if (n1) n1.value = '';
          if (n2) n2.value = '';
          pinOverlay.hidden = false;
        });
      }

      if (btnSaveNewPin) {
        btnSaveNewPin.addEventListener('click', () => {
          const curr = $('#currentPinInput')?.value.trim();
          const n1 = $('#newPinInput')?.value.trim();
          const n2 = $('#confirmPinInput')?.value.trim();

          if (curr !== getPin()) {
            toast('Current PIN is incorrect', 'bad');
            return;
          }
          if (!n1 || n1.length < 4) {
            toast('New PIN must be at least 4 digits', 'bad');
            return;
          }
          if (n1 !== n2) {
            toast('New PIN confirmation does not match', 'bad');
            return;
          }

          Store.d.journalPin = n1;
          Store.save();
          if (pinOverlay) pinOverlay.hidden = true;
          toast('Security PIN updated successfully! 🔑', 'good');
        });
      }
    },
    render,
    lock,
    unlock,
  };
})();

/* ════════════════════════════════════════════════════════════
   12. STRICT FOCUS — locks sidebar, enters fullscreen & resets on tab switch
   ════════════════════════════════════════════════════════════ */
const StrictFocus = (() => {
  let enabled = false;

  function enterFullscreen() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
  }

  function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {}
  }

  function renderStats() {
    const el = $('#strictSwitchCount');
    if (el) el.textContent = Store.d.strictInfractions || 0;
  }

  function handleTabSwitch() {
    if (!enabled || !Timer.running) return;
    if (Timer.mode !== 'focus' && Timer.mode !== 'custom' && Timer.mode !== 'stopwatch') return;

    Timer.reset();
    Store.d.strictInfractions = (Store.d.strictInfractions || 0) + 1;
    Store.save();
    renderStats();
    Chime.tick();
    toast('⚠️ Strict Mode: Tab switch detected! Your timer has been reset.', 'bad');
  }

  return {
    get isEnabled() { return enabled; },
    init() {
      enabled = Store.d.settings.strictMode || false;
      const toggle = $('#strictToggle');
      if (toggle) {
        toggle.checked = enabled;
        toggle.addEventListener('change', () => {
          enabled = toggle.checked;
          Store.d.settings.strictMode = enabled;
          Store.save();
          this.update();
          toast(enabled ? '🔒 Strict Focus Mode enabled (Fullscreen + Tab Reset)' : '🔓 Strict Focus Mode disabled', 'good');
        });
      }

      const btnResetStats = $('#btnResetStrictStats');
      if (btnResetStats) {
        btnResetStats.addEventListener('click', () => {
          Store.d.strictInfractions = 0;
          Store.save();
          renderStats();
          toast('Infraction counter reset');
        });
      }

      const btnExit = $('#btnStrictExit');
      if (btnExit) {
        btnExit.addEventListener('click', () => {
          Timer.pause();
          exitFullscreen();
          toast('Paused and exited Strict Mode');
        });
      }

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) handleTabSwitch();
      });
      window.addEventListener('blur', () => {
        handleTabSwitch();
      });

      renderStats();
    },
    update() {
      const overlay = $('#strictOverlay');
      const isStrictRunning = enabled && Timer.running && (Timer.mode === 'focus' || Timer.mode === 'custom' || Timer.mode === 'stopwatch');

      if (overlay) overlay.hidden = !isStrictRunning;

      if (isStrictRunning) {
        enterFullscreen();
      } else if (!Timer.running) {
        exitFullscreen();
      }
    },
  };
})();

/* ════════════════════════════════════════════════════════════
   13. SUBJECT TRACKER (YPT-Style) — color badges, study goals,
       total study time, progress bars & persistent LocalStorage
   ════════════════════════════════════════════════════════════ */
const SubjectLogger = (() => {
  const CATEGORIES = {
    'Academics': { name: 'Academics', icon: '📚' },
    'Science':   { name: 'Science & Math', icon: '🧪' },
    'Coding':    { name: 'Programming', icon: '💻' },
    'Language':  { name: 'Languages', icon: '🗣️' },
    'Exam':      { name: 'Exam Prep', icon: '🎯' },
    'Creative':  { name: 'Arts & Creative', icon: '🎨' },
    'General':   { name: 'General Focus', icon: '⚡' },
  };

  const DEFAULT_COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9', '#84cc16', '#ec4899'];
  let selectedColor = '#10b981';

  function getCategoryInfo(catKey) {
    return CATEGORIES[catKey] || { name: catKey || 'General', icon: '⚡' };
  }

  function getNormalizedList() {
    if (!Array.isArray(Store.d.subjectsList) || !Store.d.subjectsList.length) {
      Store.d.subjectsList = [
        { id: 'Mathematics', name: 'Mathematics', color: '#06b6d4', category: 'Science', goalMinutes: 60 },
        { id: 'Physics', name: 'Physics', color: '#8b5cf6', category: 'Science', goalMinutes: 60 },
        { id: 'Computer Science', name: 'Computer Science', color: '#10b981', category: 'Coding', goalMinutes: 90 },
        { id: 'Biology', name: 'Biology', color: '#84cc16', category: 'Science', goalMinutes: 45 },
        { id: 'Literature', name: 'Literature', color: '#f59e0b', category: 'Academics', goalMinutes: 45 }
      ];
      Store.save();
      return Store.d.subjectsList;
    }

    let changed = false;
    const normalized = Store.d.subjectsList.map((item, idx) => {
      if (typeof item === 'string') {
        changed = true;
        return {
          id: item,
          name: item,
          color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
          category: 'General',
          goalMinutes: 60
        };
      }
      return {
        id: item.id || item.name,
        name: item.name || 'Untitled Subject',
        color: item.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
        category: item.category || 'General',
        goalMinutes: Number(item.goalMinutes) || 60
      };
    });

    if (changed) {
      Store.d.subjectsList = normalized;
      Store.save();
    }
    return normalized;
  }

  function getStatsForSubject(subjName) {
    if (!subjName) return { totalMins: 0, todayMins: 0 };
    const logs = Store.d.subjectLogs || {};
    const todayK = Store.todayKey();
    let totalMins = 0;
    let todayMins = 0;

    const lowerTarget = subjName.trim().toLowerCase();

    Object.entries(logs).forEach(([day, entries]) => {
      if (!Array.isArray(entries)) return;
      entries.forEach((entry) => {
        if (entry && entry.subject && entry.subject.trim().toLowerCase() === lowerTarget) {
          const mins = Number(entry.minutes) || 0;
          totalMins += mins;
          if (day === todayK) {
            todayMins += mins;
          }
        }
      });
    });

    return { totalMins, todayMins };
  }

  function renderCards() {
    const listEl = $('#subjectCardsList');
    const input = $('#subjectInput');
    const activeBadge = $('#activeSubjectBadge');
    const activeIcon = $('#activeSubjIcon');
    const activeMeta = $('#activeSubjMeta');

    const subjects = getNormalizedList();
    const activeSubj = (Store.d.subject || '').trim();
    let activeObj = null;

    if (activeSubj) {
      activeObj = subjects.find(s => s.name.toLowerCase() === activeSubj.toLowerCase()) || null;
    }

    // Update active subject display header
    if (input && document.activeElement !== input) {
      input.value = activeSubj;
    }

    if (activeObj) {
      const catInfo = getCategoryInfo(activeObj.category);
      if (activeIcon) activeIcon.textContent = catInfo.icon;
      if (activeBadge) activeBadge.innerHTML = `Active: <b style="color:${activeObj.color}">${esc(activeObj.name)}</b>`;
      const stats = getStatsForSubject(activeObj.name);
      if (activeMeta) {
        activeMeta.innerHTML = `Active: <b style="color:${activeObj.color}">${esc(activeObj.name)}</b> (${catInfo.name}) · Today: ${fmtMin(stats.todayMins)}`;
      }
    } else if (activeSubj) {
      if (activeIcon) activeIcon.textContent = '📖';
      if (activeBadge) activeBadge.innerHTML = `Active: <b style="color:var(--accent-emerald)">${esc(activeSubj)}</b>`;
      const stats = getStatsForSubject(activeSubj);
      if (activeMeta) {
        activeMeta.innerHTML = `Active: <b>${esc(activeSubj)}</b> · Today: ${fmtMin(stats.todayMins)}`;
      }
    } else {
      if (activeIcon) activeIcon.textContent = '📖';
      if (activeBadge) activeBadge.innerHTML = 'Active: <b>None</b>';
      if (activeMeta) activeMeta.textContent = 'Select or tap a card below to focus';
    }

    if (!listEl) return;

    if (!subjects.length) {
      listEl.innerHTML = '<div class="hint-sm" style="padding:16px 0;text-align:center;grid-column:1/-1;">No subjects created yet. Click "＋ Add Subject" above to start! 🚀</div>';
      return;
    }

    listEl.innerHTML = subjects.map((item) => {
      const isActive = item.name.toLowerCase() === activeSubj.toLowerCase();
      const catInfo = getCategoryInfo(item.category);
      const { totalMins, todayMins } = getStatsForSubject(item.name);
      const goal = item.goalMinutes || 60;
      const progressPct = Math.min(100, Math.round((todayMins / goal) * 100));

      return `
        <div class="ypt-card ${isActive ? 'active-ypt-card' : ''}" data-subj="${esc(item.name)}" style="--subj-theme:${item.color || '#10b981'};" role="button" tabindex="0" title="Tap to select ${esc(item.name)} as active subject">
          <div class="ypt-card-left-bar"></div>
          <div class="ypt-card-body">
            <div class="ypt-card-top">
              <div class="ypt-card-badge-wrap">
                <span class="ypt-color-dot" style="background:${item.color || '#10b981'};"></span>
                <span class="ypt-category-tag">${catInfo.icon} ${esc(catInfo.name)}</span>
              </div>
              <div class="ypt-card-actions">
                ${isActive ? '<span class="ypt-active-pill">● ACTIVE</span>' : ''}
                <button type="button" class="ypt-del-btn" data-del-subj="${esc(item.name)}" title="Delete ${esc(item.name)}">✕</button>
              </div>
            </div>

            <div class="ypt-card-main">
              <h3 class="ypt-card-title">${esc(item.name)}</h3>
              <div class="ypt-card-time-row">
                <span class="ypt-total-time"><strong>${fmtMin(totalMins)}</strong> total</span>
                <span class="ypt-today-time">Today: <b>${fmtMin(todayMins)}</b></span>
              </div>
            </div>

            <div class="ypt-progress-wrap">
              <div class="ypt-progress-bar">
                <div class="ypt-progress-fill" style="width:${progressPct}%; background:${item.color || 'var(--accent-emerald)'};"></div>
              </div>
              <span class="ypt-progress-pct">${progressPct}%</span>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function selectSubject(subjName) {
    const name = (subjName || '').trim();
    Store.d.subject = name;
    Store.save();
    renderCards();
    if (name) {
      toast(`Active subject switched to ${name}! 📚`, 'good');
    }
    try { if (typeof LocalLeaderboard !== 'undefined' && LocalLeaderboard.render) LocalLeaderboard.render(); } catch {}
    try { if (typeof Rooms !== 'undefined' && Rooms.inRoom) Rooms.broadcastState(); } catch {}
  }

  function addSubject(name, category, color, goalMinutes) {
    name = (name || '').trim();
    if (!name) {
      toast('Please enter a subject name', 'bad');
      return;
    }
    const subjects = getNormalizedList();
    const existingIdx = subjects.findIndex(s => s.name.toLowerCase() === name.toLowerCase());

    const newObj = {
      id: name,
      name,
      category: category || 'General',
      color: color || selectedColor || '#10b981',
      goalMinutes: Number(goalMinutes) || 60,
    };

    if (existingIdx >= 0) {
      subjects[existingIdx] = newObj;
    } else {
      subjects.push(newObj);
    }

    Store.d.subjectsList = subjects;
    selectSubject(name);

    const form = $('#addSubjectForm');
    const input = $('#newSubjectInput');
    if (form) form.hidden = true;
    if (input) input.value = '';
    toast(`Subject saved: ${name} ✨`, 'good');
  }

  function deleteSubject(name) {
    const target = (name || '').trim();
    if (!target) return;
    Store.d.subjectsList = getNormalizedList().filter(s => s.name.toLowerCase() !== target.toLowerCase());
    if ((Store.d.subject || '').toLowerCase() === target.toLowerCase()) {
      Store.d.subject = '';
    }
    Store.save();
    renderCards();
    toast(`Subject removed: ${target}`);
    try { if (typeof LocalLeaderboard !== 'undefined' && LocalLeaderboard.render) LocalLeaderboard.render(); } catch {}
  }

  function renderLog() {
    const el = $('#subjectLogContent');
    if (!el) return;
    const logs = Store.d.subjectLogs || {};
    const days = Object.keys(logs).sort().reverse();
    if (!days.length) {
      el.innerHTML = '<p class="hint-sm" style="text-align:center;padding:20px 0">No study sessions recorded yet.</p>';
      return;
    }
    el.innerHTML = days.slice(0, 14).map((day) => {
      const entries = logs[day] || [];
      const dateObj = new Date(day + 'T00:00:00');
      const dateLabel = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      return `
        <div class="subject-log-day">
          <h3>${dateLabel}</h3>
          ${entries.map((e) => `
            <div class="subject-log-entry">
              <span class="sle-subj">${esc(e.subject || 'Unfiled')}</span>
              <span class="sle-time">${fmtMin(e.minutes || 0)}</span>
            </div>`).join('')}
        </div>`;
    }).join('');
  }

  return {
    init() {
      getNormalizedList();

      const input = $('#subjectInput');
      if (input) {
        input.value = Store.d.subject || '';
        input.addEventListener('input', () => {
          Store.d.subject = input.value.trim();
          Store.save();
          renderCards();
        });
      }

      // Add Subject Toggle
      const btnToggle = $('#btnToggleAddSubject');
      const addForm = $('#addSubjectForm');
      const newSubjInput = $('#newSubjectInput');
      const newSubjCat = $('#newSubjectCategory');
      const newSubjGoal = $('#newSubjectGoal');
      const btnConfirm = $('#btnConfirmAddSubject');
      const btnCancel = $('#btnCancelAddSubject');
      const colorPickerRow = $('#colorPickerRow');
      const customColorInput = $('#customColorInput');

      if (btnToggle && addForm) {
        btnToggle.addEventListener('click', () => {
          addForm.hidden = !addForm.hidden;
          if (!addForm.hidden && newSubjInput) {
            newSubjInput.focus();
          }
        });
      }

      // Color Palette Selector
      if (colorPickerRow) {
        colorPickerRow.addEventListener('click', (e) => {
          const dot = e.target.closest('.color-dot-btn');
          if (dot && dot.dataset.color) {
            selectedColor = dot.dataset.color;
            $$('.color-dot-btn').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            if (customColorInput) customColorInput.value = selectedColor;
          }
        });
      }

      if (customColorInput) {
        customColorInput.addEventListener('input', (e) => {
          selectedColor = e.target.value;
          $$('.color-dot-btn').forEach(d => d.classList.remove('active'));
        });
      }

      function handleSaveNewSubject() {
        if (!newSubjInput) return;
        const name = newSubjInput.value;
        const category = newSubjCat ? newSubjCat.value : 'Academics';
        const goal = newSubjGoal ? newSubjGoal.value : 60;
        addSubject(name, category, selectedColor, goal);
      }

      if (btnConfirm) {
        btnConfirm.addEventListener('click', handleSaveNewSubject);
      }

      if (newSubjInput) {
        newSubjInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveNewSubject();
          } else if (e.key === 'Escape' && addForm) {
            addForm.hidden = true;
          }
        });
      }

      if (btnCancel && addForm) {
        btnCancel.addEventListener('click', () => {
          addForm.hidden = true;
          if (newSubjInput) newSubjInput.value = '';
        });
      }

      // Single-Tap Subject Card Selection & Deletion (Delegated)
      const cardsList = $('#subjectCardsList');
      if (cardsList) {
        cardsList.addEventListener('click', (e) => {
          const delBtn = e.target.closest('.ypt-del-btn');
          if (delBtn) {
            e.stopPropagation();
            const subjName = delBtn.dataset.delSubj;
            if (subjName) deleteSubject(subjName);
            return;
          }

          const card = e.target.closest('.ypt-card');
          if (card) {
            const subjName = card.dataset.subj;
            if (subjName) selectSubject(subjName);
          }
        });

        // Keyboard accessibility
        cardsList.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            const card = e.target.closest('.ypt-card');
            if (card && card.dataset.subj) {
              e.preventDefault();
              selectSubject(card.dataset.subj);
            }
          }
        });
      }

      // Subject Log Modal Button
      const btnLog = $('#btnSubjectLog');
      if (btnLog) {
        btnLog.addEventListener('click', () => {
          renderLog();
          const overlay = $('#subjectLogOverlay');
          if (overlay) overlay.hidden = false;
        });
      }

      renderCards();
    },
    render: renderCards,
    renderChips: renderCards,
    selectSubject,
    addSubject,
    deleteSubject,
    getNormalizedList,
  };
})();

/* ════════════════════════════════════════════════════════════
   14. UI — theme, modals, tabs, keyboard, boot
   ════════════════════════════════════════════════════════════ */
const UI = (() => {
  const THEMES = ['dark', 'light', 'lofi', 'rain'];
  const THEME_ICONS = { dark: '🌙', light: '☀️', lofi: '🎶', rain: '🌧️' };
  const AVATAR_LIST = ['🦉', '🐱', '🦊', '🐼', '🐺', '🦁', '🚀', '⚡', '☕', '🧠', '✨', '🎯', '📚', '🔥', '💎', '🌙', '🎧', '🥑'];

  function overlay(id, show) {
    const el = $('#' + id);
    if (el) el.hidden = !show;
  }

  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    const btn = $('#btnTheme');
    if (btn) btn.textContent = THEME_ICONS[t] || '🌙';
    const btnSidebarTheme = $('#btnSidebarTheme');
    if (btnSidebarTheme) btnSidebarTheme.textContent = `${THEME_ICONS[t] || '🌙'} Theme`;
    Store.d.theme = t; Store.save();
    if (typeof Chart !== 'undefined') Stats.draw();
  }

  function syncSoundUI() {
    const chime = !!Store.d.settings.chime;
    const soundHeaderIcon = $('#soundHeaderIcon');
    const soundHeaderLabel = $('#soundHeaderLabel');
    const btnSidebarSound = $('#btnSidebarSound');
    const setChime = $('#setChime');

    if (soundHeaderIcon) soundHeaderIcon.textContent = chime ? '🔊' : '🔇';
    if (soundHeaderLabel) soundHeaderLabel.textContent = chime ? 'Audio' : 'Muted';
    if (btnSidebarSound) btnSidebarSound.textContent = chime ? '🔊 Audio ON' : '🔇 Audio OFF';
    if (setChime) setChime.checked = chime;
  }

  function syncProfileUI() {
    const p = Store.d.profile || { nick: 'FocusMaster', avatar: '🦉' };
    const nick = p.nick && p.nick.trim() ? p.nick.trim() : 'FocusMaster';
    const avatar = p.avatar || '🦉';

    const sidebarNick = $('#sidebarNick');
    const sidebarAvatar = $('#sidebarAvatar');
    if (sidebarNick) sidebarNick.textContent = nick;
    if (sidebarAvatar) sidebarAvatar.textContent = avatar;

    const nicknameInput = $('#nicknameInput');
    if (nicknameInput) nicknameInput.value = nick;
  }

  function openSidebar() {
    const overlayEl = $('#sidebarOverlay');
    const sidebarEl = $('#glassSidebar');
    if (overlayEl && sidebarEl) {
      overlayEl.hidden = false;
      sidebarEl.hidden = false;
      syncProfileUI();
      syncSoundUI();
      // Reflow for transition
      void overlayEl.offsetWidth;
      overlayEl.classList.add('active');
      sidebarEl.classList.add('active');
    }
  }

  function closeSidebar() {
    const overlayEl = $('#sidebarOverlay');
    const sidebarEl = $('#glassSidebar');
    if (overlayEl && sidebarEl) {
      overlayEl.classList.remove('active');
      sidebarEl.classList.remove('active');
      setTimeout(() => {
        if (!overlayEl.classList.contains('active')) {
          overlayEl.hidden = true;
          sidebarEl.hidden = true;
        }
      }, 300);
    }
  }

  function openProfileModal() {
    const p = Store.d.profile || { nick: 'FocusMaster', avatar: '🦉' };
    const nickInput = $('#profileNickInput');
    if (nickInput) nickInput.value = p.nick || 'FocusMaster';

    const picker = $('#profileAvatarPicker');
    if (picker) {
      picker.innerHTML = AVATAR_LIST.map((av) => `
        <button type="button" class="avatar-choice ${av === (p.avatar || '🦉') ? 'selected' : ''}" data-avatar="${av}" aria-label="Avatar ${av}">
          ${av}
        </button>
      `).join('');

      picker.querySelectorAll('.avatar-choice').forEach((btn) => {
        btn.addEventListener('click', () => {
          picker.querySelectorAll('.avatar-choice').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
        });
      });
    }

    overlay('localProfileOverlay', true);
  }

  function activateSideTab(panelId) {
    const targetTab = $(`.side-tab[data-panel="${panelId}"]`);
    if (targetTab) {
      $$('.side-tab').forEach((x) => x.classList.remove('active'));
      $$('.panel').forEach((p) => p.classList.remove('active'));
      targetTab.classList.add('active');
      const panel = $('#' + panelId);
      if (panel) panel.classList.add('active');
      if (panelId === 'panelStats') Stats.draw();
    }
  }

  return {
    init() {
      // theme
      applyTheme(Store.d.theme || 'dark');
      const btnTheme = $('#btnTheme');
      if (btnTheme) {
        btnTheme.addEventListener('click', () => {
          const cur = document.documentElement.dataset.theme;
          const idx = THEMES.indexOf(cur);
          applyTheme(THEMES[(idx + 1) % THEMES.length]);
        });
      }
      const btnSidebarTheme = $('#btnSidebarTheme');
      if (btnSidebarTheme) {
        btnSidebarTheme.addEventListener('click', () => {
          const cur = document.documentElement.dataset.theme;
          const idx = THEMES.indexOf(cur);
          applyTheme(THEMES[(idx + 1) % THEMES.length]);
        });
      }

      // sound & chime sync
      syncSoundUI();
      const btnHeaderSound = $('#btnHeaderSound');
      if (btnHeaderSound) {
        btnHeaderSound.addEventListener('click', () => {
          Store.d.settings.chime = !Store.d.settings.chime;
          Store.save();
          syncSoundUI();
          toast(Store.d.settings.chime ? 'Sound Effects Enabled 🔊' : 'Sound Effects Muted 🔇', Store.d.settings.chime ? 'good' : '');
        });
      }
      const btnSidebarSound = $('#btnSidebarSound');
      if (btnSidebarSound) {
        btnSidebarSound.addEventListener('click', () => {
          Store.d.settings.chime = !Store.d.settings.chime;
          Store.save();
          syncSoundUI();
          toast(Store.d.settings.chime ? 'Sound Effects Enabled 🔊' : 'Sound Effects Muted 🔇', Store.d.settings.chime ? 'good' : '');
        });
      }

      // fullscreen toggle
      const btnFullscreen = $('#btnHeaderFullscreen');
      const fullscreenIcon = $('#fullscreenIcon');
      function updateFullscreenIcon() {
        const isFull = !!document.fullscreenElement;
        if (fullscreenIcon) fullscreenIcon.textContent = isFull ? '🗗' : '⛶';
        if (btnFullscreen) {
          const cap = btnFullscreen.querySelector('.btn-caption');
          if (cap) cap.textContent = isFull ? 'Exit' : 'Expand';
        }
      }
      if (btnFullscreen) {
        btnFullscreen.addEventListener('click', () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          }
        });
      }
      document.addEventListener('fullscreenchange', updateFullscreenIcon);

      // hamburger & glassmorphic sidebar
      const btnHamburger = $('#btnHamburger');
      const btnCloseSidebar = $('#btnCloseSidebar');
      const sidebarOverlayEl = $('#sidebarOverlay');
      if (btnHamburger) btnHamburger.addEventListener('click', openSidebar);
      if (btnCloseSidebar) btnCloseSidebar.addEventListener('click', closeSidebar);
      if (sidebarOverlayEl) sidebarOverlayEl.addEventListener('click', closeSidebar);

      // sidebar user profile pill
      const btnOpenProfile = $('#btnOpenProfileModal');
      if (btnOpenProfile) btnOpenProfile.addEventListener('click', () => { closeSidebar(); openProfileModal(); });

      // sidebar navigation links
      $$('.sidebar-link').forEach((link) => {
        link.addEventListener('click', () => {
          const nav = link.dataset.nav;
          $$('.sidebar-link').forEach((l) => l.classList.remove('active'));
          link.classList.add('active');
          closeSidebar();

          switch (nav) {
            case 'dashboard':
              window.scrollTo({ top: 0, behavior: 'smooth' });
              break;
            case 'subjects':
              activateSideTab('panelTools');
              const subjSection = $('.subject-card') || $('#panelTools');
              if (subjSection) subjSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
              break;
            case 'stats':
              activateSideTab('panelStats');
              const statsEl = $('#panelStats');
              if (statsEl) statsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              break;
            case 'rooms':
              activateSideTab('panelRoom');
              const roomEl = $('#panelRoom');
              if (roomEl) roomEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              break;
            case 'journal':
              activateSideTab('panelTools');
              const diaryEl = $('#diaryCard') || $('#panelTools');
              if (diaryEl) diaryEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              break;
            case 'ambient':
              overlay('ambientOverlay', true);
              break;
            case 'profile':
              openProfileModal();
              break;
            case 'settings':
              loadSettings();
              overlay('settingsOverlay', true);
              break;
          }
        });
      });

      // local profile modal handling
      const btnSaveProfile = $('#btnSaveProfile');
      if (btnSaveProfile) {
        btnSaveProfile.addEventListener('click', () => {
          const nickInput = $('#profileNickInput');
          const nick = nickInput ? nickInput.value.trim() || 'FocusMaster' : 'FocusMaster';
          const selAvatar = $('#profileAvatarPicker .avatar-choice.selected')?.dataset.avatar || '🦉';

          Store.d.profile = { nick, avatar: selAvatar };
          Store.save();
          syncProfileUI();
          overlay('localProfileOverlay', false);
          toast('Local profile saved ✓', 'good');

          // If inside a live room, update my nick & avatar
          if (Rooms && Rooms.inRoom) {
            Rooms.broadcastState();
          }
          if (typeof LocalLeaderboard !== 'undefined' && LocalLeaderboard.render) {
            LocalLeaderboard.render();
          }
        });
      }
      syncProfileUI();

      // side tabs
      $$('.side-tab').forEach((t) => t.addEventListener('click', () => {
        $$('.side-tab').forEach((x) => x.classList.remove('active'));
        $$('.panel').forEach((p) => p.classList.remove('active'));
        t.classList.add('active');
        const panel = $('#' + t.dataset.panel);
        if (panel) panel.classList.add('active');
        if (t.dataset.panel === 'panelStats') Stats.draw();
      }));

      // modals
      const btnAmbient = $('#btnAmbient');
      const btnSettings = $('#btnSettings');
      if (btnAmbient) btnAmbient.addEventListener('click', () => overlay('ambientOverlay', true));
      if (btnSettings) btnSettings.addEventListener('click', () => { loadSettings(); overlay('settingsOverlay', true); });
      $$('.close-btn').forEach((b) => b.addEventListener('click', () => overlay(b.dataset.close, false)));
      $$('.overlay').forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) o.hidden = true; }));

      // settings
      function loadSettings() {
        const s = Store.d.settings;
        const set = (id, val) => { const el = $(id); if (el) el.value = val; };
        const setChecked = (id, val) => { const el = $(id); if (el) el.checked = val; };
        set('#setFocus', s.focus); set('#setShort', s.short); set('#setLong', s.long);
        set('#setCustom', s.custom); set('#setRounds', s.rounds);
        setChecked('#setAutoStart', s.autoStart); setChecked('#setChime', s.chime); set('#setVolume', s.volume);
      }
      const btnSave = $('#btnSaveSettings');
      if (btnSave) {
        btnSave.addEventListener('click', () => {
          const s = Store.d.settings;
          const getVal = (id, def) => { const el = $(id); return el ? +el.value || def : def; };
          const getChecked = (id) => { const el = $(id); return el ? el.checked : false; };
          s.focus = getVal('#setFocus', 25); s.short = getVal('#setShort', 5);
          s.long = getVal('#setLong', 15); s.custom = getVal('#setCustom', 45);
          s.rounds = getVal('#setRounds', 4);
          s.autoStart = getChecked('#setAutoStart'); s.chime = getChecked('#setChime');
          s.volume = getVal('#setVolume', 70);
          Store.save();
          syncSoundUI();
          overlay('settingsOverlay', false);
          Timer.reset(); Timer.setMode(Timer.mode);
          toast('Settings saved ✓', 'good');
        });
      }

      // leaderboard segments
      const lbSeg = $('#lbSeg');
      if (lbSeg) {
        lbSeg.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          $$('#lbSeg button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          const scope = $('#lbScope');
          if (scope) scope.textContent = b.textContent;
          Rooms.renderLeaderboard(b.dataset.scope);
        });
      }

      // chart range
      const chartSeg = $('#chartSeg');
      if (chartSeg) {
        chartSeg.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          $$('#chartSeg button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          Stats.setRange(+b.dataset.range);
        });
      }

      // spotify
      const btnSpotify = $('#btnSpotify');
      if (btnSpotify) {
        btnSpotify.addEventListener('click', () => {
          const input = $('#spotifyUrl');
          const url = input ? input.value.trim() : '';
          if (url) Music.embedSpotify(url);
        });
      }
      Music.restore();

      // keyboard
      document.addEventListener('keydown', (e) => {
        if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.code === 'Space') { e.preventDefault(); const btn = $('#btnStartPause'); if (btn) btn.click(); }
        if (e.key === 'r' || e.key === 'R') Timer.reset();
        if (e.key === 's' || e.key === 'S') Timer.skip();
      });

      // title sync
      setInterval(() => {
        const t = Timer;
        document.title = t.running ? `${fmt(t.left)} · ${t.mode === 'stopwatch' ? 'Stopwatch' : t.mode} — GoTime4Study` : 'GoTime4Study — Focus Timer';
      }, 1000);

      // FAQ Accordion Toggles
      const faqContainer = $('#faqAccordion');
      if (faqContainer) {
        faqContainer.addEventListener('click', (e) => {
          const trigger = e.target.closest('.faq-trigger');
          if (!trigger) return;
          const item = trigger.closest('.faq-item');
          if (!item) return;
          const isAlreadyOpen = item.classList.contains('open');

          // Close all other accordion items for clean accordion UX
          $$('.faq-item').forEach((it) => {
            it.classList.remove('open');
            const btn = it.querySelector('.faq-trigger');
            if (btn) btn.setAttribute('aria-expanded', 'false');
          });

          if (!isAlreadyOpen) {
            item.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
          }
        });
      }

      // periodic room heartbeat
      setInterval(() => { if (Rooms.inRoom) Rooms.broadcastState(); }, 4000);
    },
  };
})();

/* ════════════════════════════════════════════════════════════
   15. EXAM COUNTDOWN — custom target date persisted in LocalStorage
   ════════════════════════════════════════════════════════════ */
const ExamCountdown = (() => {
  const KEY = 'gt4s_exam_target_v1';
  let config = load();
  let timerId = null;

  function toLocalDatetimeString(date) {
    const pad = n => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  function parseTargetTime(targetStr) {
    if (!targetStr) return NaN;
    if (typeof targetStr === 'number') return targetStr;
    const s = String(targetStr).trim();
    const parts = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (parts) {
      const [, y, m, d, h = '00', min = '00', sec = '00'] = parts;
      const dt = new Date(+y, +m - 1, +d, +h, +min, +sec);
      return dt.getTime();
    }
    const parsed = new Date(s).getTime();
    return parsed;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') return data;
      }
    } catch {}
    // Default: 30 days ahead from now at 09:00 local time
    const defDate = new Date();
    defDate.setDate(defDate.getDate() + 30);
    defDate.setHours(9, 0, 0, 0);
    return { name: 'Semester Finals', target: toLocalDatetimeString(defDate) };
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(config)); } catch {}
  }

  function updateDisplay() {
    const daysEl = $('#cdDays'), hrsEl = $('#cdHours'), minsEl = $('#cdMins'), secsEl = $('#cdSecs');
    const labelEl = $('#examTargetLabel'), dateTextEl = $('#examTargetDateText');
    if (!daysEl || !hrsEl || !minsEl || !secsEl) return;

    if (!config || !config.target) {
      if (labelEl) labelEl.textContent = '🎯 Target: Not Set';
      if (dateTextEl) dateTextEl.textContent = 'Select target exam date above to begin countdown';
      daysEl.textContent = '00'; hrsEl.textContent = '00'; minsEl.textContent = '00'; secsEl.textContent = '00';
      return;
    }

    const targetTime = parseTargetTime(config.target);
    if (isNaN(targetTime)) {
      if (labelEl) labelEl.textContent = `🎯 Target: ${esc(config.name || 'Target Exam')}`;
      if (dateTextEl) dateTextEl.textContent = 'Invalid target date format';
      daysEl.textContent = '00'; hrsEl.textContent = '00'; minsEl.textContent = '00'; secsEl.textContent = '00';
      return;
    }

    if (labelEl) labelEl.textContent = `🎯 Target: ${esc(config.name || 'Target Exam')}`;

    const targetDate = new Date(targetTime);
    const now = Date.now();
    const diff = targetTime - now;

    if (diff <= 0) {
      daysEl.textContent = '00'; hrsEl.textContent = '00'; minsEl.textContent = '00'; secsEl.textContent = '00';
      if (dateTextEl) dateTextEl.textContent = '🎉 Exam Milestone Reached! Best of luck!';
      return;
    }

    if (dateTextEl) {
      dateTextEl.textContent = targetDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) + ' · ' + targetDate.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    const totalSecs = Math.floor(diff / 1000);
    const sec = totalSecs % 60;
    const min = Math.floor(totalSecs / 60) % 60;
    const hr = Math.floor(totalSecs / 3600) % 24;
    const days = Math.floor(totalSecs / 86400);

    daysEl.textContent = String(days).padStart(2, '0');
    hrsEl.textContent = String(hr).padStart(2, '0');
    minsEl.textContent = String(min).padStart(2, '0');
    secsEl.textContent = String(sec).padStart(2, '0');
  }

  function startTicker() {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(updateDisplay, 1000);
  }

  return {
    init() {
      const nameInput = $('#examNameInput');
      const dateInput = $('#examDateInput');
      const btnSet = $('#btnSetExam');
      const btnClear = $('#btnClearExam');

      if (nameInput) nameInput.value = config.name || '';
      if (dateInput && config.target) {
        const t = parseTargetTime(config.target);
        if (!isNaN(t)) {
          dateInput.value = toLocalDatetimeString(new Date(t));
        } else {
          dateInput.value = config.target;
        }
      }

      if (btnSet) {
        btnSet.addEventListener('click', () => {
          const name = (nameInput ? nameInput.value.trim() : '') || 'Semester Finals';
          const target = dateInput ? dateInput.value.trim() : '';
          if (!target) {
            toast('Please choose a valid target date & time', 'bad');
            return;
          }
          const targetTime = parseTargetTime(target);
          if (isNaN(targetTime)) {
            toast('Invalid date format selected', 'bad');
            return;
          }
          if (targetTime <= Date.now()) {
            toast('Note: The selected date is in the past', 'warn');
          } else {
            toast(`Exam countdown locked for ${name}! 🎯`, 'good');
          }

          config = { name, target };
          save();
          updateDisplay();
          startTicker();
        });
      }

      if (btnClear) {
        btnClear.addEventListener('click', () => {
          config = { name: '', target: '' };
          save();
          if (nameInput) nameInput.value = '';
          if (dateInput) dateInput.value = '';
          updateDisplay();
          toast('Exam countdown reset');
        });
      }

      updateDisplay();
      startTicker();
    },
    updateDisplay,
  };
})();

/* ════════════════════════════════════════════════════════════
   16. LOCAL LEADERBOARD — private study ranking & mastery tier
   ════════════════════════════════════════════════════════════ */
const LocalLeaderboard = (() => {
  const TIERS = [
    { minMins: 3600, title: '👑 Grandmaster of Deep Work' },
    { minMins: 1800, title: '💎 Diamond Scholar' },
    { minMins: 900,  title: '🥇 Gold Master' },
    { minMins: 300,  title: '🔥 Silver Achiever' },
    { minMins: 60,   title: '⚡ Bronze Scholar' },
    { minMins: 0,    title: '🌱 Apprentice Focus' },
  ];

  function getTier(totalMin) {
    return TIERS.find((t) => totalMin >= t.minMins) || TIERS[TIERS.length - 1];
  }

  function render() {
    const avatarEl = $('#localRankAvatar');
    const tierEl = $('#localRankTier');
    const summaryEl = $('#localRankSummary');
    const lifetimeEl = $('#localLifetimeFocus');
    const listEl = $('#localSubjectRankList');

    const profile = Store.d.profile || { nick: 'You', avatar: '🦉' };
    const totalMin = Stats.totalsFor('all');
    const tier = getTier(totalMin);

    if (avatarEl) avatarEl.textContent = profile.avatar || '🦉';
    if (tierEl) tierEl.textContent = tier.title;
    if (summaryEl) summaryEl.textContent = `${esc(profile.nick || 'You')} · Local Study Vault Rank #1`;
    if (lifetimeEl) lifetimeEl.textContent = fmtMin(totalMin);

    if (!listEl) return;
    const logs = Store.d.subjectLogs || {};
    const agg = {};
    Object.values(logs).forEach((dayEntries) => {
      if (!Array.isArray(dayEntries)) return;
      dayEntries.forEach((e) => {
        if (e.subject) agg[e.subject] = (agg[e.subject] || 0) + (e.minutes || 0);
      });
    });

    const sorted = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) {
      listEl.innerHTML = '<li class="hint-sm" style="padding:12px 0;text-align:center">No subject hours logged yet. Start a focus session above! 📚</li>';
      return;
    }

    const rankIcons = ['🥇', '🥈', '🥉'];
    listEl.innerHTML = sorted.slice(0, 6).map(([subj, mins], i) => `
      <li class="local-sb-item">
        <div class="local-sb-left">
          <span class="local-sb-rank">${i < 3 ? rankIcons[i] : (i + 1) + '.'}</span>
          <span class="local-sb-name">${esc(subj)}</span>
        </div>
        <span class="local-sb-time">${fmtMin(mins)}</span>
      </li>`).join('');
  }

  return {
    init() { render(); },
    render,
  };
})();

/* ════════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const safe = (label, fn) => { try { fn(); } catch (err) { console.error(`[GoTime4Study] ${label} failed:`, err); } };

  safe('UI.init', () => UI.init());
  safe('Timer.init', () => Timer.init());
  safe('Ambient.buildUI', () => Ambient.buildUI($('#mixGrid'), (id, vol) => Ambient.set(id, vol)));
  const btnMixStop = $('#btnMixStop');
  if (btnMixStop) btnMixStop.addEventListener('click', () => { Ambient.stopAll(); toast('Ambient sounds stopped'); });
  safe('Music.init', () => Music.init());
  safe('Rooms.init', () => Rooms.init());
  safe('Stats.refresh', () => Stats.refresh());
  safe('Badges.init', () => Badges.init());
  safe('Badges.check', () => Badges.check());
  safe('Scenes.init', () => Scenes.init());
  safe('Journal.init', () => Journal.init());
  safe('StrictFocus.init', () => StrictFocus.init());
  safe('SubjectLogger.init', () => SubjectLogger.init());
  safe('ExamCountdown.init', () => ExamCountdown.init());
  safe('LocalLeaderboard.init', () => LocalLeaderboard.init());
});