// 抓市場資料，寫進 data/market.json
// GitHub Actions 每天自動跑兩次（.github/workflows/market.yml）；有裝 Node.js 的話本機也能跑：node tools/fetch-market.mjs
// 來源：Yahoo Finance（主要）、FRED（美股指數備援）、台灣證交所（加權指數備援、融資餘額、外資買賣超）、CNN（恐懼貪婪指數）
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../data/market.json', import.meta.url);
const WATCH = new URL('../data/watchlist.json', import.meta.url);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const KEEP = 520; // 每個標的保留約兩年的日線

const INDICES = [
  { sym: '^TWII', name: '台股加權指數' },
  { sym: '^GSPC', name: 'S&P 500', fred: 'SP500' },
  { sym: '^IXIC', name: 'Nasdaq', fred: 'NASDAQCOM' },
  { sym: '^VIX', name: 'VIX 波動率', fred: 'VIXCLS' },
  { sym: '^TNX', name: '美國 10 年期殖利率', fred: 'DGS10' },
  { sym: 'TWD=X', name: '美元兌台幣', fred: 'DEXTAUS' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const digits = v => (Math.abs(v) >= 1000 ? 2 : 4);
const num = s => Number(String(s).replace(/,/g, ''));

async function get(url, { headers = {}, type = 'json', tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return type === 'json' ? await res.json() : await res.text();
    } catch (e) {
      last = e;
      await sleep(1500 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

/** 台灣時間的今天 */
function taipei(offsetDays = 0) {
  const t = new Date(Date.now() + 8 * 3600e3 - offsetDays * 864e5);
  return { iso: t.toISOString().slice(0, 10), dow: t.getUTCDay(), y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
}

/** 最近 n 個平日（台灣時間），格式 YYYYMMDD */
function recentWeekdays(n) {
  const out = [];
  for (let k = 0; out.length < n && k < 20; k++) {
    const t = taipei(k);
    if (t.dow !== 0 && t.dow !== 6) out.push(t.iso.replace(/-/g, ''));
  }
  return out;
}

const isoOf = ymd => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

/** 民國日期「115/10/01」→「2026-10-01」 */
function rocToIso(s) {
  const [y, m, d] = String(s).trim().split('/').map(Number);
  return `${y + 1911}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 合併：新資料覆蓋同一天，依日期排序，只留最近 KEEP 筆 */
function merge(oldRows = [], newRows = [], keep = KEEP) {
  const map = new Map((oldRows || []).map(r => [r[0], r[1]]));
  for (const [d, v] of newRows) map.set(d, v);
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-keep);
}

async function yahoo(sym) {
  let lastErr;
  for (const host of ['query1', 'query2']) {
    try {
      const j = await get(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d&includePrePost=false`, { tries: 2 });
      const r = j?.chart?.result?.[0];
      if (!r || !r.timestamp) throw new Error(j?.chart?.error?.description || '沒有資料');
      const off = r.meta?.gmtoffset ?? 0;
      const close = r.indicators?.quote?.[0]?.close || [];
      const rows = [];
      r.timestamp.forEach((t, i) => {
        const v = close[i];
        if (v == null || !Number.isFinite(v)) return;
        rows.push([new Date((t + off) * 1000).toISOString().slice(0, 10), round(v, digits(v))]);
      });
      // 還在交易中的話，最後一筆是盤中價格，不算收盤
      const reg = r.meta?.currentTradingPeriod?.regular;
      const now = Date.now() / 1000;
      if (reg && now >= reg.start && now < reg.end && rows.length) {
        const openDay = new Date((reg.start + off) * 1000).toISOString().slice(0, 10);
        if (rows.at(-1)[0] === openDay) rows.pop();
      }
      if (!rows.length) throw new Error('沒有收盤價');
      return { rows, name: r.meta?.shortName || r.meta?.longName, ccy: r.meta?.currency };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function fred(id) {
  const start = new Date(Date.now() - 800 * 864e5).toISOString().slice(0, 10);
  const csv = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`, { type: 'text' });
  const rows = [];
  for (const line of csv.trim().split('\n').slice(1)) {
    const [d, v] = line.split(',');
    const x = Number(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(x)) rows.push([d, round(x, digits(x))]);
  }
  if (!rows.length) throw new Error('沒有資料');
  return { rows };
}

/** 證交所：本月和上個月的加權指數（Yahoo 抓不到時的備援） */
async function twseIndex() {
  const rows = [];
  const now = taipei();
  for (let k = 0; k < 2; k++) {
    const d = new Date(Date.UTC(now.y, now.m - 1 - k, 1));
    const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}01`;
    const j = await get(`https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${ym}&response=json`);
    await sleep(1200);
    if (j.stat !== 'OK' || !j.fields) continue;
    const di = j.fields.findIndex(f => String(f).includes('日期'));
    const vi = j.fields.findIndex(f => String(f).includes('加權'));
    for (const r of j.data || []) rows.push([rocToIso(r[di]), num(r[vi])]);
  }
  if (!rows.length) throw new Error('沒有資料');
  return { rows };
}

async function erFx() {
  const j = await get('https://open.er-api.com/v6/latest/USD');
  const v = j?.rates?.TWD;
  if (!Number.isFinite(v)) throw new Error('沒有台幣匯率');
  return { rows: [[taipei().iso, round(v, 4)]] };
}

/** 證交所信用交易統計：上市融資金額（億元） */
async function twseMargin() {
  for (const day of recentWeekdays(8)) {
    const j = await get(`https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${day}&selectType=MS&response=json`);
    await sleep(1200);
    if (j.stat !== 'OK') continue;
    const tables = j.tables || [{ fields: j.creditFields, data: j.creditList }];
    for (const t of tables) {
      if (!t?.fields || !t?.data) continue;
      const iToday = t.fields.findIndex(f => String(f).includes('今日餘額'));
      const iPrev = t.fields.findIndex(f => String(f).includes('前日餘額'));
      const row = t.data.find(r => String(r[0]).includes('融資金額'));
      // 單位是仟元：÷ 100,000 = 億元
      if (row && iToday >= 0) {
        return { date: isoOf(day), v: round(num(row[iToday]) / 1e5, 1), prev: iPrev >= 0 ? round(num(row[iPrev]) / 1e5, 1) : null };
      }
    }
  }
  throw new Error('最近 8 個交易日都沒有資料');
}

/** 證交所三大法人買賣金額：外資（含外資自營商）買賣超（億元） */
async function twseForeign() {
  for (const day of recentWeekdays(8)) {
    const j = await get(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${day}&response=json`);
    await sleep(1200);
    if (j.stat !== 'OK') continue;
    const t = j.fields ? j : (j.tables || [])[0];
    if (!t?.fields || !t?.data) continue;
    const iDiff = t.fields.findIndex(f => String(f).includes('差額'));
    const rows = t.data.filter(r => String(r[0]).startsWith('外資'));
    if (rows.length && iDiff >= 0) {
      return { date: isoOf(day), v: round(rows.reduce((a, r) => a + num(r[iDiff]), 0) / 1e8, 1) };
    }
  }
  throw new Error('最近 8 個交易日都沒有資料');
}

/** CNN 股市恐懼與貪婪指數 */
async function cnnFng() {
  const start = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const j = await get(`https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${start}`, {
    headers: { Accept: 'application/json', Referer: 'https://edition.cnn.com/', Origin: 'https://edition.cnn.com' },
  });
  const f = j?.fear_and_greed;
  if (!f || !Number.isFinite(f.score)) throw new Error('格式改了');
  const hist = merge([], (j.fear_and_greed_historical?.data || []).map(p => [new Date(p.x).toISOString().slice(0, 10), Math.round(p.y)]), 90);
  return {
    v: Math.round(f.score),
    rating: f.rating,
    date: String(f.timestamp || '').slice(0, 10) || hist.at(-1)?.[0] || null,
    prevWeek: Number.isFinite(f.previous_1_week) ? Math.round(f.previous_1_week) : null,
    prevMonth: Number.isFinite(f.previous_1_month) ? Math.round(f.previous_1_month) : null,
    hist,
  };
}

async function main() {
  let old = {};
  try { old = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* 第一次執行 */ }
  let watch = [];
  try { watch = JSON.parse(await readFile(WATCH, 'utf8')); } catch (e) { console.warn('data/watchlist.json 讀不到：', e.message); }

  const out = { updatedAt: new Date().toISOString(), series: {}, fng: old.fng || null, tw: { ...(old.tw || {}) }, errors: [] };
  const list = [...INDICES, ...watch.filter(w => w && w.sym)];
  let ok = 0;

  for (const it of list) {
    const prev = old.series?.[it.sym];
    let got = null;
    let src = null;
    try {
      got = await yahoo(it.sym);
      src = 'Yahoo';
    } catch (e) {
      const backups = [];
      if (it.fred) backups.push(['FRED', () => fred(it.fred)]);
      if (it.sym === '^TWII') backups.push(['證交所', twseIndex]);
      if (it.sym === 'TWD=X') backups.push(['ExchangeRate-API', erFx]);
      let err = `Yahoo：${e.message}`;
      for (const [name, fn] of backups) {
        try {
          got = await fn();
          src = name;
          break;
        } catch (e2) {
          err += `；${name}：${e2.message}`;
        }
      }
      if (!got) out.errors.push(`${it.name || it.sym}（${err}）`);
    }
    if (got) ok++;
    const rows = got ? merge(prev?.d, got.rows) : prev?.d;
    if (rows?.length) {
      out.series[it.sym] = { name: it.name || prev?.name || got?.name || it.sym, ccy: got?.ccy || prev?.ccy || null, src: src || prev?.src || null, d: rows };
    }
    console.log(`${got ? '✓' : '✕'} ${it.sym} ${src || '（沿用舊資料）'} ${rows?.length || 0} 筆`);
    await sleep(400);
  }

  const extras = [
    ['CNN 恐懼貪婪', async () => { out.fng = await cnnFng(); return out.fng.v; }],
    ['證交所融資餘額', async () => {
      const x = await twseMargin();
      out.tw.margin = { ...x, hist: merge(old.tw?.margin?.hist, [[x.date, x.v]], 120) };
      return `${x.v} 億`;
    }],
    ['證交所外資買賣超', async () => {
      const x = await twseForeign();
      out.tw.foreign = { ...x, hist: merge(old.tw?.foreign?.hist, [[x.date, x.v]], 120) };
      return `${x.v} 億`;
    }],
  ];
  for (const [name, fn] of extras) {
    try {
      console.log(`✓ ${name} ${await fn()}`);
      ok++;
    } catch (e) {
      out.errors.push(`${name}（${e.message}）`);
      console.log(`✕ ${name} ${e.message}`);
    }
  }

  if (!ok) {
    console.error('全部都抓不到，不更新檔案');
    process.exit(1);
  }
  await writeFile(OUT, `${JSON.stringify(out)}\n`);
  console.log(`完成：${ok} 項成功、${out.errors.length} 項失敗`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
