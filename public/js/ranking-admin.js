// Admin Ranking Dashboard (integrated into public/admin.html)
import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  limit,
  writeBatch,
  doc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import {
  yyyymmdd,
  expandBidsToAuctionInputs,
  runGspAuctions,
  summarizeMerchants,
  kpis
} from './ranking-core.js';

import {
  loadDemoDataset,
  demoDateYmdToInput,
  buildBidRowsFromDemoCsv
} from './demo-dataset.js';

function $(id) { return document.getElementById(id); }

let chartSpendBySlot = null;
let chartPositionMix = null;
let chartTopMerchants = null;

function ensureDefaultDate() {
  const el = $('rankingDate');
  if (!el) return;
  if (el.value) return;
  const today = new Date();
  const yyyy = String(today.getFullYear());
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  el.value = `${yyyy}-${mm}-${dd}`;
}

function formatYmdToInput(ymd) {
  // ymd: YYYYMMDD -> YYYY-MM-DD
  if (!ymd || !/^\d{8}$/.test(String(ymd))) return '';
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function nextTuesdayYmd(fromDate = new Date()) {
  // Return the next Tuesday (including today if Tuesday) as YYYYMMDD.
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const day = d.getDay(); // 0=Sun ... 2=Tue
  const diff = (2 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function fetchBidsForRanking(statusMode) {
  // statusMode: active | pending_active | all
  // Firestore doesn't support OR well without composite; easiest: fetch all and filter in JS.
  const q = query(collection(db, 'bids'), orderBy('timestamp', 'desc'));
  const snap = await getDocs(q);
  const bids = [];
  snap.forEach(d => bids.push({ id: d.id, ...d.data() }));

  if (statusMode === 'active') return bids.filter(b => (b.status || 'pending') === 'active');
  if (statusMode === 'pending_active') return bids.filter(b => ['pending', 'active'].includes(b.status || 'pending'));
  return bids;
}

function renderKpis(auctionRows) {
  const k = kpis(auctionRows);
  $('rankTotalSpend').textContent = `$${k.totalSpend.toLocaleString()}`;
  $('rankTotalImps').textContent = k.totalImps.toLocaleString();
  $('rankUniqueWinners').textContent = k.uniqueAds.toLocaleString();
  $('rankCoveredSlots').textContent = k.coveredSlots.toLocaleString();
}

function renderMerchantTable(merchantRows) {
  const tbody = $('rankingMerchantTableBody');
  if (!tbody) return;
  if (!merchantRows.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px;">No merchant summary</td></tr>';
    return;
  }
  const top = merchantRows.slice(0, 30);
  tbody.innerHTML = top.map(r => `
    <tr>
      <td>
        <div class="user-cell">
          <div><strong>${r.merchant_email || r.merchant_id}</strong></div>
          <div class="user-email">ID: ${String(r.merchant_id).slice(0, 10)}...</div>
        </div>
      </td>
      <td>$${Number(r.total_spend_usd || 0).toLocaleString()}</td>
      <td>${Number(r.total_impressions || 0).toLocaleString()}</td>
      <td>${Number(r.wins || 0).toLocaleString()}</td>
    </tr>
  `).join('');
}

function renderAuctionTable(auctionRows) {
  const tbody = $('rankingAuctionTableBody');
  if (!tbody) return;
  if (!auctionRows.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 40px;">No auction winners</td></tr>';
    return;
  }
  const top = auctionRows.slice(0, 200);
  tbody.innerHTML = top.map(r => `
    <tr>
      <td>${r.zipcode}</td>
      <td>${r.date}</td>
      <td>${r.time_slot}</td>
      <td>${r.position}</td>
      <td>${r.merchant_email || r.merchant_id}</td>
      <td>${r.poster_slogan || r.ad_code}</td>
      <td>${r.bid_cpm}</td>
      <td>${r.pay_cpm}</td>
      <td>${r.impressions}</td>
      <td>$${r.cost_usd}</td>
    </tr>
  `).join('');
}

function renderTuesdayWinner(auctionRows, isTuesdayMode) {
  const img = $('tuesdayWinnerImg');
  const title = $('tuesdayWinnerTitle');
  const meta = $('tuesdayWinnerMeta');
  const badge = $('tuesdayBadge');

  if (!img || !title || !meta || !badge) return;

  badge.style.display = isTuesdayMode ? 'inline-block' : 'none';

  if (!auctionRows.length) {
    img.style.display = 'none';
    title.textContent = '—';
    meta.textContent = 'No winners for selected date.';
    return;
  }

  // Top ad by impressions (tie-breaker: lower spend)
  const byAd = new Map();
  for (const r of auctionRows) {
    const key = r.poster_image_url || r.ad_code;
    if (!byAd.has(key)) byAd.set(key, { key, poster_slogan: r.poster_slogan, poster_image_url: r.poster_image_url, imps: 0, spend: 0 });
    const cur = byAd.get(key);
    cur.imps += Number(r.impressions || 0);
    cur.spend += Number(r.cost_usd || 0);
    if (!cur.poster_slogan && r.poster_slogan) cur.poster_slogan = r.poster_slogan;
    if (!cur.poster_image_url && r.poster_image_url) cur.poster_image_url = r.poster_image_url;
  }
  const arr = Array.from(byAd.values());
  arr.sort((a, b) => (b.imps - a.imps) || (a.spend - b.spend));
  const winner = arr[0];

  title.textContent = winner.poster_slogan || 'Winner Ad';
  meta.textContent = `Impressions: ${winner.imps.toLocaleString()} • Spend: $${winner.spend.toFixed(2)}`;

  if (winner.poster_image_url) {
    img.src = winner.poster_image_url;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }
}

function ensureCharts() {
  // Chart.js is loaded via script tag (global Chart)
  if (typeof window.Chart === 'undefined') return false;
  return true;
}

function renderCharts(auctionRows, merchantRows) {
  if (!ensureCharts()) return;

  // Spend by slot
  const spendBySlot = new Map();
  for (const r of auctionRows) {
    const slot = Number(r.time_slot);
    spendBySlot.set(slot, (spendBySlot.get(slot) || 0) + Number(r.cost_usd || 0));
  }
  const slotLabels = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const slotSpend = slotLabels.map(lbl => Number((spendBySlot.get(Number(lbl)) || 0).toFixed(2)));

  // Position mix
  const posCounts = { 1: 0, 2: 0, 3: 0 };
  for (const r of auctionRows) {
    const p = Number(r.position);
    if (p === 1 || p === 2 || p === 3) posCounts[p] += 1;
  }

  // Top merchants spend
  const topM = merchantRows.slice(0, 10);
  const mLabels = topM.map(m => (m.merchant_email || m.merchant_id || '').toString().slice(0, 18));
  const mSpend = topM.map(m => Number((Number(m.total_spend_usd || 0)).toFixed(2)));

  const spendCtx = $('chartSpendBySlot')?.getContext('2d');
  const mixCtx = $('chartPositionMix')?.getContext('2d');
  const merchCtx = $('chartTopMerchants')?.getContext('2d');

  if (spendCtx) {
    if (chartSpendBySlot) chartSpendBySlot.destroy();
    chartSpendBySlot = new window.Chart(spendCtx, {
      type: 'bar',
      data: {
        labels: slotLabels,
        datasets: [{
          label: 'Spend (USD)',
          data: slotSpend,
          backgroundColor: 'rgba(226, 0, 116, 0.6)',
          borderColor: 'rgba(226, 0, 116, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: (v) => `$${v}` } }
        }
      }
    });
  }

  if (mixCtx) {
    if (chartPositionMix) chartPositionMix.destroy();
    chartPositionMix = new window.Chart(mixCtx, {
      type: 'doughnut',
      data: {
        labels: ['Pos 1', 'Pos 2', 'Pos 3'],
        datasets: [{
          data: [posCounts[1], posCounts[2], posCounts[3]],
          backgroundColor: ['#00D659', '#E20074', '#666666']
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
  }

  if (merchCtx) {
    if (chartTopMerchants) chartTopMerchants.destroy();
    chartTopMerchants = new window.Chart(merchCtx, {
      type: 'bar',
      data: {
        labels: mLabels,
        datasets: [{
          label: 'Spend (USD)',
          data: mSpend,
          backgroundColor: 'rgba(0, 214, 89, 0.55)',
          borderColor: 'rgba(0, 214, 89, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: (v) => `$${v}` } }
        }
      }
    });
  }
}

async function saveRankingRun(targetDate, reserveCpm, statusMode, auctionRows, merchantRows) {
  // Store run metadata + store rows in separate collections to avoid 1MB doc limit.
  const runDoc = {
    targetDate,
    reserveCpm,
    statusMode,
    createdAt: serverTimestamp(),
    auctionCount: auctionRows.length,
    merchantCount: merchantRows.length
  };
  const runRef = await addDoc(collection(db, 'ranking_runs'), runDoc);

  async function writeRowsBatched(colName, rows) {
    const BATCH_LIMIT = 450;
    for (let i = 0; i < rows.length; i += BATCH_LIMIT) {
      const chunk = rows.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const r of chunk) {
        const ref = doc(collection(db, colName));
        batch.set(ref, { ...r, runId: runRef.id, createdAt: serverTimestamp() });
      }
      await batch.commit();
    }
  }

  await writeRowsBatched('ranking_auctions', auctionRows);
  await writeRowsBatched('ranking_merchants', merchantRows);
  return runRef.id;
}

async function loadLatestRun() {
  const q = query(collection(db, 'ranking_runs'), orderBy('createdAt', 'desc'), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) {
    alert('No ranking runs found yet. Click "Run Ranking" first.');
    return;
  }
  const runId = snap.docs[0].id;
  const auctionsSnap = await getDocs(query(collection(db, 'ranking_auctions'), where('runId', '==', runId)));
  const merchantsSnap = await getDocs(query(collection(db, 'ranking_merchants'), where('runId', '==', runId)));

  const auctionRows = [];
  auctionsSnap.forEach(d => auctionRows.push(d.data()));
  const merchantRows = [];
  merchantsSnap.forEach(d => merchantRows.push(d.data()));

  // Sort & trim
  merchantRows.sort((a, b) => Number(b.total_spend_usd || 0) - Number(a.total_spend_usd || 0));
  auctionRows.sort((a, b) => {
    const ka = `${a.zipcode}|${a.date}|${a.time_slot}|${a.position}`;
    const kb = `${b.zipcode}|${b.date}|${b.time_slot}|${b.position}`;
    return ka.localeCompare(kb);
  });

  renderKpis(auctionRows);
  renderMerchantTable(merchantRows);
  renderAuctionTable(auctionRows);
  renderTuesdayWinner(auctionRows, false);
  renderCharts(auctionRows, merchantRows);
}

async function runRanking() {
  ensureDefaultDate();
  const targetDate = $('rankingDate').value;
  const isTuesdayMode = Boolean($('rankingUseTuesday')?.checked);
  const targetYmd = isTuesdayMode ? nextTuesdayYmd(new Date(targetDate || Date.now())) : yyyymmdd(targetDate);
  const dataSource = $('rankingDataSource')?.value || 'firestore';
  const statusMode = $('rankingStatusFilter').value;
  const reserveCpm = Number($('rankingReserveCpm').value || 1);

  if (!targetYmd) {
    alert('Please select a valid date.');
    return;
  }

  // If in Tuesday mode, force the date input to show the resolved Tuesday.
  if (isTuesdayMode) {
    $('rankingDate').value = formatYmdToInput(targetYmd);
  }

  const btn = $('btnRunRanking');
  btn.disabled = true;
  btn.textContent = 'Running...';
  try {
    let bidRows = [];
    if (dataSource === 'csv_demo') {
      // Ensure the demo dataset is loaded; if the selected date isn't in the dataset,
      // move to the first available date (so the dashboard shows something immediately).
      const demo = await loadDemoDataset();
      if (!demo.dates.includes(String(targetYmd))) {
        const fallback = demo.dates[0];
        if (fallback) {
          $('rankingDate').value = demoDateYmdToInput(fallback);
          bidRows = await buildBidRowsFromDemoCsv(fallback);
        }
      } else {
        bidRows = await buildBidRowsFromDemoCsv(targetYmd);
      }
    } else {
      const bids = await fetchBidsForRanking(statusMode);
      bidRows = expandBidsToAuctionInputs(bids, targetYmd);
    }
    const auctionRows = runGspAuctions(bidRows, reserveCpm);
    const merchantRows = summarizeMerchants(auctionRows);

    renderKpis(auctionRows);
    renderMerchantTable(merchantRows);
    renderAuctionTable(auctionRows);
    renderTuesdayWinner(auctionRows, isTuesdayMode);
    renderCharts(auctionRows, merchantRows);

    const runId = await saveRankingRun(targetYmd, reserveCpm, statusMode, auctionRows, merchantRows);
    alert(`✅ Ranking run saved. runId=${runId}`);
  } catch (e) {
    console.error(e);
    alert('Ranking failed: ' + (e?.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Ranking';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Only run on admin page that has ranking tab elements
  if (!$('btnRunRanking')) return;
  ensureDefaultDate();

  // Toggle Tuesday mode behavior
  const tuesdayToggle = $('rankingUseTuesday');
  if (tuesdayToggle) {
    tuesdayToggle.addEventListener('change', () => {
      if (tuesdayToggle.checked) {
        const base = $('rankingDate')?.value ? new Date($('rankingDate').value) : new Date();
        const tueYmd = nextTuesdayYmd(base);
        $('rankingDate').value = formatYmdToInput(tueYmd);
      }
    });
  }

  // Data source: if CSV demo is selected, snap date into dataset range.
  const dataSourceEl = $('rankingDataSource');
  if (dataSourceEl) {
    dataSourceEl.addEventListener('change', async () => {
      if (dataSourceEl.value !== 'csv_demo') return;
      try {
        const demo = await loadDemoDataset();
        // Prefer 2025-07-15 (Tuesday) if present; else first available date.
        const preferred = demo.dates.includes('20250715') ? '20250715' : demo.dates[0];
        if (preferred) $('rankingDate').value = demoDateYmdToInput(preferred);
      } catch (e) {
        console.warn('Failed to init CSV demo dataset:', e);
      }
    });
  }

  $('btnRunRanking').addEventListener('click', runRanking);
  $('btnLoadLatestRanking').addEventListener('click', loadLatestRun);
});


