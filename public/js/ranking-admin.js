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
import { getMerchantName, getMerchantEmail } from './demo-merchants.js';

function $(id) { return document.getElementById(id); }

let chartSpendBySlot = null;
let chartPositionMix = null;
let chartTopMerchants = null;
let latestMerchantRows = [];
let latestAuctionRows = [];
let rankingMerchantRegionMap = new Map();

function isDemoModeEnabled() {
  return localStorage.getItem('adminDemoMode') !== 'false';
}

function regionFromZip(zip) {
  const s = String(zip || '').replace(/\D/g, '');
  if (!s) return 'central';
  const prefix = Number(s.slice(0, 1));
  if (Number.isNaN(prefix)) return 'central';
  if (prefix <= 3) return 'east';
  if (prefix <= 6) return 'central';
  return 'west';
}

function buildMerchantRegionMap(auctionRows) {
  const regionMap = new Map();
  for (const r of auctionRows || []) {
    const key = String(r.merchant_id || r.merchant_email || '').trim();
    if (!key) continue;
    if (!regionMap.has(key)) regionMap.set(key, new Set());
    regionMap.get(key).add(regionFromZip(r.zipcode));
  }
  return regionMap;
}

function updateMerchantRegionFilterOptions() {
  const sel = $('rankingMerchantRegionFilter');
  if (!sel) return;
  const current = sel.value || 'all';
  const regions = new Set(['east', 'central', 'west']);
  for (const set of rankingMerchantRegionMap.values()) {
    for (const region of set) regions.add(region);
  }
  const ordered = ['all', ...['east', 'central', 'west'].filter((r) => regions.has(r))];
  sel.innerHTML = ordered.map((r) => {
    if (r === 'all') return '<option value="all">Region: All</option>';
    return `<option value="${r}">Region: ${r.charAt(0).toUpperCase()}${r.slice(1)}</option>`;
  }).join('');
  sel.value = ordered.includes(current) ? current : 'all';
}

function buildFallbackDemoBidRows(targetYmd) {
  const date = String(targetYmd || '20250715');
  const rows = [];
  const merchants = ['M001', 'M007', 'M010', 'M031', 'M045'];
  const zipcodes = ['98101', '10001', '90001', '60601'];
  for (let z = 0; z < zipcodes.length; z++) {
    for (let s = 1; s <= 8; s++) {
      for (let m = 0; m < merchants.length; m++) {
        rows.push({
          zipcode: zipcodes[z],
          date,
          time_slot: s,
          merchant_id: merchants[m],
          merchant_email: getMerchantName(merchants[m]),
          ad_code: `DEMO-${merchants[m]}-${zipcodes[z]}-${s}`,
          bid_cpm: Number((1 + (m * 0.6) + (s * 0.08)).toFixed(2)),
          campaign_id: `demo_${merchants[m]}_${z}_${s}`,
          poster_image_url: '',
          poster_slogan: `${getMerchantName(merchants[m])} Slot ${s}`,
          merchant_contact: getMerchantEmail(merchants[m])
        });
      }
    }
  }
  return rows;
}

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
  const cards = $('rankingMerchantCards');
  const tbody = $('rankingMerchantTableBody'); // backward compatibility
  const tierFilter = $('rankingMerchantTierFilter')?.value || 'all';
  const regionFilter = $('rankingMerchantRegionFilter')?.value || 'all';
  const sorted = [...merchantRows].sort((a, b) => Number(b.total_spend_usd || 0) - Number(a.total_spend_usd || 0));
  const maxSpend = Math.max(1, ...sorted.map((r) => Number(r.total_spend_usd || 0)));
  const maxImps = Math.max(1, ...sorted.map((r) => Number(r.total_impressions || 0)));
  if (!cards && !tbody) return;
  if (!sorted.length) {
    if (cards) cards.innerHTML = '<div class="viz-empty">No merchant summary</div>';
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px;">No merchant summary</td></tr>';
    return;
  }
  const regionFiltered = sorted.filter((r) => {
    if (regionFilter === 'all') return true;
    const key = String(r.merchant_id || r.merchant_email || '').trim();
    const regionSet = rankingMerchantRegionMap.get(key);
    return Boolean(regionSet && regionSet.has(regionFilter));
  });
  const top = regionFiltered.slice(0, 24);

  const tierMeta = {
    top: { title: 'Top Performers', sub: 'Highest spend and strongest auction wins.' },
    growth: { title: 'Growth Merchants', sub: 'Solid performance with room to scale.' },
    emerging: { title: 'Emerging Merchants', sub: 'Lower spend accounts to monitor and optimize.' }
  };

  const tiers = { top: [], growth: [], emerging: [] };
  for (const r of top) {
    const spend = Number(r.total_spend_usd || 0);
    const wins = Number(r.wins || 0);
    if (spend >= maxSpend * 0.66 || wins >= 120) tiers.top.push(r);
    else if (spend >= maxSpend * 0.33 || wins >= 40) tiers.growth.push(r);
    else tiers.emerging.push(r);
  }

  const tierLimits = { top: 6, growth: 8, emerging: 6 };

  if (cards) {
    const tierOrder = tierFilter === 'all' ? ['top', 'growth', 'emerging'] : [tierFilter];
    cards.innerHTML = tierOrder.map((tierKey) => {
      const merchants = tiers[tierKey];
      const meta = tierMeta[tierKey];
      const limited = merchants.slice(0, tierLimits[tierKey]);
      const hiddenCount = Math.max(0, merchants.length - limited.length);
      if (!merchants.length) return '';
      return `
        <section class="merchant-tier">
          <div class="merchant-tier-header">
            <div class="merchant-tier-title">${meta.title}</div>
            <div class="merchant-tier-sub">${meta.sub}</div>
          </div>
          <div class="viz-card-grid merchant-tier-grid">
            ${limited.map((r) => {
              const spend = Number(r.total_spend_usd || 0);
              const imps = Number(r.total_impressions || 0);
              const wins = Number(r.wins || 0);
              const spendPct = Math.max(4, Math.round((spend / maxSpend) * 100));
              const impsPct = Math.max(4, Math.round((imps / maxImps) * 100));
              return `
                <div class="viz-card">
                  <div class="viz-card-title">${r.merchant_email || r.merchant_id}</div>
                  <div class="viz-card-sub">$${spend.toLocaleString()} total spend</div>
                  <div class="viz-metric-row"><span>Impressions</span><span>${imps.toLocaleString()}</span></div>
                  <div class="viz-progress"><span style="width:${impsPct}%"></span></div>
                  <div class="viz-chip-row">
                    <span class="viz-chip">Wins ${wins.toLocaleString()}</span>
                    <span class="viz-chip">Spend Share ${spendPct}%</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          ${hiddenCount ? `<div class="merchant-tier-more">+${hiddenCount} more merchants in this tier</div>` : ''}
        </section>
      `;
    }).join('') || '<div class="viz-empty">No merchants match this filter.</div>';
  }

  if (tbody) {
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
}

function rerenderMerchantCards() {
  renderMerchantTable(latestMerchantRows);
}

function updateAuctionFilterOptions(auctionRows) {
  const slotEl = $('rankingAuctionSlotFilter');
  const posEl = $('rankingAuctionPositionFilter');
  if (slotEl) {
    const current = slotEl.value || 'all';
    const slots = Array.from(new Set((auctionRows || []).map((r) => Number(r.time_slot)).filter((x) => Number.isFinite(x))))
      .sort((a, b) => a - b);
    slotEl.innerHTML = ['<option value="all">Slot: All</option>', ...slots.map((s) => `<option value="${s}">Slot: ${s}</option>`)].join('');
    slotEl.value = slots.map(String).includes(current) ? current : 'all';
  }
  if (posEl) {
    const current = posEl.value || 'all';
    const positions = Array.from(new Set((auctionRows || []).map((r) => Number(r.position)).filter((x) => Number.isFinite(x))))
      .sort((a, b) => a - b);
    posEl.innerHTML = ['<option value="all">Position: All</option>', ...positions.map((p) => `<option value="${p}">Position: ${p}</option>`)].join('');
    posEl.value = positions.map(String).includes(current) ? current : 'all';
  }
}

function getFilteredAuctionRows(auctionRows) {
  const regionFilter = $('rankingAuctionRegionFilter')?.value || 'all';
  const slotFilter = $('rankingAuctionSlotFilter')?.value || 'all';
  const positionFilter = $('rankingAuctionPositionFilter')?.value || 'all';
  const keyword = String($('rankingAuctionKeywordFilter')?.value || '').trim().toLowerCase();

  return (auctionRows || []).filter((r) => {
    if (regionFilter !== 'all' && regionFromZip(r.zipcode) !== regionFilter) return false;
    if (slotFilter !== 'all' && String(r.time_slot) !== String(slotFilter)) return false;
    if (positionFilter !== 'all' && String(r.position) !== String(positionFilter)) return false;
    if (keyword) {
      const hay = `${r.merchant_email || ''} ${r.merchant_id || ''} ${r.poster_slogan || ''} ${r.ad_code || ''}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });
}

function rerenderAuctionCards() {
  renderAuctionTable(latestAuctionRows);
}

function renderAuctionTable(auctionRows) {
  const cards = $('rankingAuctionCards');
  const tbody = $('rankingAuctionTableBody'); // backward compatibility
  const limit = Number($('rankingAuctionLimitFilter')?.value || 24);
  const filteredRows = getFilteredAuctionRows(auctionRows);
  const maxCost = Math.max(1, ...filteredRows.map((r) => Number(r.cost_usd || 0)));
  if (!cards && !tbody) return;
  if (!auctionRows.length) {
    if (cards) cards.innerHTML = '<div class="viz-empty">No auction winners</div>';
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 40px;">No auction winners</td></tr>';
    return;
  }
  if (!filteredRows.length) {
    if (cards) cards.innerHTML = '<div class="viz-empty">No auction winners match this filter.</div>';
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 40px;">No winners match this filter</td></tr>';
    return;
  }
  const top = filteredRows.slice(0, limit);

  if (cards) {
    cards.innerHTML = top.map((r) => {
      const cost = Number(r.cost_usd || 0);
      const costPct = Math.max(5, Math.round((cost / maxCost) * 100));
      const rawTitle = String(r.poster_slogan || r.ad_code || 'Ad');
      const titleParts = rawTitle.split('•').map((x) => x.trim()).filter(Boolean);
      const titleMain = titleParts.length > 1 ? titleParts[0] : rawTitle;
      const titleSecondaryRaw = titleParts.length > 1 ? titleParts.slice(1).join(' • ') : '';
      const titleSecondary = titleSecondaryRaw.length > 26
        ? `${titleSecondaryRaw.slice(0, 26)}...`
        : titleSecondaryRaw;
      const merchantPrimary = String(r.merchant_email || r.merchant_id || 'Unknown');
      const merchantId = String(r.merchant_id || '').trim();
      const merchantIdSecondary = merchantId
        ? `Merchant ID: ${merchantId.length > 18 ? `${merchantId.slice(0, 18)}...` : merchantId}`
        : '';
      return `
        <div class="viz-card">
          <div class="viz-card-title">${titleMain}</div>
          ${titleSecondary ? `<div class="viz-card-sub auction-secondary">${titleSecondary}</div>` : ''}
          <div class="viz-card-sub">${merchantPrimary}</div>
          ${merchantIdSecondary ? `<div class="viz-card-sub auction-secondary">${merchantIdSecondary}</div>` : ''}
          <div class="viz-chip-row" style="margin-bottom: 8px;">
            <span class="viz-chip">ZIP ${r.zipcode}</span>
            <span class="viz-chip">Date ${r.date}</span>
            <span class="viz-chip">Slot ${r.time_slot}</span>
            <span class="viz-chip">Pos ${r.position}</span>
          </div>
          <div class="viz-metric-row"><span>Bid CPM</span><span>${Number(r.bid_cpm || 0).toFixed(2)}</span></div>
          <div class="viz-metric-row"><span>Pay CPM</span><span>${Number(r.pay_cpm || 0).toFixed(2)}</span></div>
          <div class="viz-metric-row"><span>Impressions</span><span>${Number(r.impressions || 0).toLocaleString()}</span></div>
          <div class="viz-metric-row"><span>Cost</span><span>$${cost.toFixed(2)}</span></div>
          <div class="viz-progress"><span style="width:${costPct}%"></span></div>
        </div>
      `;
    }).join('');
  }

  if (tbody) {
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

  latestMerchantRows = merchantRows;
  latestAuctionRows = auctionRows;
  rankingMerchantRegionMap = buildMerchantRegionMap(auctionRows);
  updateMerchantRegionFilterOptions();
  updateAuctionFilterOptions(auctionRows);

  renderKpis(auctionRows);
  renderMerchantTable(merchantRows);
  renderAuctionTable(auctionRows);
  renderTuesdayWinner(auctionRows, false);
  renderCharts(auctionRows, merchantRows);
}

async function runRanking(opts = {}) {
  const { skipSave = false, silent = false } = opts;
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
      try {
        // Ensure the demo dataset is loaded; if selected date isn't in dataset,
        // move to first available date so dashboard renders immediately.
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
      } catch (err) {
        console.warn('CSV demo load failed, using fallback demo rows:', err);
      }
    } else {
      const bids = await fetchBidsForRanking(statusMode);
      bidRows = expandBidsToAuctionInputs(bids, targetYmd);
    }
    if (!bidRows.length && dataSource === 'csv_demo') {
      bidRows = buildFallbackDemoBidRows(targetYmd);
    }

    const auctionRows = runGspAuctions(bidRows, reserveCpm);
    const merchantRows = summarizeMerchants(auctionRows);

    latestMerchantRows = merchantRows;
    latestAuctionRows = auctionRows;
    rankingMerchantRegionMap = buildMerchantRegionMap(auctionRows);
    updateMerchantRegionFilterOptions();
    updateAuctionFilterOptions(auctionRows);

    renderKpis(auctionRows);
    renderMerchantTable(merchantRows);
    renderAuctionTable(auctionRows);
    renderTuesdayWinner(auctionRows, isTuesdayMode);
    renderCharts(auctionRows, merchantRows);

    if (!skipSave) {
      const runId = await saveRankingRun(targetYmd, reserveCpm, statusMode, auctionRows, merchantRows);
      if (!silent) alert(`Ranking run saved. runId=${runId}`);
    }
  } catch (e) {
    console.error(e);
    if (!silent) alert('Ranking failed: ' + (e?.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Ranking';
  }
}

async function renderDemoRankingInstantly() {
  if (!$('rankingDataSource')) return;
  $('rankingDataSource').value = 'csv_demo';
  if ($('rankingStatusFilter')) $('rankingStatusFilter').value = 'all';
  if ($('rankingReserveCpm')) $('rankingReserveCpm').value = '0.5';
  await runRanking({ skipSave: true, silent: true });
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

  const tierFilterEl = $('rankingMerchantTierFilter');
  const regionFilterEl = $('rankingMerchantRegionFilter');
  const resetFilterBtn = $('rankingMerchantFilterReset');
  if (tierFilterEl) tierFilterEl.addEventListener('change', rerenderMerchantCards);
  if (regionFilterEl) regionFilterEl.addEventListener('change', rerenderMerchantCards);
  if (resetFilterBtn) {
    resetFilterBtn.addEventListener('click', () => {
      if (tierFilterEl) tierFilterEl.value = 'all';
      if (regionFilterEl) regionFilterEl.value = 'all';
      rerenderMerchantCards();
    });
  }

  const auctionRegionEl = $('rankingAuctionRegionFilter');
  const auctionSlotEl = $('rankingAuctionSlotFilter');
  const auctionPosEl = $('rankingAuctionPositionFilter');
  const auctionKeywordEl = $('rankingAuctionKeywordFilter');
  const auctionLimitEl = $('rankingAuctionLimitFilter');
  const auctionResetEl = $('rankingAuctionFilterReset');
  if (auctionRegionEl) auctionRegionEl.addEventListener('change', rerenderAuctionCards);
  if (auctionSlotEl) auctionSlotEl.addEventListener('change', rerenderAuctionCards);
  if (auctionPosEl) auctionPosEl.addEventListener('change', rerenderAuctionCards);
  if (auctionLimitEl) auctionLimitEl.addEventListener('change', rerenderAuctionCards);
  if (auctionKeywordEl) {
    auctionKeywordEl.addEventListener('input', () => {
      window.clearTimeout(auctionKeywordEl._t);
      auctionKeywordEl._t = window.setTimeout(rerenderAuctionCards, 120);
    });
  }
  if (auctionResetEl) {
    auctionResetEl.addEventListener('click', () => {
      if (auctionRegionEl) auctionRegionEl.value = 'all';
      if (auctionSlotEl) auctionSlotEl.value = 'all';
      if (auctionPosEl) auctionPosEl.value = 'all';
      if (auctionLimitEl) auctionLimitEl.value = '24';
      if (auctionKeywordEl) auctionKeywordEl.value = '';
      rerenderAuctionCards();
    });
  }

  window.addEventListener('admin-demo-mode-changed', async (evt) => {
    if (evt?.detail?.enabled) {
      await renderDemoRankingInstantly();
    }
  });

  if (localStorage.getItem('adminDemoMode') !== 'false') {
    setTimeout(() => { renderDemoRankingInstantly(); }, 250);
  }

  const demoToggle = $('adminDemoMode');
  if (demoToggle) {
    demoToggle.addEventListener('change', async () => {
      if (demoToggle.checked) await renderDemoRankingInstantly();
    });
  }

  if (isDemoModeEnabled() && $('adminDemoMode')?.checked) {
    setTimeout(() => { renderDemoRankingInstantly(); }, 600);
  }
});


