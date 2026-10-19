/* Pink Music —— 酒馆音乐扩展(独立插件) */
(() => {
    'use strict';

    const BASE = '/api/plugins/pink-music';
    const STORE = 'pink-music:v1';
    const THEMES = ['black', 'white', 'pink', 'blush', 'sky'];
    const NAMES = { netease: '网易云', qq: 'QQ 音乐' };

    // ---------- 设置 ----------
    const defaults = {
        theme: 'pink',
        ball: { x: 12, y: 280 },
        lyric: { on: true, locked: false, size: 20, x: null, y: null, mode: 'multi', color: '', dim: '', bg: '', bgAlpha: null },
        platform: 'netease',
        mode: 'loop',
        fade: { on: false, sec: 6 },
    };
    function loadSettings() {
        try {
            const s = JSON.parse(localStorage.getItem(STORE) || '{}');
            return {
                ...defaults, ...s,
                ball: { ...defaults.ball, ...(s.ball || {}) },
                lyric: { ...defaults.lyric, ...(s.lyric || {}) },
                fade: { ...defaults.fade, ...(s.fade || {}) },
            };
        } catch { return structuredClone(defaults); }
    }
    const S = loadSettings();
    const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch { /* 忽略 */ } };

    // ---------- 接口 ----------
    function headers() {
        const c = window.SillyTavern?.getContext?.();
        return c?.getRequestHeaders ? c.getRequestHeaders() : { 'Content-Type': 'application/json' };
    }
    async function api(path, { method = 'GET', body, timeout = 20000 } = {}) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), timeout);
        try {
            const res = await fetch(BASE + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
            if (res.status === 404) throw new Error('后端插件没有加载:请确认已放进 plugins 并开启 enableServerPlugins,然后重启酒馆');
            const j = await res.json().catch(() => ({}));
            if (!j.ok) throw new Error(j.error || '请求失败');
            return j;
        } catch (e) {
            if (e.name === 'AbortError') throw new Error(`等了 ${Math.round(timeout / 1000)} 秒后端还没有回应,请看酒馆黑色窗口有没有报错`);
            throw e;
        } finally { clearTimeout(timer); }
    }

    // ---------- DOM ----------
    const el = (tag, cls, html) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html != null) e.innerHTML = html;
        return e;
    };
    const ICON = {
        prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12 18 18V6z"/></svg>',
        next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
        play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
        pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
        loop: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
        one: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>',
        shuffle: '<svg viewBox="0 0 24 24"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>',
        order: '<svg viewBox="0 0 24 24"><path d="M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z"/></svg>',
        heartOff: '<svg viewBox="0 0 24 24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>',
        heartOn: '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    };
    const R = 24, C = 2 * Math.PI * R;

    const root = el('div'); root.id = 'pm-root';
    root.innerHTML = `
      <div id="pm-ball" title="音乐">
        <svg viewBox="0 0 52 52"><circle class="pm-ring-bg" cx="26" cy="26" r="${R}"/><circle class="pm-ring" cx="26" cy="26" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg>
        <div class="pm-disc"><span class="pm-note">♪</span></div>
      </div>
      <div id="pm-lyric"><div class="pm-multi"><div class="pm-roll"></div></div><div class="pm-single"><div class="pm-l1"><span></span></div><div class="pm-l2"></div></div></div>
      <div id="pm-panel">
        <div class="pm-now">
          <div class="pm-cover"></div>
          <div class="pm-meta"><div class="pm-title">还没有播放</div><div class="pm-artist">去「搜索」找一首歌</div></div>
          <button class="pm-close" aria-label="收起">×</button>
        </div>
        <div class="pm-bar">
          <div class="pm-track" role="slider" aria-label="播放进度"><div class="pm-fill"></div></div>
          <div class="pm-time"><span class="pm-cur">0:00</span><span class="pm-dur">0:00</span></div>
        </div>
        <div class="pm-ctrl">
          <button class="pm-btn pm-mode" aria-label="播放顺序"></button>
          <button class="pm-btn pm-prev" aria-label="上一首">${ICON.prev}</button>
          <button class="pm-btn main pm-toggle" aria-label="播放">${ICON.play}</button>
          <button class="pm-btn pm-next" aria-label="下一首">${ICON.next}</button>
          <button class="pm-btn pm-like" aria-label="喜欢" style="visibility:hidden"></button>
        </div>
        <div class="pm-tabs">
          <button class="pm-tab on" data-tab="search">搜索</button>
          <button class="pm-tab" data-tab="lists">歌单</button>
          <button class="pm-tab" data-tab="account">账号</button>
          <button class="pm-tab" data-tab="look">外观</button>
        </div>
        <div class="pm-body"></div>
      </div>`;
    document.body.appendChild(root);

    const $ = (s) => root.querySelector(s);
    const ball = $('#pm-ball'), panel = $('#pm-panel'), lyricBox = $('#pm-lyric');
    const ring = $('.pm-ring'), disc = $('.pm-disc'), body = $('.pm-body');
    const audioA = new Audio(), audioB = new Audio();
    audioA.preload = 'auto'; audioB.preload = 'auto';
    let audio = audioA;                                  // 当前正在用的播放器
    const otherAudio = () => (audio === audioA ? audioB : audioA);
    // 两个播放器的事件,只响应「当前」那个(过渡时旧的那个不会干扰界面)
    const onAudio = (evt, fn) => [audioA, audioB].forEach((a) => a.addEventListener(evt, (e) => { if (a === audio) fn(e); }));

    function applyTheme() { root.dataset.theme = THEMES.includes(S.theme) ? S.theme : 'pink'; }
    applyTheme();

    // ---------- 拖动(悬浮球 & 歌词) ----------
    function makeDraggable(node, { onTap, onMove, onEnd, canDrag = () => true }) {
        let sx, sy, ox, oy, moved = false, active = false;
        node.addEventListener('pointerdown', (e) => {
            if (!canDrag()) return;
            active = true; moved = false;
            sx = e.clientX; sy = e.clientY;
            const r = node.getBoundingClientRect(); ox = r.left; oy = r.top;
            node.setPointerCapture(e.pointerId);
        });
        node.addEventListener('pointermove', (e) => {
            if (!active) return;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (!moved && Math.hypot(dx, dy) < 6) return;
            moved = true; node.classList.add('dragging');
            onMove(ox + dx, oy + dy);
        });
        const end = () => {
            if (!active) return;
            active = false; node.classList.remove('dragging');
            if (moved) onEnd?.(); else onTap?.();
        };
        node.addEventListener('pointerup', end);
        node.addEventListener('pointercancel', end);
    }
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

    function placeBall() {
        const w = window.innerWidth, h = window.innerHeight;
        S.ball.x = clamp(S.ball.x, 4, w - 56);
        S.ball.y = clamp(S.ball.y, 4, h - 56);
        ball.style.left = S.ball.x + 'px'; ball.style.top = S.ball.y + 'px';
    }
    makeDraggable(ball, {
        onTap: () => togglePanel(),
        onMove: (x, y) => { S.ball.x = x; S.ball.y = y; placeBall(); if (panel.classList.contains('open')) placePanel(); },
        onEnd: () => {
            S.ball.x = S.ball.x + 26 < window.innerWidth / 2 ? 8 : window.innerWidth - 60;
            placeBall(); save();
            if (panel.classList.contains('open')) placePanel();
        },
    });

    function placeLyric() {
        const r = lyricBox.getBoundingClientRect();
        if (!r.width) return;
        if (S.lyric.x == null) { S.lyric.x = Math.max(8, (window.innerWidth - r.width) / 2); S.lyric.y = 90; }
        S.lyric.x = clamp(S.lyric.x, 0, Math.max(0, window.innerWidth - r.width));
        S.lyric.y = clamp(S.lyric.y, 0, Math.max(0, window.innerHeight - r.height));
        lyricBox.style.left = S.lyric.x + 'px'; lyricBox.style.top = S.lyric.y + 'px';
        lyricBox.style.transform = 'none';
    }
    makeDraggable(lyricBox, {
        canDrag: () => !S.lyric.locked,
        onMove: (x, y) => { S.lyric.x = x; S.lyric.y = y; placeLyric(); },
        onEnd: save,
    });

    function hexRgb(h) {
        const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
        if (!m) return [128, 128, 128];
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const themeVar = (n) => getComputedStyle(root).getPropertyValue(n).trim();

    function applyLyric() {
        const L = S.lyric, st = lyricBox.style;
        lyricBox.classList.toggle('on', !!L.on);
        lyricBox.classList.toggle('locked', !!L.locked);
        lyricBox.dataset.mode = L.mode === 'single' ? 'single' : 'multi';
        st.setProperty('--pm-lyric-size', L.size + 'px');
        st.setProperty('--pm-row', Math.round(L.size * 1.9) + 'px');
        if (L.color) st.setProperty('--hi', L.color); else st.removeProperty('--hi');
        if (L.dim) st.setProperty('--sub', L.dim); else st.removeProperty('--sub');
        if (L.bg || L.bgAlpha != null) {
            const [r, g, b] = hexRgb(L.bg || themeVar('--bg'));
            st.setProperty('--glass', `rgba(${r},${g},${b},${(L.bgAlpha ?? 80) / 100})`);
        } else st.removeProperty('--glass');
        requestAnimationFrame(() => {
            if (lrc.length) showLine(Math.max(lrcIdx, -1), true);
            placeLyric();
        });
    }

    // ---------- 面板开合 ----------
    function placePanel() {
        const w = window.innerWidth, h = window.innerHeight;
        const pw = Math.min(w * 0.92, 340);
        const ph = panel.offsetHeight || 460;
        const left = S.ball.x + 26 < w / 2 ? S.ball.x : S.ball.x + 52 - pw;
        const above = S.ball.y + 26 > h / 2;
        const top = above ? S.ball.y - ph - 10 : S.ball.y + 62;
        panel.style.left = clamp(left, 8, w - pw - 8) + 'px';
        panel.style.top = clamp(top, 8, Math.max(8, h - ph - 8)) + 'px';
    }
    function togglePanel(force) {
        const open = force ?? !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        if (open) { placePanel(); renderTab(); refreshStatus(); }
    }
    $('.pm-close').addEventListener('click', () => togglePanel(false));
    window.addEventListener('resize', () => { placeBall(); placeLyric(); if (panel.classList.contains('open')) placePanel(); });

    // ---------- 播放核心 ----------
    let queue = [], idx = -1, lrc = [], lrcIdx = -1;
    const fmt = (t) => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

    function parseLrc(text) {
        const out = [];
        for (const line of String(text || '').split(/\r?\n/)) {
            const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
            if (!tags.length) continue;
            const txt = line.replace(/\[[^\]]*\]/g, '').trim();
            if (!txt) continue;
            for (const t of tags) out.push({ t: Number(t[1]) * 60 + Number(t[2]), text: txt });
        }
        return out.sort((a, b) => a.t - b.t);
    }
    function mergeTrans(main, trans) {
        if (!trans.length) return main;
        return main.map((l) => {
            const m = trans.find((x) => Math.abs(x.t - l.t) < 0.6);
            return m ? { ...l, sub: m.text } : l;
        });
    }
    // ----- 悬浮歌词:多行滚动(3 行) / 单行跑马灯 -----
    const roll = lyricBox.querySelector('.pm-roll');
    const l1 = lyricBox.querySelector('.pm-l1'), l1s = l1.querySelector('span'), l2 = lyricBox.querySelector('.pm-l2');
    let marq = null, curRow = null;
    const rowPx = () => Math.round(S.lyric.size * 1.9);

    function stopMarq() { if (marq) { marq.cancel(); marq = null; } }
    function startMarq(i) {
        if (lyricBox.dataset.mode !== 'single' || !S.lyric.on || !lrc[i]) return;
        const over = l1s.offsetWidth - l1.clientWidth;
        if (over < 4) return;
        const end = lrc[i + 1]?.t ?? (audio.duration || lrc[i].t + 6);
        const dur = Math.max(1.5, (end - lrc[i].t) * 0.85);
        marq = l1s.animate(
            [{ transform: 'translateX(0)' }, { transform: `translateX(${-over - 4}px)` }],
            { duration: dur * 1000, delay: 350, easing: 'linear', fill: 'forwards' },
        );
        if (audio.paused) marq.pause();
    }
    onAudio('pause', () => marq?.pause());
    onAudio('play', () => marq?.play());

    function buildRoll() {
        roll.innerHTML = '';
        lrc.forEach((l) => { const d = el('div', 'pm-row-l'); d.textContent = l.text; roll.appendChild(d); });
        curRow = null;
    }
    function setLyricMessage(t) {
        stopMarq();
        roll.innerHTML = ''; curRow = null;
        roll.style.transition = 'none'; roll.style.transform = 'translateY(0)';
        roll.appendChild(el('div', 'pm-row-l'));
        const m = el('div', 'pm-row-l cur'); m.textContent = t || ''; roll.appendChild(m);
        l1s.textContent = t || ''; l2.textContent = '';
        requestAnimationFrame(placeLyric);
    }
    function showLine(i, instant) {
        const L = lrc[i];
        if (curRow) curRow.classList.remove('cur');
        curRow = i >= 0 ? roll.children[i] || null : null;
        if (curRow) curRow.classList.add('cur');
        roll.style.transition = instant ? 'none' : '';
        roll.style.transform = `translateY(${(1 - Math.max(i, 0)) * rowPx()}px)`;
        stopMarq();
        l1s.textContent = L ? L.text : '';
        l2.textContent = L ? (L.sub || lrc[i + 1]?.text || '') : (lrc[0]?.text || '');
        if (L) requestAnimationFrame(() => startMarq(i));
        requestAnimationFrame(placeLyric);
    }
    function syncLyric() {
        if (!lrc.length) return;
        const t = audio.currentTime + 0.25;
        let lo = 0, hi = lrc.length - 1, i = -1;
        while (lo <= hi) { const m = (lo + hi) >> 1; if (lrc[m].t <= t) { i = m; lo = m + 1; } else hi = m - 1; }
        if (i === lrcIdx) return;
        lrcIdx = i;
        showLine(i);
    }

    function setBusy(text, isErr) {
        const t = $('.pm-artist');
        if (text) { t.textContent = text; t.style.color = isErr ? '#d6456b' : ''; }
    }
    function renderNow() {
        const tr = queue[idx];
        $('.pm-title').textContent = tr ? tr.name : '还没有播放';
        $('.pm-artist').textContent = tr ? tr.artist : '去「搜索」找一首歌';
        $('.pm-artist').style.color = '';
        $('.pm-cover').style.backgroundImage = tr?.cover ? `url("${tr.cover}")` : '';
        disc.style.backgroundImage = tr?.cover ? `url("${tr.cover}")` : '';
        disc.classList.toggle('has-cover', !!tr?.cover);
        $('.pm-dur').textContent = fmt(tr?.duration);
        const key = tr ? tr.platform + ':' + tr.id : '';
        body.querySelectorAll('.pm-item').forEach((n) => n.classList.toggle('cur', !!key && n.dataset.k === key));
        paintMainHeart();
        if ('mediaSession' in navigator && tr) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: tr.name, artist: tr.artist, album: tr.album || '',
                artwork: tr.cover ? [{ src: tr.cover, sizes: '300x300' }] : [],
            });
        }
    }
    function renderPlayState() {
        const playing = !audio.paused && !audio.ended;
        $('.pm-toggle').innerHTML = playing ? ICON.pause : ICON.play;
        $('.pm-toggle').setAttribute('aria-label', playing ? '暂停' : '播放');
        ball.classList.toggle('playing', playing);
    }

    // ---------- 播放顺序 ----------
    const MODES = [
        { k: 'loop', name: '列表循环', icon: ICON.loop },
        { k: 'one', name: '单曲循环', icon: ICON.one },
        { k: 'shuffle', name: '随机播放', icon: ICON.shuffle },
        { k: 'order', name: '顺序播放', icon: ICON.order },
    ];
    const curMode = () => MODES.find((m) => m.k === S.mode) || MODES[0];
    const playedStack = [];
    function paintMode() {
        const m = curMode(), b = $('.pm-mode');
        b.innerHTML = m.icon; b.title = m.name; b.setAttribute('aria-label', '播放顺序:' + m.name);
    }
    function flash(text) { setBusy(text); clearTimeout(flash.t); flash.t = setTimeout(renderNow, 1800); }
    $('.pm-mode').addEventListener('click', () => {
        S.mode = MODES[(MODES.indexOf(curMode()) + 1) % MODES.length].k;
        save(); paintMode(); flash(curMode().name);
    });
    // auto=true 表示这首唱完自动接下一首;false 表示手动点「下一首」
    function nextIndex(auto) {
        const n = queue.length; if (!n) return -1;
        if (S.mode === 'one' && auto) return idx;
        if (S.mode === 'shuffle') {
            if (n === 1) return 0;
            let j; do { j = Math.floor(Math.random() * n); } while (j === idx);
            return j;
        }
        if (idx + 1 >= n) return (S.mode === 'order' && auto) ? -1 : 0;
        return idx + 1;
    }

    // ---------- 喜欢(网易云「我喜欢的音乐」) ----------
    let liked = new Set();
    function paintHeart(b) {
        const on = liked.has(b.dataset.id);
        b.classList.toggle('on', on);
        b.innerHTML = on ? ICON.heartOn : ICON.heartOff;
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', on ? '取消喜欢' : '喜欢');
    }
    function paintMainHeart() {
        const b = $('.pm-like'), tr = queue[idx];
        const ok = !!tr && tr.platform === 'netease' && !!status.netease?.loggedIn;
        b.style.visibility = ok ? 'visible' : 'hidden';
        if (ok) { b.dataset.id = tr.id; paintHeart(b); }
    }
    function paintAllHearts() { root.querySelectorAll('.pm-heart[data-id]').forEach(paintHeart); paintMainHeart(); }
    async function toggleLike(tr) {
        const want = !liked.has(tr.id);
        if (want) liked.add(tr.id); else liked.delete(tr.id);
        paintAllHearts();
        try {
            await api('/netease/like', { method: 'POST', body: { id: tr.id, like: want } });
            flash(want ? '已加入「我喜欢的音乐」' : '已取消喜欢');
        } catch (e) {
            if (want) liked.delete(tr.id); else liked.add(tr.id);
            paintAllHearts(); flash(e.message);
        }
    }
    function heartBtn(tr) {
        if (tr.platform !== 'netease' || !status.netease?.loggedIn) return null;
        const b = el('button', 'pm-heart'); b.dataset.id = tr.id; paintHeart(b);
        b.onclick = (e) => { e.stopPropagation(); toggleLike(tr); };
        return b;
    }
    $('.pm-like').addEventListener('click', () => { const tr = queue[idx]; if (tr) toggleLike(tr); });

    // ---------- 智能过渡(淡入淡出) ----------
    // 用两个播放器接力:快结束时让下一首淡入、这一首淡出。
    // iPhone 不能直接调音量,所以用 Web Audio 的增益控制,音频要经后端转发(同源)。
    const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    let ac = null, pre = false, playToken = 0, planned = null;
    const gains = new Map();
    const viaProxy = () => S.fade.on || ac !== null;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    function withTimeout(p, ms, msg) {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(msg)), ms);
            Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
        });
    }
    function ensureAC() {
        if (!ac) { const K = window.AudioContext || window.webkitAudioContext; if (!K) return null; ac = new K(); }
        if (ac.state === 'suspended') ac.resume().catch(() => {});
        return ac;
    }
    function gainOf(a) {
        if (!ensureAC()) return null;
        if (!gains.has(a)) {
            const src = ac.createMediaElementSource(a), g = ac.createGain();
            src.connect(g); g.connect(ac.destination); gains.set(a, g);
        }
        return gains.get(a);
    }
    function setGain(g, v) { const t = ac.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(v, t); }
    function ramp(g, to, sec) {
        const t = ac.currentTime; g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(to, t + sec);
    }
    function unlockOther() {   // iPhone 要求每个播放器都在点击时「解锁」一次
        const o = otherAudio();
        if (o._ul) return;
        o._ul = true; o.src = SILENT; o.play().then(() => o.pause()).catch(() => {});
    }
    function resetProgress() {
        $('.pm-fill').style.width = '0%'; $('.pm-cur').textContent = '0:00';
        ring.style.strokeDashoffset = String(C);
    }

    // 提前把下一首的地址要好,这首一结束就能立刻接着播(切后台时靠这个连播)
    async function prefetchNext() {
        if (planned || S.mode === 'one' || S.fade.on) return;
        const j = nextIndex(true);
        if (j < 0 || j === idx) return;
        const tr = queue[j];
        const mine = planned = { j, key: tr.platform + ':' + tr.id, url: '' };
        try {
            const r = await api(`/url?platform=${tr.platform}&id=${encodeURIComponent(tr.id)}`, { timeout: 25000 });
            mine.url = r.url;
        } catch { /* 失败就算了,结束时再走普通流程 */ }
    }

    async function playIndex(i, opts = {}) {
        if (i < 0 || i >= queue.length) return;
        const token = ++playToken;
        planned = null;
        const fadeIn = !!opts.fade && gains.has(audio) && !audio.paused;
        if (S.fade.on) { ensureAC(); if (!fadeIn) unlockOther(); }
        if (!opts.back && idx >= 0 && idx !== i) { playedStack.push(idx); if (playedStack.length > 50) playedStack.shift(); }
        const tr = queue[i];
        const startFresh = () => { idx = i; lrc = []; lrcIdx = -2; setLyricMessage(''); };
        if (!fadeIn) {
            audio.pause(); otherAudio().pause(); pre = false;
            startFresh(); resetProgress(); renderNow(); setBusy('正在获取播放地址…');
        }
        let url = opts.url || '';   // 有现成地址时,到 play() 之前不会有任何等待
        if (!url) {
            try {
                ({ url } = await api(`/url?platform=${tr.platform}&id=${encodeURIComponent(tr.id)}`, { timeout: 25000 }));
            } catch (e) {
                if (token === playToken) {
                    pre = false;
                    if (!fadeIn) { setBusy(e.message || '获取播放地址失败', true); renderPlayState(); }
                }
                return;
            }
            if (token !== playToken) return;
        }

        const out = fadeIn ? audio : null;
        const target = fadeIn ? otherAudio() : audio;
        const src = viaProxy() ? `${BASE}/stream?url=${encodeURIComponent(url)}` : url;
        try {
            const g = viaProxy() ? gainOf(target) : null;
            if (g) setGain(g, fadeIn ? 0 : 1);
            target.src = src;
            if (fadeIn) {   // 先让下一首缓冲,等到上一首只剩「过渡时长」再开始
                target.load();
                const left = (out.duration - out.currentTime) - S.fade.sec;
                if (left > 0.3) await sleep(left * 1000);
                if (token !== playToken) { target.pause(); return; }
            }
            await withTimeout(target.play(), 20000, '音频加载超过 20 秒,可能是网络慢或这首歌没有权限,试试下一首');
        } catch (e) {
            if (token === playToken) {
                target.pause(); target.removeAttribute('src'); pre = false;
                if (!fadeIn) { setBusy(e.message || '播放失败', true); renderPlayState(); }
            }
            return;
        }
        if (token !== playToken) { target.pause(); return; }

        if (fadeIn) {
            audio = target;
            const sec = Math.max(1, Math.min(S.fade.sec, (out.duration - out.currentTime) || S.fade.sec));
            ramp(gains.get(out), 0, sec); ramp(gains.get(target), 1, sec);
            setTimeout(() => { if (out !== audio) out.pause(); }, sec * 1000 + 300);
            startFresh(); pre = false;
        }
        renderNow(); renderPlayState();

        // 歌词(失败不影响播放)
        try {
            const l = await api(`/lyric?platform=${tr.platform}&id=${encodeURIComponent(tr.id)}`, { timeout: 12000 });
            if (token !== playToken) return;
            lrc = mergeTrans(parseLrc(l.lrc), parseLrc(l.tlrc));
            lrcIdx = -2;
            if (!lrc.length) setLyricMessage('纯音乐 / 暂无歌词');
            else { buildRoll(); syncLyric(); }
        } catch { if (token === playToken) setLyricMessage('暂无歌词'); }
    }
    function next() { const j = nextIndex(false); if (j >= 0) playIndex(j); }
    function prev() {
        if (!queue.length) return;
        if (audio.currentTime > 4) { audio.currentTime = 0; return; }
        if (S.mode === 'shuffle' && playedStack.length) { playIndex(playedStack.pop(), { back: true }); return; }
        playIndex((idx - 1 + queue.length) % queue.length, { back: true });
    }
    function toggle() {
        if (!audio.src) return;
        if (audio.paused) { if (ac) ensureAC(); audio.play().catch(() => {}); } else audio.pause();
    }

    onAudio('timeupdate', () => {
        const d = audio.duration || queue[idx]?.duration || 0;
        const p = d ? audio.currentTime / d : 0;
        $('.pm-fill').style.width = (p * 100) + '%';
        $('.pm-cur').textContent = fmt(audio.currentTime);
        if (audio.duration) $('.pm-dur').textContent = fmt(audio.duration);
        ring.style.strokeDashoffset = String(C * (1 - Math.min(1, p)));
        syncLyric();
        if (!planned && S.mode !== 'one' && !S.fade.on && audio.duration > 0 && audio.duration - audio.currentTime <= 45) prefetchNext();
        // 快结束时提前准备下一首(智能过渡)
        if (S.fade.on && !pre && !audio.paused && gains.has(audio) && S.mode !== 'one'
            && audio.duration > 0 && audio.duration - audio.currentTime <= S.fade.sec + 6) {
            const j = nextIndex(true);
            if (j >= 0 && j !== idx) { pre = true; playIndex(j, { fade: true }); }
        }
    });
    onAudio('play', renderPlayState);
    onAudio('pause', renderPlayState);
    onAudio('ended', () => {
        if (pre) return;   // 过渡已经接管了
        if (S.mode === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
        const pl = planned; planned = null;
        if (pl && pl.url && queue[pl.j] && pl.key === queue[pl.j].platform + ':' + queue[pl.j].id) {
            playIndex(pl.j, { url: pl.url });   // 同步开播,后台也能连下去
            return;
        }
        const j = nextIndex(true);
        if (j >= 0) playIndex(j); else renderPlayState();
    });
    onAudio('error', () => { if (audio.src && audio.src !== SILENT) setBusy('音频加载失败,试试下一首', true); });

    $('.pm-toggle').addEventListener('click', toggle);
    $('.pm-next').addEventListener('click', next);
    $('.pm-prev').addEventListener('click', prev);
    $('.pm-track').addEventListener('pointerdown', (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const d = audio.duration || 0;
        if (d) audio.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * d;
    });
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', toggle);
        navigator.mediaSession.setActionHandler('pause', toggle);
        navigator.mediaSession.setActionHandler('previoustrack', prev);
        navigator.mediaSession.setActionHandler('nexttrack', next);
    }

    // ---------- 标签页 ----------
    let tab = 'search', results = [], status = { netease: { loggedIn: false }, qq: { loggedIn: false } }, searchErr = '';
    let qrTimer = null;

    function switchTab(t) {
        tab = t;
        root.querySelectorAll('.pm-tab').forEach((x) => x.classList.toggle('on', x.dataset.tab === t));
        renderTab();
    }
    root.querySelectorAll('.pm-tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    function renderTab() {
        if (tab === 'search') renderSearch();
        else if (tab === 'lists') renderLists();
        else if (tab === 'account') renderAccount();
        else renderLook();
    }

    // 搜索
    function renderSearch() {
        body.innerHTML = '';
        const seg = el('div', 'pm-seg');
        Object.keys(NAMES).forEach((k) => {
            const b = el('button', S.platform === k ? 'on' : '', NAMES[k]);
            b.onclick = () => { S.platform = k; save(); renderSearch(); };
            seg.appendChild(b);
        });
        const row = el('div', 'pm-row');
        const input = el('input', 'pm-input'); input.placeholder = '歌名 / 歌手'; input.enterKeyHint = 'search';
        const go = el('button', 'pm-go', '搜索');
        row.append(input, go);
        const list = el('div');
        body.append(seg, row, list);

        const draw = () => {
            list.innerHTML = '';
            if (searchErr) list.appendChild(el('div', 'pm-error', searchErr));
            else if (!results.length) list.appendChild(el('div', 'pm-hint', '输入歌名开始搜索。登录后能听到更多歌曲,在「账号」里登录。'));
            results.forEach((tr, i) => {
                const it = el('div', 'pm-item' + (queue === results && i === idx ? ' cur' : ''));
                it.dataset.i = i; it.dataset.k = tr.platform + ':' + tr.id;
                const th = el('div', 'pm-thumb'); if (tr.cover) th.style.backgroundImage = `url("${tr.cover}")`;
                const meta = el('div'); meta.style.minWidth = 0;
                const a = el('div', 'pm-it'); a.textContent = tr.name;
                const b = el('div', 'pm-ia'); b.textContent = tr.artist + (tr.album ? ' · ' + tr.album : '');
                meta.style.flex = '1'; meta.append(a, b); it.append(th, meta);
                const hb = heartBtn(tr); if (hb) it.appendChild(hb);
                it.onclick = () => { queue = results; playIndex(i); };
                list.appendChild(it);
            });
        };
        const run = async () => {
            const q = input.value.trim(); if (!q) return;
            go.textContent = '…'; searchErr = '';
            try { results = (await api(`/search?platform=${S.platform}&q=${encodeURIComponent(q)}`)).list; if (!results.length) searchErr = '没有找到相关歌曲'; }
            catch (e) { searchErr = e.message; results = []; }
            go.textContent = '搜索'; draw();
        };
        go.onclick = run;
        input.onkeydown = (e) => { if (e.key === 'Enter') run(); };
        draw();
    }

    // 歌单(网易云)
    let playlists = null, plView = null;
    const PL_PAGE = 200;

    async function loadPlaylists() {
        let err = '';
        try { playlists = (await api('/netease/playlists')).list; }
        catch (e) { err = e.message; playlists = []; }
        if (tab === 'lists' && !plView) { renderLists(); if (err) body.appendChild(el('div', 'pm-error', err)); }
    }
    async function loadMoreTracks() {
        const v = plView; if (!v) return;
        v.loading = true; v.err = '';
        const st = body.scrollTop;
        if (tab === 'lists') { renderLists(); body.scrollTop = st; }
        try {
            const r = await api(`/netease/playlist/tracks?id=${v.id}&offset=${v.tracks.length}&limit=${PL_PAGE}`);
            v.tracks.push(...r.list);
            v.done = r.list.length < PL_PAGE;
        } catch (e) { v.err = e.message; v.done = true; }
        v.loading = false;
        if (plView === v && tab === 'lists') { renderLists(); body.scrollTop = st; }
    }
    function openPlaylist(p) {
        plView = { id: p.id, name: p.name, count: p.trackCount, tracks: [], loading: false, done: false, err: '' };
        loadMoreTracks();
    }

    function trackRow(tr, i, list, withNo) {
        const key = tr.platform + ':' + tr.id;
        const cur = queue[idx] && queue[idx].platform + ':' + queue[idx].id === key;
        const it = el('div', 'pm-item' + (cur ? ' cur' : ''));
        it.dataset.i = i; it.dataset.k = key;
        const lead = withNo ? el('div', 'pm-no') : el('div', 'pm-thumb');
        if (withNo) lead.textContent = i + 1;
        else if (tr.cover) lead.style.backgroundImage = `url("${tr.cover.replace('param=300y300', 'param=100y100')}")`;
        const meta = el('div'); meta.style.minWidth = 0;
        const a = el('div', 'pm-it'); a.textContent = tr.name;
        const b = el('div', 'pm-ia'); b.textContent = tr.artist + (tr.album ? ' · ' + tr.album : '');
        meta.style.flex = '1'; meta.append(a, b); it.append(lead, meta);
        const hb = heartBtn(tr); if (hb) it.appendChild(hb);
        it.onclick = () => { queue = list; playIndex(i); };
        return it;
    }

    function renderLists() {
        body.innerHTML = '';
        if (!status.netease?.loggedIn) {
            playlists = null; plView = null;
            body.appendChild(el('div', 'pm-hint', '登录网易云后,这里会显示你的歌单和「我喜欢的音乐」。'));
            const b = el('button', 'pm-ghost', '去登录'); b.style.marginTop = '10px';
            b.onclick = () => switchTab('account');
            body.appendChild(b);
            return;
        }
        if (plView) return renderPlaylistDetail();
        if (playlists === null) { body.appendChild(el('div', 'pm-hint', '正在读取歌单…')); loadPlaylists(); return; }

        const head = el('div', 'pm-pl-head');
        head.appendChild(el('div', 'pm-pl-title', '我的歌单'));
        const rf = el('button', 'pm-ghost', '刷新'); rf.onclick = () => { playlists = null; renderLists(); };
        head.appendChild(rf); body.appendChild(head);
        if (!playlists.length) { body.appendChild(el('div', 'pm-hint', '没有读到歌单,点「刷新」再试一次。')); return; }

        const group = (title, arr) => {
            if (!arr.length) return;
            body.appendChild(el('div', 'pm-grp', title));
            arr.forEach((p) => {
                const it = el('div', 'pm-item');
                const th = el('div', 'pm-thumb'); if (p.cover) th.style.backgroundImage = `url("${p.cover}")`;
                const meta = el('div'); meta.style.minWidth = 0;
                const a = el('div', 'pm-it'); a.textContent = p.name;
                const b = el('div', 'pm-ia'); b.textContent = p.trackCount + ' 首';
                meta.append(a, b); it.append(th, meta);
                it.onclick = () => openPlaylist(p);
                body.appendChild(it);
            });
        };
        group('我喜欢的', playlists.filter((p) => p.liked));
        group('我创建的', playlists.filter((p) => p.mine && !p.liked));
        group('收藏的歌单', playlists.filter((p) => !p.mine && !p.liked));
    }

    function renderPlaylistDetail() {
        const v = plView;
        const head = el('div', 'pm-pl-head');
        const back = el('button', 'pm-ghost', '返回歌单'); back.onclick = () => { plView = null; renderLists(); };
        const all = el('button', 'pm-go', '播放全部'); all.style.padding = '8px 14px';
        all.onclick = () => { if (v.tracks.length) { queue = v.tracks; playIndex(0); } };
        head.append(back, all);
        const title = el('div', 'pm-pl-title'); title.textContent = v.name;
        body.append(head, title, el('div', 'pm-hint', v.count + ' 首'));
        const list = el('div'); list.style.marginTop = '8px';
        v.tracks.forEach((tr, i) => list.appendChild(trackRow(tr, i, v.tracks, false)));
        body.appendChild(list);
        if (v.err) body.appendChild(el('div', 'pm-error', v.err));
        if (v.loading) body.appendChild(el('div', 'pm-hint', '正在加载…'));
        else if (!v.done && v.tracks.length) {
            const more = el('button', 'pm-ghost pm-more', '加载更多');
            more.onclick = loadMoreTracks; body.appendChild(more);
        } else if (!v.tracks.length && !v.err) body.appendChild(el('div', 'pm-hint', '这个歌单里没有歌曲'));
    }

    // 账号
    async function refreshStatus() {
        try {
            const s = await api('/status');
            status = s;
            if (!s.hasNeteaseLib) status.libMissing = true;
        } catch (e) { status = { ...status, backendErr: e.message }; }
        if (status.netease?.loggedIn) {
            try { liked = new Set((await api('/netease/likes')).ids.map(String)); } catch { /* 忽略 */ }
        }
        paintAllHearts();
        if (panel.classList.contains('open')) {
            if (tab === 'account') renderAccount();
            else if (tab === 'lists' && !plView) renderLists();
        }
    }
    function stopQr() { if (qrTimer) { clearInterval(qrTimer); qrTimer = null; } }

    function renderAccount() {
        stopQr();
        body.innerHTML = '';
        if (status.backendErr) body.appendChild(el('div', 'pm-error', status.backendErr));
        else if (status.libMissing) body.appendChild(el('div', 'pm-error', '后端缺少网易云依赖:请在插件文件夹里运行 npm install,再重启酒馆'));

        // 网易云
        const n = el('div', 'pm-card');
        n.innerHTML = '<h4>网易云音乐</h4>';
        const ns = el('div', 'pm-status' + (status.netease?.loggedIn ? ' ok' : ''), status.netease?.loggedIn ? '已登录:' + (status.netease.nickname || '') : '未登录');
        const nb = el('button', 'pm-ghost', status.netease?.loggedIn ? '退出登录' : '扫码登录');
        const qrBox = el('div');
        n.append(ns, nb, qrBox);
        nb.onclick = async () => {
            if (status.netease?.loggedIn) { await api('/logout', { method: 'POST', body: { platform: 'netease' } }).catch(() => {}); return refreshStatus(); }
            stopQr(); qrBox.innerHTML = '<div class="pm-hint">正在生成二维码…</div>';
            try {
                const q = await api('/netease/qr/create', { method: 'POST' });
                qrBox.innerHTML = '';
                const img = el('img', 'pm-qr'); img.src = q.qrimg; img.alt = '网易云登录二维码';
                const msg = el('div', 'pm-hint', '用另一台设备的网易云 App 扫码');
                msg.style.textAlign = 'center';
                qrBox.append(img, msg);
                const started = Date.now();
                qrTimer = setInterval(async () => {
                    if (Date.now() - started > 180000) { stopQr(); msg.textContent = '二维码已过期,请重新生成'; return; }
                    try {
                        const r = await api('/netease/qr/check', { method: 'POST', body: { key: q.key } });
                        if (r.code === 800) { stopQr(); msg.textContent = '二维码已过期,请重新生成'; }
                        else if (r.code === 802) msg.textContent = '已扫码,请在手机上确认登录';
                        else if (r.code === 803) { stopQr(); msg.textContent = '登录成功'; refreshStatus(); }
                    } catch (e) { stopQr(); msg.textContent = e.message; }
                }, 2000);
            } catch (e) { qrBox.innerHTML = ''; qrBox.appendChild(el('div', 'pm-error', e.message)); }
        };

        // QQ 音乐
        const q = el('div', 'pm-card');
        q.innerHTML = '<h4>QQ 音乐</h4>';
        const qs = el('div', 'pm-status' + (status.qq?.loggedIn ? ' ok' : ''), status.qq?.loggedIn ? '已登录:' + (status.qq.nickname || '') : '未登录');
        q.appendChild(qs);
        if (status.qq?.loggedIn) {
            const out = el('button', 'pm-ghost', '退出登录');
            out.onclick = async () => { await api('/logout', { method: 'POST', body: { platform: 'qq' } }).catch(() => {}); refreshStatus(); };
            q.appendChild(out);
        } else {
            const ta = el('textarea', 'pm-textarea'); ta.placeholder = '粘贴 y.qq.com 的 Cookie';
            const save1 = el('button', 'pm-go', '保存登录'); save1.style.cssText = 'margin-top:8px;padding:9px 14px';
            const hint = el('div', 'pm-hint', '电脑浏览器登录 y.qq.com,按 F12 打开「网络」,刷新后点任意请求,复制请求头里的 Cookie。');
            hint.style.marginTop = '8px';
            const err = el('div', 'pm-error'); err.style.display = 'none';
            save1.onclick = async () => {
                err.style.display = 'none';
                try { await api('/qq/cookie', { method: 'POST', body: { cookie: ta.value } }); refreshStatus(); }
                catch (e) { err.textContent = e.message; err.style.display = 'block'; }
            };
            q.append(ta, save1, err, hint);
        }
        body.append(n, q);
        body.appendChild(el('div', 'pm-hint', '登录信息只保存在运行酒馆的这台电脑上。扫码需要用另一台设备的 App,所以建议在电脑上打开酒馆完成登录,手机之后直接使用。'));
    }

    // 外观
    function renderLook() {
        stopQr();
        body.innerHTML = '';
        const L = S.lyric;

        const sw = el('div', 'pm-set'); sw.appendChild(el('span', '', '主题'));
        const box = el('div', 'pm-swatches');
        THEMES.forEach((t) => {
            const b = el('button', 'pm-sw' + (S.theme === t ? ' on' : '')); b.dataset.t = t;
            b.setAttribute('aria-label', { black: '黑', white: '白', pink: '粉', blush: '淡粉白', sky: '淡蓝白' }[t]);
            b.onclick = () => { S.theme = t; save(); applyTheme(); applyLyric(); renderLook(); };
            box.appendChild(b);
        });
        sw.appendChild(box);

        const toggleRow = (label, key) => {
            const r = el('div', 'pm-set'); r.appendChild(el('span', '', label));
            const s1 = el('button', 'pm-switch' + (L[key] ? ' on' : ''));
            s1.setAttribute('role', 'switch'); s1.setAttribute('aria-checked', String(!!L[key]));
            s1.onclick = () => { L[key] = !L[key]; save(); applyLyric(); renderLook(); };
            r.appendChild(s1); return r;
        };

        const modeRow = el('div', 'pm-set'); modeRow.appendChild(el('span', '', '滚动方式'));
        const seg = el('div', 'pm-seg'); seg.style.cssText = 'margin:0;width:170px';
        [['multi', '多行'], ['single', '单行']].forEach(([k, n]) => {
            const b = el('button', (L.mode === 'single' ? 'single' : 'multi') === k ? 'on' : '', n);
            b.onclick = () => { L.mode = k; save(); applyLyric(); renderLook(); };
            seg.appendChild(b);
        });
        modeRow.appendChild(seg);

        const size = el('div', 'pm-set'); size.appendChild(el('span', '', '歌词字号'));
        const rg = el('input', 'pm-range'); rg.type = 'range'; rg.min = 14; rg.max = 40; rg.value = L.size;
        rg.oninput = () => { L.size = Number(rg.value); applyLyric(); };
        rg.onchange = save; size.appendChild(rg);

        const colorRow = (label, key, themeName) => {
            const r = el('div', 'pm-set'); r.appendChild(el('span', '', label));
            const inp = el('input', 'pm-color'); inp.type = 'color';
            const tv = themeVar(themeName);
            inp.value = L[key] || (/^#[0-9a-f]{6}$/i.test(tv) ? tv : '#888888');
            inp.oninput = () => { L[key] = inp.value; applyLyric(); };
            inp.onchange = save;
            r.appendChild(inp); return r;
        };

        const alpha = el('div', 'pm-set'); alpha.appendChild(el('span', '', '背景透明度'));
        const ar = el('input', 'pm-range'); ar.type = 'range'; ar.min = 0; ar.max = 100; ar.value = L.bgAlpha ?? 80;
        ar.oninput = () => { L.bgAlpha = Number(ar.value); applyLyric(); };
        ar.onchange = save; alpha.appendChild(ar);

        const reset = el('div', 'pm-set'); reset.appendChild(el('span', '', '恢复默认'));
        const rbox = el('div'); rbox.style.cssText = 'display:flex;gap:8px';
        const r1 = el('button', 'pm-ghost', '颜色'); r1.onclick = () => { L.color = ''; L.dim = ''; L.bg = ''; L.bgAlpha = null; save(); applyLyric(); renderLook(); };
        const r2 = el('button', 'pm-ghost', '位置'); r2.onclick = () => { L.x = null; L.y = null; save(); applyLyric(); };
        rbox.append(r1, r2); reset.appendChild(rbox);

        const fadeRow = el('div', 'pm-set'); fadeRow.appendChild(el('span', '', '智能过渡(淡入淡出)'));
        const fs = el('button', 'pm-switch' + (S.fade.on ? ' on' : ''));
        fs.setAttribute('role', 'switch'); fs.setAttribute('aria-checked', String(!!S.fade.on));
        fs.onclick = () => { S.fade.on = !S.fade.on; save(); if (S.fade.on) { ensureAC(); unlockOther(); } renderLook(); };
        fadeRow.appendChild(fs);
        const secRow = el('div', 'pm-set'); secRow.appendChild(el('span', '', '过渡时长'));
        const sr = el('input', 'pm-range'); sr.type = 'range'; sr.min = 2; sr.max = 12; sr.value = S.fade.sec;
        sr.oninput = () => { S.fade.sec = Number(sr.value); }; sr.onchange = save; secRow.appendChild(sr);
        const fadeHint = el('div', 'pm-hint', '歌曲快结束时,下一首淡入、这一首淡出。iPhone 上开启后,锁屏或切到后台可能会停播。单曲循环时不过渡。');
        fadeHint.style.padding = '8px 0 2px';
        body.append(sw, el('div', 'pm-grp', '播放'), fadeRow, ...(S.fade.on ? [secRow] : []), fadeHint, el('div', 'pm-grp', '歌词'), toggleRow('悬浮歌词', 'on'), toggleRow('锁定歌词(不可拖动)', 'locked'), modeRow, size,
            colorRow('当前句颜色', 'color', '--hi'), colorRow('其他句颜色', 'dim', '--sub'),
            colorRow('背景颜色', 'bg', '--bg'), alpha, reset);
    }

    // ---------- 启动 ----------
    placeBall(); setLyricMessage('悬浮歌词会显示在这里'); applyLyric(); paintMode(); renderNow(); renderPlayState();
})();
