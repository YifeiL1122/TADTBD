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
  const tbody = $('couponCampaignTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px;">Loading...</td></tr>';

  const snap = await getDocs(query(collection(db, CAMPAIGNS), orderBy('updatedAt', 'desc'), limit(25)));
  const rows = [];
  snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

  if (tbody) {
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px;">No coupon campaigns yet. Create one on the left.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${r.dateYmd || '—'}</td>
          <td>${r.ad_id || '—'}</td>
          <td><strong>${r.coupon_code || '—'}</strong><div class="user-email">${r.coupon_desc || ''}</div></td>
          <td>${Number(r.sent_count || 0).toLocaleString()}</td>
          <td>${Number(r.used_count || 0).toLocaleString()}</td>
          <td>${fmtTs(r.updatedAt || r.createdAt)}</td>
        </tr>
      `).join('');
    }
  }

  return rows;
}

async function loadLogs() {
  const box = $('couponLogs');
  const snap = await getDocs(query(collection(db, LOGS), orderBy('ts', 'desc'), limit(30)));
  const logs = [];
  snap.forEach(d => logs.push(d.data()));

  if (!box) return;
  if (!logs.length) {
    box.textContent = 'No logs yet.';
    return;
  }
  box.innerHTML = logs.map(l => {
    const when = fmtTs(l.ts);
    const who = l.recipient || '—';
    const what = l.event || '—';
    const code = l.coupon_code || '';
    return `<div style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
      <span style="color: rgba(255,255,255,0.8);">${when}</span>
      <span style="margin-left: 10px;"><strong>${what}</strong></span>
      <span style="margin-left: 10px;">${who}</span>
      <span style="margin-left: 10px; color: var(--tmobile-magenta);">${code}</span>
    </div>`;
  }).join('');
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

  setHint('✅ Saved Tuesday campaign.');
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

  setHint(`✅ Demo ${eventType} recorded (+${delta}).`);
  await loadCampaigns();
  await loadLogs();
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
  await loadCampaigns();
  await loadLogs();

  $('tuesdayDate')?.addEventListener('change', populateAdSelect);
  $('tuesdayDataSource')?.addEventListener('change', populateAdSelect);
  $('btnSaveTuesdayCampaign')?.addEventListener('click', saveTuesdayCampaign);
  $('btnDemoSendCoupons')?.addEventListener('click', () => demoSendOrUse('sent'));
  $('btnDemoMarkUsed')?.addEventListener('click', () => demoSendOrUse('used'));
});


