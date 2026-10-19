'use strict';
/**
 * Pink Music Server —— 酒馆后端插件(独立,不依赖任何其他音乐插件)
 * 路由前缀:/api/plugins/pink-music
 *
 * 网易云:扫码登录(NeteaseCloudMusicApi)
 * QQ 音乐:粘贴 Cookie 登录(扫码登录官方接口较复杂,先用 Cookie)
 */
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const info = {
    id: 'pink-music',
    name: 'Pink Music Server',
    description: '网易云 / QQ 音乐 登录、搜索、取歌、歌词',
};

const STREAM_HOSTS = /(^|\.)(music\.126\.net|music\.163\.com|qqmusic\.qq\.com|tc\.qq\.com|gtimg\.cn|y\.qq\.com)$/i;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---------- 网易云库(可选两个包名,任一可用) ----------
let ncm = null;
for (const name of ['NeteaseCloudMusicApi', '@neteaseapireborn/api']) {
    try { ncm = require(name); break; } catch { /* 试下一个 */ }
}

// ---------- 登录信息存储(只在你电脑本地) ----------
const DIR = path.join(process.cwd(), 'data', '_pink-music');
const FILE = path.join(DIR, 'auth.json');

function loadAuth() {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function saveAuth(data) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}
function setAuth(key, value) {
    const a = loadAuth();
    if (value) a[key] = value; else delete a[key];
    saveAuth(a);
}

// ---------- 小工具 ----------
// 网易云库失败时抛的是普通对象(不是 Error),这里把它转成文字
function errText(e) {
    if (!e) return '未知错误';
    if (typeof e === 'string') return e;
    if (e instanceof Error && e.message) return e.message;
    const b = e.body ?? e;
    const code = b?.code ?? e.status;
    const msg = b?.message || b?.msg || '';
    const hint = (code === -460 || code === -462 || code === 301 || code === 8821)
        ? '(网易云暂时限制了这台电脑的请求,过一会儿再试,或换个网络)' : '';
    return `网易云返回 code ${code ?? '?'}${msg ? ':' + msg : ''}${hint}`;
}
function withTimeout(p, ms, msg) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(msg || '请求超时')), ms);
        Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
}

const wrap = (fn) => async (req, res) => {
    try {
        res.json({ ok: true, ...(await fn(req, res)) });
    } catch (e) {
        console.error('[pink-music]', e);
        res.status(200).json({ ok: false, error: errText(e) });
    }
};

function needNcm() {
    if (!ncm) {
        throw new Error('后端缺少网易云依赖,请在插件目录运行 npm install(见 README)');
    }
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// ---------- 网易云 ----------
const netease = {
    cookie: () => loadAuth().netease || '',

    async status() {
        const cookie = this.cookie();
        if (!cookie || !ncm) return { loggedIn: false };
        try {
            const r = await withTimeout(ncm.login_status({ cookie, timestamp: Date.now() }), 8000, '查询登录状态超时');
            const p = r.body?.data?.profile;
            if (p) return { loggedIn: true, nickname: p.nickname };
            if (r.body?.code === 200) return { loggedIn: false };   // 网易云明确说没登录
            console.warn('[pink-music] 查询登录状态异常:', errText(r));
            return { loggedIn: true, nickname: '(暂时无法确认账号)', uncertain: true };
        } catch (e) {
            console.warn('[pink-music] 查询登录状态失败:', errText(e));
            return { loggedIn: true, nickname: '(暂时无法确认账号)', uncertain: true };
        }
    },

    async search(q) {
        needNcm();
        const r = await withTimeout(ncm.cloudsearch({ keywords: q, limit: 30, type: 1, cookie: this.cookie() }), 12000, '网易云搜索超时');
        const list = r.body?.result?.songs || [];
        return list.map((s) => ({
            platform: 'netease',
            id: String(s.id),
            name: s.name,
            artist: (s.ar || []).map((a) => a.name).join(' / '),
            album: s.al?.name || '',
            cover: s.al?.picUrl ? s.al.picUrl + '?param=300y300' : '',
            duration: Math.round((s.dt || 0) / 1000),
        }));
    },

    async uid() {
        const r = await withTimeout(ncm.login_status({ cookie: this.cookie(), timestamp: Date.now() }), 10000, '读取账号超时');
        const u = r.body?.data?.profile?.userId;
        if (!u) throw new Error('登录已失效,请到「账号」重新登录');
        return u;
    },

    async url(id) {
        needNcm();
        const cookie = this.cookie();
        const tries = [
            () => ncm.song_url_v1({ id, level: 'standard', cookie }),
            () => ncm.song_url({ id, br: 128000, cookie }),
        ];
        for (const t of tries) {
            try {
                const r = await withTimeout(t(), 8000, '网易云接口 8 秒没有回应');
                const item = r.body?.data?.[0];
                if (item?.url) return { url: item.url.replace(/^http:/, 'https:') };
            } catch (e) {
                console.warn('[pink-music] 网易云取地址出错:', e.message);
            }
        }
        // 兜底:网易云公开外链(免费歌曲可用)
        return { url: `https://music.163.com/song/media/outer/url?id=${id}.mp3`, fallback: true };
    },

    async lyric(id) {
        needNcm();
        const r = await withTimeout(ncm.lyric({ id, cookie: this.cookie() }), 10000, '网易云歌词超时');
        return { lrc: r.body?.lrc?.lyric || '', tlrc: r.body?.tlyric?.lyric || '' };
    },
};

// 网易云歌曲 -> 统一格式(歌单里的歌曲用)
function neteaseSong(s) {
    return {
        platform: 'netease',
        id: String(s.id),
        name: s.name,
        artist: (s.ar || []).map((a) => a.name).join(' / '),
        album: s.al?.name || '',
        cover: s.al?.picUrl ? s.al.picUrl + '?param=300y300' : '',
        duration: Math.round((s.dt || 0) / 1000),
    };
}

// ---------- QQ 音乐 ----------
const qq = {
    cookie: () => loadAuth().qq || '',

    uin() {
        const m = this.cookie().match(/(?:^|;\s*)(?:uin|wxuin|p_uin)=o?0*(\d+)/);
        return m ? m[1] : '0';
    },

    async status() {
        const c = this.cookie();
        return c && this.uin() !== '0' ? { loggedIn: true, nickname: 'QQ ' + this.uin() } : { loggedIn: false };
    },

    async musicu(body) {
        const r = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Referer: 'https://y.qq.com/',
                'User-Agent': UA,
                Cookie: this.cookie(),
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(12000),
        });
        return r.json();
    },

    async search(q) {
        const json = await this.musicu({
            comm: { ct: 19, cv: 1859, uin: 0 },
            req: {
                method: 'DoSearchForQQMusicDesktop',
                module: 'music.search.SearchCgiService',
                param: { query: q, num_per_page: 30, page_num: 1, search_type: 0 },
            },
        });
        const list = json?.req?.data?.body?.song?.list || [];
        return list.map((s) => ({
            platform: 'qq',
            id: s.mid,
            name: s.name || s.title,
            artist: (s.singer || []).map((x) => x.name).join(' / '),
            album: s.album?.name || '',
            cover: s.album?.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.album.mid}.jpg` : '',
            duration: s.interval || 0,
        }));
    },

    async url(mid) {
        const guid = String(Math.floor(Math.random() * 9e9) + 1e9);
        const json = await this.musicu({
            comm: { ct: 24, cv: 0, uin: this.uin() },
            req: {
                module: 'vkey.GetVkeyServer',
                method: 'CgiGetVkey',
                param: {
                    guid, songmid: [mid], songtype: [0],
                    uin: this.uin(), loginflag: 1, platform: '20',
                },
            },
        });
        const data = json?.req?.data;
        const purl = data?.midurlinfo?.[0]?.purl;
        const sip = data?.sip?.[0];
        if (!purl || !sip) throw new Error('这首歌拿不到播放地址(需要先登录 QQ 音乐,或是 VIP 歌曲)');
        return { url: (sip + purl).replace(/^http:/, 'https:') };
    },

    async lyric(mid) {
        const u = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(mid)}&format=json&nobase64=1&g_tk=5381`;
        const r = await fetch(u, { headers: { Referer: 'https://y.qq.com/', 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
        const text = await r.text();
        let j;
        try { j = JSON.parse(text); } catch { j = JSON.parse(text.replace(/^[^{]*|[^}]*$/g, '')); }
        const fix = (s) => {
            if (!s) return '';
            if (!s.includes('[')) {
                try { s = Buffer.from(s, 'base64').toString('utf8'); } catch { /* 保持原样 */ }
            }
            return decodeEntities(s);
        };
        return { lrc: fix(j.lyric), tlrc: fix(j.trans) };
    },
};

const platforms = { netease, qq };
function pick(req) {
    const p = platforms[req.query.platform || req.body?.platform];
    if (!p) throw new Error('未知平台');
    return p;
}

// ---------- 路由 ----------
async function init(router) {
    try {
        const express = require('express');
        router.use(express.json({ limit: '1mb' }));
    } catch { /* 酒馆本身已解析 JSON */ }

    router.get('/ping', wrap(async () => ({ netease: !!ncm, version: '0.1.0' })));

    router.get('/status', wrap(async () => ({
        netease: await netease.status(),
        qq: await qq.status(),
        hasNeteaseLib: !!ncm,
    })));

    // 网易云扫码登录
    router.post('/netease/qr/create', wrap(async () => {
        needNcm();
        const k = await withTimeout(ncm.login_qr_key({ timestamp: Date.now() }), 12000, '获取二维码超时');
        const key = k.body?.data?.unikey;
        if (!key) throw k;   // 交给 errText 显示网易云返回的原因
        const q = await withTimeout(ncm.login_qr_create({ key, qrimg: true, timestamp: Date.now() }), 12000, '生成二维码超时');
        if (!q.body?.data?.qrimg) throw q;
        return { key, qrimg: q.body.data.qrimg, qrurl: q.body.data.qrurl };
    }));

    router.post('/netease/qr/check', wrap(async (req) => {
        needNcm();
        const r = await ncm.login_qr_check({ key: req.body.key, timestamp: Date.now() });
        const code = r.body?.code;
        if (code === 803 && r.body.cookie) setAuth('netease', r.body.cookie);
        return { code, message: r.body?.message || '' };
    }));

    // QQ Cookie 登录
    router.post('/qq/cookie', wrap(async (req) => {
        const c = String(req.body?.cookie || '').trim();
        if (!c) throw new Error('Cookie 为空');
        setAuth('qq', c);
        const s = await qq.status();
        if (!s.loggedIn) throw new Error('已保存,但 Cookie 里没找到 uin,可能复制不完整');
        return {};
    }));

    router.post('/logout', wrap(async (req) => {
        const p = String(req.body?.platform || '');
        if (!platforms[p]) throw new Error('未知平台');
        setAuth(p, null);
        return {};
    }));

    // 搜索 / 取地址 / 歌词
    router.get('/search', wrap(async (req) => {
        const q = String(req.query.q || '').trim();
        if (!q) return { list: [] };
        return { list: await pick(req).search(q) };
    }));
    router.get('/url', wrap(async (req) => {
        const t0 = Date.now(), p = pick(req), id = String(req.query.id);
        try {
            const r = await p.url(id);
            console.log(`[pink-music] 取播放地址 ${req.query.platform}:${id} 用时 ${Date.now() - t0}ms ${r.fallback ? '(用了备用地址)' : '成功'}`);
            return r;
        } catch (e) {
            console.warn(`[pink-music] 取播放地址失败 ${req.query.platform}:${id} 用时 ${Date.now() - t0}ms:${e.message}`);
            throw e;
        }
    }));
    router.get('/lyric', wrap(async (req) => pick(req).lyric(String(req.query.id))));

    // 网易云歌单:我喜欢 / 我创建的 / 收藏的
    router.get('/netease/playlists', wrap(async () => {
        needNcm();
        const cookie = netease.cookie();
        if (!cookie) throw new Error('请先登录网易云');
        const uid = await netease.uid();
        const r = await withTimeout(ncm.user_playlist({ uid, limit: 100, offset: 0, cookie, timestamp: Date.now() }), 15000, '读取歌单超时');
        const list = (r.body?.playlist || []).map((p) => ({
            id: String(p.id),
            name: p.name,
            trackCount: p.trackCount || 0,
            cover: p.coverImgUrl ? p.coverImgUrl + '?param=120y120' : '',
            liked: p.specialType === 5,
            mine: p.creator?.userId === uid,
        }));
        return { list };
    }));

    // 歌单里的歌曲(分页)
    router.get('/netease/playlist/tracks', wrap(async (req) => {
        needNcm();
        const limit = Math.min(Number(req.query.limit) || 200, 500);
        const offset = Number(req.query.offset) || 0;
        const r = await withTimeout(ncm.playlist_track_all({
            id: String(req.query.id), limit, offset, cookie: netease.cookie(), timestamp: Date.now(),
        }), 20000, '读取歌单歌曲超时');
        return { list: (r.body?.songs || []).map(neteaseSong) };
    }));

    // 喜欢列表 / 加入或取消「我喜欢的音乐」
    router.get('/netease/likes', wrap(async () => {
        needNcm();
        const cookie = netease.cookie();
        if (!cookie) return { ids: [] };
        const uid = await netease.uid();
        const r = await withTimeout(ncm.likelist({ uid, cookie, timestamp: Date.now() }), 12000, '读取喜欢列表超时');
        return { ids: (r.body?.ids || []).map(String) };
    }));
    router.post('/netease/like', wrap(async (req) => {
        needNcm();
        const cookie = netease.cookie();
        if (!cookie) throw new Error('请先登录网易云');
        // 注意:库里 like 参数要传字符串 'true' / 'false'
        const r = await withTimeout(ncm.like({
            id: String(req.body?.id), like: req.body?.like ? 'true' : 'false', cookie, timestamp: Date.now(),
        }), 12000, '操作超时');
        if (r.body?.code !== 200) throw new Error('网易云没有接受这次操作(code ' + r.body?.code + ')');
        return {};
    }));

    // 音频转发:让浏览器从同一个地址取音频(「智能过渡」需要)
    router.get('/stream', async (req, res) => {
        const ctl = new AbortController();
        try {
            const u = new URL(String(req.query.url || ''));
            if (!/^https?:$/.test(u.protocol) || !STREAM_HOSTS.test(u.hostname)) { res.status(400).end('host not allowed'); return; }
            const headers = { 'User-Agent': UA, Referer: /qq\.com|gtimg/.test(u.hostname) ? 'https://y.qq.com/' : 'https://music.163.com/' };
            if (req.headers.range) headers.Range = req.headers.range;
            res.on('close', () => ctl.abort());
            const timer = setTimeout(() => ctl.abort(), 15000);
            const up = await fetch(u, { headers, signal: ctl.signal, redirect: 'follow' });
            clearTimeout(timer);
            res.status(up.status);
            for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
                const v = up.headers.get(h); if (v) res.setHeader(h, v);
            }
            if (!up.body) { res.end(); return; }
            Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
        } catch (e) {
            if (!res.headersSent) res.status(502).end('proxy error'); else res.destroy();
        }
    });

    console.log('[pink-music] 后端已加载' + (ncm ? '' : '(未找到网易云依赖,请先 npm install)'));
}

async function exit() { /* 无需清理 */ }

module.exports = { init, exit, info };
