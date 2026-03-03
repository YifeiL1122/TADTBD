// Demo dataset loader for TADRANKING-style CSV inputs
// Source file (copied into Firebase Hosting): /public/data/ads_input_1000_local_usd_week_8slots_varslots_clean.csv

export const DEMO_CSV_PATH = '/data/ads_input_1000_local_usd_week_8slots_varslots_clean.csv';
import { getMerchantName, getMerchantEmail } from './demo-merchants.js';

let _cache = null;

function parseAdId(adId) {
  // Example: AD0002z98115d07152025  => zipcode=98115, date=20250715
  const m = String(adId || '').match(/z(\d{5})d(\d{2})(\d{2})(\d{4})/);
  if (!m) return { zipcode: null, dateYmd: null };
  const zipcode = m[1];
  const mm = m[2];
  const dd = m[3];
  const yyyy = m[4];
  return { zipcode, dateYmd: `${yyyy}${mm}${dd}` };
}

function pickPosterImageUrl(merchantId) {
  // Simple deterministic mapping to existing public images.
  const n = Number(String(merchantId || '').replace(/\D/g, '')) || 0;
  const mod = n % 3;
  if (mod === 0) return '/Starbucks.pic.jpg';
  if (mod === 1) return '/walmart.pic.jpg';
  return '/dote.pic.jpg';
}

function toNum(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { rows: [], dates: [] };
  const header = lines[0].split(',').map(s => s.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const out = [];
  const dates = new Set();

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) continue;

    const merchant_id = (parts[idx.merchant_id] || '').trim();
    const ad_id = (parts[idx.ad_id] || '').trim();
    if (!merchant_id || !ad_id) continue;

    const { zipcode, dateYmd } = parseAdId(ad_id);
    if (!zipcode || !dateYmd) continue;
    dates.add(dateYmd);

    const slots = [];
    for (let k = 1; k <= 5; k++) {
      const sCol = `preferred_slot_${k}`;
      const bCol = `bid_usd_${k}`;
      if (idx[sCol] === undefined || idx[bCol] === undefined) continue;
      const slot = toNum((parts[idx[sCol]] || '').trim());
      const bid = toNum((parts[idx[bCol]] || '').trim());
      if (!slot || !bid || bid <= 0) continue;
      slots.push({ time_slot: slot, bid_cpm: Number(bid.toFixed(2)) });
    }
    if (!slots.length) continue;

    out.push({
      merchant_id,
      ad_id,
      zipcode,
      dateYmd,
      slots
    });
  }

  return { rows: out, dates: Array.from(dates).sort() };
}

export async function loadDemoDataset() {
  if (_cache) return _cache;
  const res = await fetch(DEMO_CSV_PATH, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load demo CSV: ${res.status} ${res.statusText}`);
  const text = await res.text();
  _cache = parseCsv(text);
  return _cache;
}

export function demoDateYmdToInput(ymd) {
  if (!ymd || !/^\d{8}$/.test(String(ymd))) return '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

export async function buildBidRowsFromDemoCsv(targetDateYmd) {
  const { rows } = await loadDemoDataset();
  const out = [];
  for (const r of rows) {
    if (String(r.dateYmd) !== String(targetDateYmd)) continue;
    for (const s of r.slots) {
      out.push({
        zipcode: String(r.zipcode),
        date: String(targetDateYmd),
        time_slot: Number(s.time_slot),
        merchant_id: String(r.merchant_id),
        merchant_email: getMerchantEmail(r.merchant_id),
        ad_code: String(r.ad_id),
        bid_cpm: Number(s.bid_cpm),
        campaign_id: String(r.ad_id),
        poster_image_url: pickPosterImageUrl(r.merchant_id),
        poster_slogan: `${getMerchantName(r.merchant_id)} • ${r.ad_id}`
      });
    }
  }
  return out;
}

export async function listDemoAdsForDate(targetDateYmd) {
  const { rows } = await loadDemoDataset();
  const out = [];
  for (const r of rows) {
    if (String(r.dateYmd) !== String(targetDateYmd)) continue;
    out.push({
      ad_id: r.ad_id,
      merchant_id: r.merchant_id,
      merchant_name: getMerchantName(r.merchant_id),
      zipcode: r.zipcode,
      poster_image_url: pickPosterImageUrl(r.merchant_id),
      poster_slogan: `${getMerchantName(r.merchant_id)} • ${r.ad_id}`
    });
  }
  return out;
}


