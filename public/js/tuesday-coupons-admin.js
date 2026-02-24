// Admin: T-Mobile Tuesday campaign + coupon send/use dashboard (demo-friendly)
import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  query,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import {
  loadDemoDataset,
  demoDateYmdToInput,
  listDemoAdsForDate
} from './demo-dataset.js';

function $(id) { return document.getElementById(id); }

const CAMPAIGNS = 'tmobile_tuesday_campaigns';
const LOGS = 'coupon_logs';
const DEMO_STATE_KEY = 'tmobileTuesdayDemoStateV1';

function yyyymmddFromInput(input) {
  if (!input) return null;
  const m = String(input).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

function fmtTs(ts) {
  try {
    if (!ts) return '—';
    // Firestore Timestamp or Date
    const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  } catch (_) {
    return '—';
  }
}

function setHint(text) {
  const el = $('tuesdayManagerHint');
  if (el) el.textContent = text || '';
}

function isDemoMode() {
  return localStorage.getItem('adminDemoMode') !== 'false';
}

function getDemoState() {
  try {
    const raw = localStorage.getItem(DEMO_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.campaigns) && Array.isArray(parsed.logs)) return parsed;
  } catch (_) {}
  return { campaigns: [], logs: [] };
}

function setDemoState(state) {
  localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state));
}

function renderCouponCards(rows) {
  const box = $('couponCampaignCards');
  if (!box) return;
  if (!rows.length) {
    box.innerHTML = '<div class="viz-empty">No coupon campaigns yet. Create one on the left.</div>';
    return;
  }
  const maxSent = Math.max(1, ...rows.map(r => Number(r.sent_count || 0)));
  box.innerHTML = rows.map((r) => {
    const sent = Number(r.sent_count || 0);
    const used = Number(r.used_count || 0);
    const useRate = sent > 0 ? Math.round((used / sent) * 100) : 0;
    const sentPct = Math.max(5, Math.round((sent / maxSent) * 100));
    return `
      <div class="viz-card">
        <div class="viz-card-title">${r.ad_id || 'Ad N/A'}</div>
        <div class="viz-card-sub">${r.dateYmd || '—'} • ${r.coupon_code || 'No code'}</div>
        <div class="viz-metric-row"><span>Sent</span><span>${sent.toLocaleString()}</span></div>
        <div class="viz-progress"><span style="width:${sentPct}%"></span></div>
        <div class="viz-metric-row"><span>Used</span><span>${used.toLocaleString()}</span></div>
        <div class="viz-chip-row">
          <span class="viz-chip">Use rate ${useRate}%</span>
          <span class="viz-chip">Updated ${fmtTs(r.updatedAt || r.createdAt)}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function populateAdSelect() {
  const dateInput = $('tuesdayDate')?.value;
  const ymd = yyyymmddFromInput(dateInput);
  const source = $('tuesdayDataSource')?.value || 'csv_demo';
  const sel = $('tuesdayAdSelect');
  if (!sel) return;

  sel.innerHTML = '';

  if (!ymd) {
    sel.innerHTML = '<option value="">Pick a date first</option>';
    return;
  }

  let ads = [];
  if (source === 'csv_demo') {
    ads = await listDemoAdsForDate(ymd);
    if (!ads.length) {
      sel.innerHTML = '<option value="">No ads for this date in CSV</option>';
      return;
    }
  } else {
    // Latest ranking winners: for demo, just show placeholder until we wire query by date.
    sel.innerHTML = '<option value="">(Demo) Switch to CSV demo to pick ads</option>';
    return;
  }

  // Keep it lightweight (top 200)
  const top = ads.slice(0, 200);
  for (const a of top) {
    const opt = document.createElement('option');
    opt.value = a.ad_id;
    opt.textContent = `${a.ad_id} • ${a.merchant_id} • ${a.zipcode}`;
    opt.dataset.merchantId = a.merchant_id;
    opt.dataset.posterImageUrl = a.poster_image_url || '';
    opt.dataset.posterSlogan = a.poster_slogan || '';
    sel.appendChild(opt);
  }
}

async function loadCampaigns() {
  const cards = $('couponCampaignCards');
  if (cards) cards.innerHTML = '<div class="viz-empty">Loading...</div>';

  if (isDemoMode()) {
    const state = getDemoState();
    renderCouponCards(state.campaigns);
    return state.campaigns;
  }

  const snap = await getDocs(query(collection(db, CAMPAIGNS), orderBy('updatedAt', 'desc'), limit(25)));
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
  renderCouponCards(rows);

  return rows;
}

async function loadLogs() {
  const box = $('couponLogs');
  if (!box) return;

  if (isDemoMode()) {
    const state = getDemoState();
    const logs = state.logs || [];
    if (!logs.length) {
      box.textContent = 'No logs yet.';
      return;
    }
    box.innerHTML = logs.map((l) => `
      <div class="coupon-log-item">
        <div>${fmtTs(l.ts)} • <strong>${l.event || '—'}</strong> • ${l.recipient || '—'}</div>
        <div style="color: var(--tmobile-magenta);">${l.coupon_code || ''}</div>
      </div>
    `).join('');
    return;
  }

  const snap = await getDocs(query(collection(db, LOGS), orderBy('ts', 'desc'), limit(30)));
  const logs = [];
  snap.forEach(d => logs.push(d.data()));

  if (!logs.length) {
    box.textContent = 'No logs yet.';
    return;
  }
  box.innerHTML = logs.map((l) => `
    <div class="coupon-log-item">
      <div>${fmtTs(l.ts)} • <strong>${l.event || '—'}</strong> • ${l.recipient || '—'}</div>
      <div style="color: var(--tmobile-magenta);">${l.coupon_code || ''}</div>
    </div>
  `).join('');
}

async function saveTuesdayCampaign() {
  const ymd = yyyymmddFromInput($('tuesdayDate')?.value);
  if (!ymd) return alert('Pick a Tuesday date first.');

  const adId = $('tuesdayAdSelect')?.value;
  if (!adId) return alert('Pick a Tuesday ad first.');

  const couponCode = ($('tuesdayCouponCode')?.value || '').trim();
  const couponDesc = ($('tuesdayCouponDesc')?.value || '').trim();

  const sel = $('tuesdayAdSelect');
  const opt = sel?.selectedOptions?.[0];
  const merchantId = opt?.dataset?.merchantId || '';
  const posterImageUrl = opt?.dataset?.posterImageUrl || '';
  const posterSlogan = opt?.dataset?.posterSlogan || '';

  if (isDemoMode()) {
    const state = getDemoState();
    state.campaigns.unshift({
      id: `demo_${Date.now()}`,
      dateYmd: ymd,
      ad_id: adId,
      merchant_id: merchantId,
      poster_image_url: posterImageUrl,
      poster_slogan: posterSlogan,
      coupon_code: couponCode,
      coupon_desc: couponDesc,
      sent_count: 0,
      used_count: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setDemoState(state);
    setHint('Saved Tuesday campaign in demo mode.');
    await loadCampaigns();
    return;
  }

  await addDoc(collection(db, CAMPAIGNS), {
    dateYmd: ymd,
    ad_id: adId,
    merchant_id: merchantId,
    poster_image_url: posterImageUrl,
    poster_slogan: posterSlogan,
    coupon_code: couponCode,
    coupon_desc: couponDesc,
    sent_count: 0,
    used_count: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  setHint('Saved Tuesday campaign.');
  await loadCampaigns();
}

async function demoSendOrUse(eventType) {
  // eventType: 'sent' | 'used'
  const campaigns = await loadCampaigns();
  if (!campaigns.length) return alert('Create a Tuesday campaign first.');
  const latest = campaigns[0];

  // Fake recipients (merchant ids)
  const recipients = ['M001', 'M007', 'M010', 'M031', 'M045'];
  const delta = eventType === 'sent' ? 50 : 12;

  const oldSent = Number(latest.sent_count || 0);
  const oldUsed = Number(latest.used_count || 0);
  const newSent = eventType === 'sent' ? (oldSent + delta) : oldSent;
  const newUsed = eventType === 'used' ? Math.min(oldUsed + delta, newSent) : oldUsed;

  if (isDemoMode()) {
    const state = getDemoState();
    const idx = state.campaigns.findIndex((c) => c.id === latest.id);
    if (idx >= 0) {
      state.campaigns[idx].sent_count = newSent;
      state.campaigns[idx].used_count = newUsed;
      state.campaigns[idx].updatedAt = new Date().toISOString();
    }
    for (const r of recipients) {
      state.logs.unshift({
        campaign_id: latest.id,
        event: eventType,
        recipient: r,
        coupon_code: latest.coupon_code || '',
        ts: new Date().toISOString()
      });
    }
    state.logs = state.logs.slice(0, 60);
    setDemoState(state);
  } else {
    await updateDoc(doc(db, CAMPAIGNS, latest.id), {
      sent_count: newSent,
      used_count: newUsed,
      updatedAt: serverTimestamp()
    });

    // Write a few logs
    for (const r of recipients) {
      await addDoc(collection(db, LOGS), {
        campaign_id: latest.id,
        event: eventType,
        recipient: r,
        coupon_code: latest.coupon_code || '',
        ts: serverTimestamp()
      });
    }
  }

  setHint(`Demo ${eventType} recorded (+${delta}).`);
  await loadCampaigns();
  await loadLogs();
}

async function ensureDemoSeed() {
  if (!isDemoMode()) return;
  const state = getDemoState();
  if (state.campaigns.length) return;
  const ymd = yyyymmddFromInput($('tuesdayDate')?.value || '') || '20250715';
  const ads = await listDemoAdsForDate(ymd);
  const pick = ads[0] || { ad_id: 'DEMO-AD-001', merchant_id: 'M001', poster_image_url: '', poster_slogan: 'Demo Tuesday Ad' };
  state.campaigns.push({
    id: `demo_${Date.now()}`,
    dateYmd: ymd,
    ad_id: pick.ad_id,
    merchant_id: pick.merchant_id,
    poster_image_url: pick.poster_image_url || '',
    poster_slogan: pick.poster_slogan || '',
    coupon_code: 'TUE10',
    coupon_desc: '10 percent off today only',
    sent_count: 120,
    used_count: 26,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  state.logs = [
    { campaign_id: state.campaigns[0].id, event: 'sent', recipient: 'M001', coupon_code: 'TUE10', ts: new Date().toISOString() },
    { campaign_id: state.campaigns[0].id, event: 'used', recipient: 'M007', coupon_code: 'TUE10', ts: new Date().toISOString() }
  ];
  setDemoState(state);
}

async function initTuesdayDefaults() {
  const dateEl = $('tuesdayDate');
  if (!dateEl) return;
  if (!dateEl.value) {
    // Prefer a Tuesday that exists in the CSV demo dataset (2025-07-15).
    dateEl.value = '2025-07-15';
  }
  try {
    const demo = await loadDemoDataset();
    // If chosen date isn't in CSV, use first available.
    const ymd = yyyymmddFromInput(dateEl.value);
    if (ymd && !demo.dates.includes(ymd) && demo.dates[0]) {
      dateEl.value = demoDateYmdToInput(demo.dates[0]);
    }
  } catch (_) {
    // ignore
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  if (!$('tuesdayDate')) return; // not on admin page

  await initTuesdayDefaults();
  await populateAdSelect();
  await ensureDemoSeed();
  await loadCampaigns();
  await loadLogs();

  $('tuesdayDate')?.addEventListener('change', populateAdSelect);
  $('tuesdayDataSource')?.addEventListener('change', populateAdSelect);
  $('btnSaveTuesdayCampaign')?.addEventListener('click', saveTuesdayCampaign);
  $('btnDemoSendCoupons')?.addEventListener('click', () => demoSendOrUse('sent'));
  $('btnDemoMarkUsed')?.addEventListener('click', () => demoSendOrUse('used'));

  window.addEventListener('admin-demo-mode-changed', async (evt) => {
    if (evt?.detail?.enabled) {
      await ensureDemoSeed();
    }
    await populateAdSelect();
    await loadCampaigns();
    await loadLogs();
  });
});


