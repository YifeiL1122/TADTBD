// Admin Dashboard Logic
import { db } from './firebase-config.js';
import { loadDemoDataset } from './demo-dataset.js';
import { getMerchantName, getMerchantEmail } from './demo-merchants.js';
import {
    formatNumber,
    renderPerformanceHeatmap,
    renderCampaignTimeline,
    renderCampaignFunnel
} from './admin-viz.js';
import {
    collection,
    getDocs,
    query,
    orderBy,
    doc,
    updateDoc,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let adminSession = null;
let allBiddings = [];
let allDeployments = [];
let currentEditId = null;
let chartRevenue7d = null;
let chartStatusMix = null;
let chartTopZipcodes = null;
let selectedRegion = '';
let selectedState = '';
let selectedArea = '';
let currentSection = 'dashboard';
let internalAdsState = [];
let internalAutoMode = true;
let internalAutoIntervalSec = 20;
let internalAutoTimer = null;

const DEMO_MODE_KEY = 'adminDemoMode';
const REGION_KEY = 'adminSelectedRegion';
const STATE_KEY = 'adminSelectedState';
const AREA_KEY = 'adminSelectedArea';
const INTERNAL_ADS_STATE_KEY = 'internalAdsWorkflowV1';
const INTERNAL_AUTO_SETTINGS_KEY = 'internalAdsAutoSettingsV1';
let isUsingDemoData = false;

const REGION_TREE = {
    all: {
        states: ['all'],
        areas: { all: ['all'] }
    },
    west: {
        states: ['WA', 'CA'],
        areas: {
            WA: ['Seattle', 'Bellevue', 'Tacoma'],
            CA: ['San Francisco', 'San Jose', 'Los Angeles']
        }
    },
    central: {
        states: ['TX', 'IL'],
        areas: {
            TX: ['Austin', 'Dallas', 'Houston'],
            IL: ['Chicago', 'Naperville', 'Springfield']
        }
    },
    east: {
        states: ['NY', 'MA'],
        areas: {
            NY: ['NYC', 'Brooklyn', 'Buffalo'],
            MA: ['Boston', 'Cambridge', 'Worcester']
        }
    }
};

function getDemoMode() {
    // Default ON for dashboard demo branch unless explicitly turned off.
    const stored = localStorage.getItem(DEMO_MODE_KEY);
    if (stored === null) return true;
    return stored === 'true';
}

function setDemoMode(on) {
    localStorage.setItem(DEMO_MODE_KEY, on ? 'true' : 'false');
}

function setDemoBadge(show) {
    const badge = document.getElementById('demoDataBadge');
    if (badge) badge.style.display = show ? 'inline-block' : 'none';
}

function getStoredRegion() {
    return localStorage.getItem(REGION_KEY) || '';
}

function setStoredRegion(region) {
    localStorage.setItem(REGION_KEY, region || '');
}

function getStoredState() {
    return localStorage.getItem(STATE_KEY) || '';
}

function setStoredState(state) {
    localStorage.setItem(STATE_KEY, state || '');
}

function getStoredArea() {
    return localStorage.getItem(AREA_KEY) || '';
}

function setStoredArea(area) {
    localStorage.setItem(AREA_KEY, area || '');
}

function normalizeRegion(region) {
    const value = String(region || '').toLowerCase();
    if (['all', 'west', 'central', 'east'].includes(value)) return value;
    return '';
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

function zipToGeo(zip) {
    const region = regionFromZip(zip);
    const tree = REGION_TREE[region] || REGION_TREE.central;
    const states = tree.states || ['TX'];
    const digits = String(zip || '').replace(/\D/g, '') || '0';
    const seed = Number(digits.slice(-2)) || 0;
    const state = states[seed % states.length];
    const areas = (tree.areas && tree.areas[state]) ? tree.areas[state] : ['Metro'];
    const area = areas[seed % areas.length];
    return { region, state, area };
}

function matchesRegion(zipcodes, region, state = '', area = '') {
    const normalized = normalizeRegion(region);
    if (!normalized || normalized === 'all') return true;
    const list = Array.isArray(zipcodes) ? zipcodes : [];
    if (!list.length) return false;
    return list.some((zip) => {
        const geo = zipToGeo(zip);
        if (geo.region !== normalized) return false;
        if (state && state !== 'all' && geo.state !== state) return false;
        if (area && area !== 'all' && geo.area !== area) return false;
        return true;
    });
}

function getBidZipcodes(bid) {
    if (Array.isArray(bid?.zipcodes) && bid.zipcodes.length) return bid.zipcodes.map(String);
    if (bid?.zipcode) return [String(bid.zipcode)];
    return [];
}

function getFilteredBiddings() {
    if (!selectedRegion || selectedRegion === 'all') return allBiddings.slice();
    return allBiddings.filter((b) => matchesRegion(getBidZipcodes(b), selectedRegion, selectedState, selectedArea));
}

function getFilteredDeployments() {
    if (!selectedRegion || selectedRegion === 'all') return allDeployments.slice();
    return allDeployments.filter((d) => matchesRegion((d.zipcodes || []).map(String), selectedRegion, selectedState, selectedArea));
}

function showDemoLoading(show) {
    const overlay = document.getElementById('demoLoadingOverlay');
    if (overlay) overlay.classList.toggle('active', show);
}

function demoTimeSlots() {
    return ['06:00-08:00', '08:00-10:00', '12:00-14:00', '18:00-20:00'];
}

function ymdToInput(ymd) {
    if (!ymd || !/^\d{8}$/.test(String(ymd))) return '';
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function parseYmd(ymd) {
    if (!ymd || !/^\d{8}$/.test(String(ymd))) return null;
    const yyyy = Number(ymd.slice(0, 4));
    const mm = Number(ymd.slice(4, 6));
    const dd = Number(ymd.slice(6, 8));
    const d = new Date(yyyy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateInput(d) {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function mulberry32(seed) {
    let t = seed >>> 0;
    return function() {
        t += 0x6D2B79F5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function hashStringToSeed(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function reservoirSample(arr, k, rand) {
    const n = arr.length;
    if (k >= n) return arr.slice();
    const res = arr.slice(0, k);
    for (let i = k; i < n; i++) {
        const j = Math.floor(rand() * (i + 1));
        if (j < k) res[j] = arr[i];
    }
    return res;
}

function slot8ToLabel(slot8) {
    // TADRANKING's 8-slot UI mapping: 06:00–22:00 (2h windows)
    const labels = [
        '06:00-08:00',
        '08:00-10:00',
        '10:00-12:00',
        '12:00-14:00',
        '14:00-16:00',
        '16:00-18:00',
        '18:00-20:00',
        '20:00-22:00'
    ];
    const idx = Number(slot8) - 1;
    return labels[idx] || null;
}

async function getDemoBiddingsFromCsv(maxRows = 200) {
    // Convert the provided CSV dataset into "campaigns" that this admin page can render.
    const demo = await loadDemoDataset(); // rows: {merchant_id, ad_id, zipcode, dateYmd, slots:[{time_slot,bid_cpm}]}
    const rows = Array.isArray(demo.rows) ? demo.rows : [];
    const k = Math.max(20, Math.min(maxRows, rows.length));
    const rand = mulberry32(hashStringToSeed('tmobile-demo-csv-v2'));
    // Unbiased sample across the full dataset -> matches real distribution (date/zipcode/merchant frequency) approximately.
    const picked = reservoirSample(rows, k, rand);

    const minYmd = Array.isArray(demo.dates) && demo.dates.length ? demo.dates[0] : null;
    const minDate = parseYmd(minYmd);
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);

    const out = [];
    for (let i = 0; i < picked.length; i++) {
        const r = picked[i];
        // Map dataset week to "this week" to make Schedule feel current while keeping date distribution shape.
        let startDate = ymdToInput(r.dateYmd);
        if (minDate) {
            const rowDate = parseYmd(r.dateYmd);
            if (rowDate) {
                const offsetDays = Math.round((rowDate.getTime() - minDate.getTime()) / 86400000);
                const mapped = new Date(anchor);
                mapped.setDate(mapped.getDate() + offsetDays);
                startDate = formatDateInput(mapped);
            }
        }
        // End date: small window to look realistic
        const endD = new Date(startDate + 'T00:00:00');
        const endPlus = Math.floor(rand() * 4); // 0..3
        endD.setDate(endD.getDate() + endPlus);
        const endDate = formatDateInput(endD);

        const bids = (r.slots || []).map(s => Number(s.bid_cpm || 0)).filter(x => Number.isFinite(x) && x > 0);
        const avgBid = bids.length ? (bids.reduce((a, b) => a + b, 0) / bids.length) : 1;
        const bidAmount = avgBid;
        const timeSlots = (r.slots || [])
            .map(s => slot8ToLabel(s.time_slot))
            .filter(Boolean);

        // Realistic status distribution: mostly active, some pending, few completed/rejected
        const p = rand();
        const status = p < 0.15 ? 'pending' : (p < 0.82 ? 'active' : (p < 0.93 ? 'completed' : 'rejected'));

        // createdAt should be recent so Analytics last-7-days chart looks alive
        const createdAtD = new Date();
        createdAtD.setDate(createdAtD.getDate() - Math.floor(rand() * 7));

        out.push({
            id: `demo_${r.ad_id}`,
            userId: String(r.merchant_id),
            userEmail: getMerchantName(r.merchant_id),
            userContact: getMerchantEmail(r.merchant_id),
            zipcodes: [String(r.zipcode)],
            startDate,
            endDate,
            bidAmount: Number(bidAmount.toFixed(0)),
            estimatedReach: Math.round(2400 * Math.max(1, Math.min(8, timeSlots.length)) * (0.7 + rand() * 0.9)),
            status,
            timeSlots: timeSlots.length ? timeSlots : demoTimeSlots(),
            createdAt: createdAtD.toISOString(),
            timestamp: Date.now() - (i * 60_000)
        });
    }
    return out;
}

function getDemoDeploymentsFromCampaigns(campaigns) {
    const now = Date.now();
    const rand = mulberry32(hashStringToSeed('tmobile-demo-deployments-v2'));
    const active = (campaigns || []).filter(c => (c.status === 'active' || c.status === 'pending'));
    const picked = reservoirSample(active, Math.min(12, Math.max(3, Math.floor(active.length / 12))), rand);

    return picked.map((c, idx) => {
        const targetDevices = Math.max(6, Math.min(80, Math.round((c.bidAmount || 10) * (0.8 + rand() * 1.5))));
        const activeDevices = Math.max(0, Math.min(targetDevices, Math.round(targetDevices * (0.6 + rand() * 0.35))));
        const status = c.status === 'pending' ? 'pending' : 'active';
        const deployedAt = new Date(now - Math.round(rand() * 48) * 3600_000).toISOString();
        return {
            id: `demo_dep_${String(idx + 1).padStart(6, '0')}`,
            campaignName: c.id || 'Demo Campaign',
            userEmail: c.userEmail || 'demo@merchant',
            zipcodes: c.zipcodes || [],
            targetDevices,
            activeDevices,
            status,
            deployedAt,
            timestamp: Date.parse(deployedAt)
        };
    });
}

// Check admin session on load
function checkAdminSession() {
    const session = localStorage.getItem('adminSession');

    if (!session) {
        console.log('No admin session found');
        window.location.href = '/admin-login.html';
        return false;
    }

    try {
        adminSession = JSON.parse(session);

        // Check if session is less than 24 hours old
        const loginTime = new Date(adminSession.loginTime);
        const now = new Date();
        const hoursDiff = (now - loginTime) / (1000 * 60 * 60);

        if (hoursDiff >= 24) {
            console.log('Admin session expired');
            localStorage.removeItem('adminSession');
            window.location.href = '/admin-login.html';
            return false;
        }

        console.log('Admin authenticated:', adminSession.username);

        // Update user display
        const userDisplay = document.querySelector('.user-display');
        if (userDisplay) {
            userDisplay.textContent = adminSession.username;
        }

        return true;

    } catch (error) {
        console.error('Invalid session:', error);
        localStorage.removeItem('adminSession');
        window.location.href = '/admin-login.html';
        return false;
    }
}

function setInternalWorkflowHint(text) {
    const el = document.getElementById('internalWorkflowHint');
    if (el) el.textContent = text || '';
}

function refreshDashboardViews() {
    updateStatistics();
    displayBiddings();
    displayDeployments();
    renderAnalyticsCharts();
}

function fillSelectOptions(selectEl, values, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    selectEl.appendChild(first);
    values.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v === 'all' ? 'All' : v;
        selectEl.appendChild(opt);
    });
}

function syncRegionSelectOptions(region) {
    const normalized = normalizeRegion(region);
    const tree = REGION_TREE[normalized || 'all'] || REGION_TREE.all;
    const states = tree.states || [];
    const areasByState = tree.areas || {};
    const areaList = selectedState && areasByState[selectedState]
        ? areasByState[selectedState]
        : (states[0] ? (areasByState[states[0]] || []) : []);

    fillSelectOptions(document.getElementById('stateQuickFilter'), states, 'State');
    fillSelectOptions(document.getElementById('stateGateSelect'), states, 'Choose state');
    fillSelectOptions(document.getElementById('areaQuickFilter'), areaList, 'City/Area');
    fillSelectOptions(document.getElementById('areaGateSelect'), areaList, 'Choose city/area');
}

function syncAreaOptionsForState(region, state) {
    const normalized = normalizeRegion(region);
    const tree = REGION_TREE[normalized || 'all'] || REGION_TREE.all;
    const areas = (tree.areas && tree.areas[state]) ? tree.areas[state] : ['all'];
    fillSelectOptions(document.getElementById('areaQuickFilter'), areas, 'City/Area');
    fillSelectOptions(document.getElementById('areaGateSelect'), areas, 'Choose city/area');
}

function applyRegionSelection(region, state = '', area = '', fromGate = false) {
    const normalized = normalizeRegion(region);
    selectedRegion = normalized;
    selectedState = state || '';
    selectedArea = area || '';
    setStoredRegion(normalized);
    setStoredState(selectedState);
    setStoredArea(selectedArea);

    const quickRegion = document.getElementById('regionQuickFilter');
    const gateRegion = document.getElementById('regionGateSelect');
    const quickState = document.getElementById('stateQuickFilter');
    const gateState = document.getElementById('stateGateSelect');
    const quickArea = document.getElementById('areaQuickFilter');
    const gateArea = document.getElementById('areaGateSelect');
    if (quickRegion) quickRegion.value = normalized;
    if (gateRegion) gateRegion.value = normalized;

    syncRegionSelectOptions(normalized);
    if (selectedState) {
        if (quickState) quickState.value = selectedState;
        if (gateState) gateState.value = selectedState;
        syncAreaOptionsForState(normalized, selectedState);
    }
    if (selectedArea) {
        if (quickArea) quickArea.value = selectedArea;
        if (gateArea) gateArea.value = selectedArea;
    }

    const gate = document.getElementById('regionGate');
    if (gate) gate.style.display = normalized ? 'none' : 'block';

    if (normalized) {
        refreshDashboardViews();
        if (fromGate) {
            switchSection('dashboard');
            switchTab('all-biddings');
        }
    }
}

function initRegionSelection() {
    const quickRegion = document.getElementById('regionQuickFilter');
    const gateRegion = document.getElementById('regionGateSelect');
    const quickState = document.getElementById('stateQuickFilter');
    const gateState = document.getElementById('stateGateSelect');
    const quickArea = document.getElementById('areaQuickFilter');
    const gateArea = document.getElementById('areaGateSelect');
    const enterBtn = document.getElementById('btnEnterRegion');

    if (quickRegion) {
        quickRegion.addEventListener('change', () => {
            selectedState = '';
            selectedArea = '';
            applyRegionSelection(quickRegion.value);
        });
    }
    if (gateRegion) {
        gateRegion.addEventListener('change', () => {
            if (quickRegion) quickRegion.value = gateRegion.value;
            selectedState = '';
            selectedArea = '';
            applyRegionSelection(gateRegion.value);
            const gate = document.getElementById('regionGate');
            if (gate) gate.style.display = 'block';
        });
    }
    if (quickState) {
        quickState.addEventListener('change', () => {
            selectedState = quickState.value;
            selectedArea = '';
            syncAreaOptionsForState(selectedRegion, selectedState);
            applyRegionSelection(selectedRegion, selectedState, '');
        });
    }
    if (gateState) {
        gateState.addEventListener('change', () => {
            if (quickState) quickState.value = gateState.value;
            selectedState = gateState.value;
            selectedArea = '';
            syncAreaOptionsForState(selectedRegion, selectedState);
        });
    }
    if (quickArea) {
        quickArea.addEventListener('change', () => {
            selectedArea = quickArea.value;
            applyRegionSelection(selectedRegion, selectedState, selectedArea);
        });
    }
    if (gateArea) {
        gateArea.addEventListener('change', () => {
            if (quickArea) quickArea.value = gateArea.value;
            selectedArea = gateArea.value;
        });
    }

    if (enterBtn) {
        enterBtn.addEventListener('click', () => {
            const picked = gateRegion?.value || quickRegion?.value || '';
            if (!normalizeRegion(picked)) {
                alert('Please choose a region first.');
                return;
            }
            const stateVal = gateState?.value || quickState?.value || '';
            const areaVal = gateArea?.value || quickArea?.value || '';
            applyRegionSelection(picked, stateVal, areaVal, true);
        });
    }

    const remembered = normalizeRegion(getStoredRegion());
    const rememberedState = getStoredState();
    const rememberedArea = getStoredArea();
    applyRegionSelection(remembered, rememberedState, rememberedArea);
}

function loadInternalAdsState() {
    try {
        const raw = localStorage.getItem(INTERNAL_ADS_STATE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        internalAdsState = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        internalAdsState = [];
    }
}

function saveInternalAdsState() {
    localStorage.setItem(INTERNAL_ADS_STATE_KEY, JSON.stringify(internalAdsState));
}

function ensureInternalDemoSeed() {
    if (internalAdsState.length > 0) return;
    if (!getDemoMode()) return;
    const now = Date.now();
    internalAdsState = [
        { id: 'ia_demo_1', title: 'Tuesday Hero Promo', note: 'Main internal spotlight', region: 'west', status: 'pending', priority: now - 10000, createdAt: new Date(now - 3600000).toISOString(), updatedAt: new Date(now - 3600000).toISOString() },
        { id: 'ia_demo_2', title: 'Store Ops Alert', note: 'Internal ops message', region: 'central', status: 'pending', priority: now - 8000, createdAt: new Date(now - 3000000).toISOString(), updatedAt: new Date(now - 3000000).toISOString() },
        { id: 'ia_demo_3', title: 'Weekend Bundle Banner', note: 'Queued for next slot', region: 'east', status: 'queued', priority: now - 6000, createdAt: new Date(now - 2400000).toISOString(), updatedAt: new Date(now - 2400000).toISOString() },
        { id: 'ia_demo_4', title: 'Employee Offer Banner', note: 'Queued high priority', region: 'west', status: 'queued', priority: now - 4000, createdAt: new Date(now - 1800000).toISOString(), updatedAt: new Date(now - 1800000).toISOString() },
        { id: 'ia_demo_5', title: 'Live Flash Creative', note: 'Currently live', region: 'central', status: 'live', priority: now - 2000, createdAt: new Date(now - 1200000).toISOString(), updatedAt: new Date(now - 600000).toISOString() }
    ];
    saveInternalAdsState();
}

function loadInternalAutoSettings() {
    try {
        const raw = localStorage.getItem(INTERNAL_AUTO_SETTINGS_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
            internalAutoMode = parsed.enabled !== false;
            const sec = Number(parsed.intervalSec || 20);
            internalAutoIntervalSec = Math.max(5, Math.min(300, Number.isFinite(sec) ? sec : 20));
        }
    } catch (_) {
        internalAutoMode = true;
        internalAutoIntervalSec = 20;
    }
}

function saveInternalAutoSettings() {
    localStorage.setItem(INTERNAL_AUTO_SETTINGS_KEY, JSON.stringify({
        enabled: internalAutoMode,
        intervalSec: internalAutoIntervalSec
    }));
}

function bindInternalAutoControls() {
    const modeEl = document.getElementById('internalAutoMode');
    const intervalEl = document.getElementById('internalAutoIntervalSec');
    if (modeEl) modeEl.checked = internalAutoMode;
    if (intervalEl) intervalEl.value = String(internalAutoIntervalSec);
}

function startInternalAutoTimer() {
    if (internalAutoTimer) clearInterval(internalAutoTimer);
    internalAutoTimer = setInterval(() => {
        if (!internalAutoMode) return;
        const queued = internalAdsState
            .filter((x) => x.status === 'queued')
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));
        if (!queued.length) return;
        window.launchInternalAdNow(queued[0].id);
    }, internalAutoIntervalSec * 1000);
}

function statusPill(status) {
    const safe = String(status || 'pending');
    return `<span class="status-badge status-${safe}">${safe.toUpperCase()}</span>`;
}

function renderInternalAdsWorkflow() {
    const pendingBox = document.getElementById('internalPendingList');
    const queueBox = document.getElementById('internalQueueList');
    const liveBox = document.getElementById('internalLiveList');
    if (!pendingBox || !queueBox || !liveBox) return;

    const pending = internalAdsState.filter((x) => x.status === 'pending');
    const queued = internalAdsState.filter((x) => x.status === 'queued').sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const live = internalAdsState.filter((x) => x.status === 'live');

    pendingBox.innerHTML = pending.length ? pending.map((ad) => `
        <div class="viz-card">
            <div class="viz-card-title">${ad.title}</div>
            <div class="viz-card-sub">${ad.region.toUpperCase()} • ${new Date(ad.createdAt).toLocaleString()}</div>
            <div class="viz-metric-row"><span>Review</span><span>${statusPill(ad.status)}</span></div>
            <div style="display:flex; gap:8px; margin-top: 8px;">
                <button class="btn-small btn-approve" onclick="approveInternalAd('${ad.id}')">Approve</button>
                <button class="btn-small btn-reject" onclick="rejectInternalAd('${ad.id}')">Reject</button>
            </div>
        </div>
    `).join('') : '<div class="viz-empty">No pending items</div>';

    queueBox.innerHTML = queued.length ? queued.map((ad, idx) => `
        <div class="viz-card">
            <div class="viz-card-title">#${idx + 1} ${ad.title}</div>
            <div class="viz-card-sub">${ad.region.toUpperCase()} • queued</div>
            <div class="viz-chip-row">
                <span class="viz-chip">Auto-queued on approval</span>
                <span class="viz-chip">Priority ${ad.priority || 0}</span>
            </div>
            <div style="display:flex; gap:8px; margin-top: 8px;">
                <button class="btn-small btn-edit" onclick="launchInternalAdNow('${ad.id}')">Launch Now</button>
                <button class="btn-small btn-reject" onclick="removeInternalAd('${ad.id}')">Remove</button>
            </div>
        </div>
    `).join('') : '<div class="viz-empty">Queue is empty</div>';

    liveBox.innerHTML = live.length ? live.map((ad) => `
        <div class="viz-card">
            <div class="viz-card-title">${ad.title}</div>
            <div class="viz-card-sub">${ad.region.toUpperCase()} • live now</div>
            <div class="viz-chip-row">
                <span class="viz-chip">Started ${new Date(ad.updatedAt).toLocaleTimeString()}</span>
            </div>
            <div style="display:flex; gap:8px; margin-top: 8px;">
                <button class="btn-small btn-reject" onclick="removeInternalAd('${ad.id}')">Remove Live</button>
            </div>
        </div>
    `).join('') : '<div class="viz-empty">Nothing live</div>';

    const pendingCountEl = document.getElementById('internalPendingCount');
    const queuedCountEl = document.getElementById('internalQueuedCount');
    const liveCountEl = document.getElementById('internalLiveCount');
    if (pendingCountEl) pendingCountEl.textContent = String(pending.length);
    if (queuedCountEl) queuedCountEl.textContent = String(queued.length);
    if (liveCountEl) liveCountEl.textContent = String(live.length);

    const autoState = internalAutoMode ? `AUTO ON (${internalAutoIntervalSec}s)` : 'AUTO OFF';
    setInternalWorkflowHint(`Queue status: ${queued.length} queued, ${live.length} live • ${autoState}`);
}

// Initialize admin dashboard
window.addEventListener('DOMContentLoaded', function() {
    if (checkAdminSession()) {
        loadInternalAdsState();
        ensureInternalDemoSeed();
        loadInternalAutoSettings();
        renderInternalAdsWorkflow();
        bindInternalAutoControls();
        startInternalAutoTimer();
        initRegionSelection();

        // Wire demo toggle
        const toggle = document.getElementById('adminDemoMode');
        if (toggle) {
            toggle.checked = getDemoMode();
            toggle.addEventListener('change', async () => {
                setDemoMode(toggle.checked);
                // Immediate visual feedback
                showDemoLoading(true);
                setDemoBadge(toggle.checked);
                
                // Clear current data immediately
                const tbody = document.getElementById('biddingsTableBody');
                if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px;"><div class="demo-spinner" style="width:40px;height:40px;margin:0 auto 15px;"></div>Loading data...</td></tr>';
                const dtbody = document.getElementById('deploymentsTableBody');
                if (dtbody) dtbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px;"><div class="demo-spinner" style="width:40px;height:40px;margin:0 auto 15px;"></div>Loading data...</td></tr>';

                // Reload everything (swap between real/demo)
                try {
                    await loadAllBiddings();
                    await loadAllDeployments();
                    if (toggle.checked) {
                        loadInternalAdsState();
                        ensureInternalDemoSeed();
                        renderInternalAdsWorkflow();
                    }
                    refreshDashboardViews();
                } finally {
                    window.dispatchEvent(new CustomEvent('admin-demo-mode-changed', { detail: { enabled: toggle.checked } }));
                    showDemoLoading(false);
                }
            });
        }
        loadAllBiddings();
        loadAllDeployments();
        window.dispatchEvent(new CustomEvent('admin-demo-mode-changed', { detail: { enabled: getDemoMode() } }));
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('admin-demo-mode-changed', { detail: { enabled: getDemoMode() } }));
        }, 700);
        // Ensure first tab works even before user clicks.
        window.switchTab('all-biddings');
        window.switchInternalTab('tmobile-tuesday');
    }
});

function setHint(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '';
}

function getLastNDates(n) {
    const out = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        out.push(formatDateInput(d));
    }
    return out;
}

function safeChart() {
    return typeof window.Chart !== 'undefined';
}

function destroyIf(chart) {
    try { chart?.destroy?.(); } catch (_) {}
}

function computeZipcodeList(bid) {
    return getBidZipcodes(bid);
}

function renderAnalyticsCharts() {
    // Only run if chart canvases exist (Analytics tab)
    const cRev = document.getElementById('chartRevenue7d');
    const cMix = document.getElementById('chartStatusMix');
    const cZip = document.getElementById('chartTopZipcodes');
    if (!cRev || !cMix || !cZip) {
        console.log('Analytics charts skipped (canvas not in DOM yet)');
        return;
    }
    if (!safeChart()) {
        setHint('chartRevenue7dHint', 'Chart.js failed to load. Try hard refresh.');
        return;
    }

    const scopedBiddings = getFilteredBiddings();
    const hasData = Array.isArray(scopedBiddings) && scopedBiddings.length > 0;
    const labels7 = getLastNDates(7);

    // Revenue by day (use createdAt if present; else fake)
    const revenueMap = new Map(labels7.map(d => [d, 0]));
    if (hasData) {
        for (const b of scopedBiddings) {
            const createdAt = b.createdAt ? new Date(b.createdAt) : null;
            if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
            const key = formatDateInput(createdAt);
            if (revenueMap.has(key)) revenueMap.set(key, revenueMap.get(key) + Number(b.bidAmount || 0));
        }
        // If all dates are zero (demo data createdAt outside 7-day window), spread bidAmount across 7 days
        const totalRev = Array.from(revenueMap.values()).reduce((a, b) => a + b, 0);
        if (totalRev === 0 && scopedBiddings.length > 0) {
            console.log('No revenue in last 7 days, spreading data evenly');
            const avgPerDay = Math.round(scopedBiddings.reduce((s, b) => s + (b.bidAmount || 0), 0) / labels7.length);
            labels7.forEach((d, i) => revenueMap.set(d, avgPerDay + Math.round(Math.sin(i) * avgPerDay * 0.3)));
        }
    } else {
        // Fake: gentle wave
        labels7.forEach((d, i) => revenueMap.set(d, Math.round(80 + 40 * Math.sin(i / 2) + 20 * (i % 3))));
    }
    const revenueData = labels7.map(d => Number((revenueMap.get(d) || 0).toFixed(0)));
    console.log('Revenue chart data:', revenueData);
    setHint('chartRevenue7dHint', hasData ? (isUsingDemoData ? 'Demo mode: synthetic distribution' : 'Source: bids.createdAt + bidAmount') : 'Demo mode: fake data');

    // Status mix
    const statuses = ['pending', 'active', 'completed', 'rejected'];
    const statusCounts = { pending: 0, active: 0, completed: 0, rejected: 0 };
    if (hasData) {
        for (const b of scopedBiddings) {
            const s = (b.status || 'pending');
            if (statusCounts[s] !== undefined) statusCounts[s] += 1;
        }
        // Ensure at least some data if we have biddings
        const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
        if (total === 0 && scopedBiddings.length > 0) {
            statusCounts.active = Math.floor(scopedBiddings.length * 0.6);
            statusCounts.pending = Math.floor(scopedBiddings.length * 0.25);
            statusCounts.completed = Math.floor(scopedBiddings.length * 0.1);
            statusCounts.rejected = scopedBiddings.length - statusCounts.active - statusCounts.pending - statusCounts.completed;
        }
    } else {
        statusCounts.pending = 6;
        statusCounts.active = 9;
        statusCounts.completed = 3;
        statusCounts.rejected = 1;
    }
    const mixData = statuses.map(s => statusCounts[s]);
    console.log('Status mix data:', statusCounts);
    setHint('chartStatusMixHint', hasData ? (isUsingDemoData ? 'Demo mode: from dataset' : 'Source: bids.status') : 'Demo mode: fake data');

    // Top zipcodes by # campaigns
    const zipCount = new Map();
    if (hasData) {
        for (const b of scopedBiddings) {
            const zips = computeZipcodeList(b);
            for (const z of zips) zipCount.set(z, (zipCount.get(z) || 0) + 1);
        }
        // Fallback if no zipcodes found
        if (zipCount.size === 0 && scopedBiddings.length > 0) {
            console.log('No zipcodes found, using demo fallback');
            ['98101','10001','90001','60601','77001','78701'].forEach((z, i) => zipCount.set(z, 10 - i));
        }
    } else {
        ['98101','10001','90001','60601','77001','78701'].forEach((z, i) => zipCount.set(z, 10 - i));
    }
    const zipArr = Array.from(zipCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const zipLabels = zipArr.map(([z]) => z);
    const zipData = zipArr.map(([, c]) => c);
    console.log('Zipcode chart data:', zipLabels, zipData);
    setHint('chartTopZipcodesHint', hasData ? (isUsingDemoData ? 'Demo mode: from dataset' : 'Source: bids.zipcodes / bids.zipcode') : 'Demo mode: fake data');

    // Render charts
    destroyIf(chartRevenue7d);
    destroyIf(chartStatusMix);
    destroyIf(chartTopZipcodes);

    const ctx7 = cRev.getContext('2d');
    const gradient7 = ctx7.createLinearGradient(0, 0, 0, 400);
    gradient7.addColorStop(0, 'rgba(226, 0, 116, 0.4)');
    gradient7.addColorStop(1, 'rgba(226, 0, 116, 0.0)');
    
    chartRevenue7d = new window.Chart(ctx7, {
        type: 'line',
        data: {
            labels: labels7,
            datasets: [{
                label: 'Revenue (USD)',
                data: revenueData,
                borderColor: '#E20074',
                backgroundColor: gradient7,
                fill: true,
                tension: 0.4,
                borderWidth: 3,
                pointBackgroundColor: '#E20074',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#E20074',
                    bodyColor: '#fff',
                    borderColor: '#E20074',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false
                }
            },
            scales: {
                x: { 
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(255,255,255,0.6)' }
                },
                y: { 
                    grid: { color: 'rgba(255,255,255,0.05)' }, 
                    ticks: { 
                        color: 'rgba(255,255,255,0.6)',
                        callback: (v) => `$${v}` 
                    } 
                }
            }
        }
    });

    chartStatusMix = new window.Chart(cMix.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Active', 'Completed', 'Rejected'],
            datasets: [{
                data: mixData,
                backgroundColor: [
                    '#FF8C00',
                    '#00D659',
                    '#666666',
                    '#FF4444'
                ],
                borderColor: 'rgba(0,0,0,0.8)',
                borderWidth: 3,
                hoverOffset: 10
            }]
        },
        options: { 
            responsive: true, 
            plugins: { 
                legend: { 
                    position: 'bottom',
                    labels: {
                        color: 'rgba(255,255,255,0.8)',
                        padding: 15,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#E20074',
                    bodyColor: '#fff',
                    borderColor: '#E20074',
                    borderWidth: 1,
                    padding: 12
                }
            },
            cutout: '65%'
        }
    });

    const ctxZip = cZip.getContext('2d');
    const gradientZip = ctxZip.createLinearGradient(0, 0, 0, 400);
    gradientZip.addColorStop(0, 'rgba(0, 214, 89, 0.8)');
    gradientZip.addColorStop(1, 'rgba(0, 214, 89, 0.2)');
    
    chartTopZipcodes = new window.Chart(ctxZip, {
        type: 'bar',
        data: {
            labels: zipLabels,
            datasets: [{
                label: '# Campaigns',
                data: zipData,
                backgroundColor: gradientZip,
                borderColor: '#00D659',
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#00D659',
                    bodyColor: '#fff',
                    borderColor: '#00D659',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false
                }
            },
            scales: {
                x: { 
                    grid: { display: false },
                    ticks: { color: 'rgba(255,255,255,0.6)' }
                },
                y: { 
                    grid: { color: 'rgba(255,255,255,0.05)' }, 
                    ticks: { 
                        color: 'rgba(255,255,255,0.6)',
                        precision: 0 
                    } 
                }
            }
        }
    });
}

// Load all biddings from all users
async function loadAllBiddings() {
    try {
        const q = query(
            collection(db, 'bids'),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);
        allBiddings = [];

        snapshot.forEach(docSnap => {
            allBiddings.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        // Demo fallback (or forced demo)
        if (getDemoMode() || allBiddings.length === 0) {
            if (allBiddings.length === 0) setDemoMode(true); // auto-enable if empty
            allBiddings = await getDemoBiddingsFromCsv(240);
            isUsingDemoData = true;
        } else {
            isUsingDemoData = false;
        }
        setDemoBadge(isUsingDemoData);
        const toggle = document.getElementById('adminDemoMode');
        if (toggle && isUsingDemoData) toggle.checked = true;

        console.log('Loaded', allBiddings.length, 'biddings');
        updateStatistics();
        displayBiddings();
        renderAnalyticsCharts();

    } catch (error) {
        console.error('Error loading biddings:', error);
        // Safe demo fallback
        setDemoMode(true);
        isUsingDemoData = true;
        setDemoBadge(true);
        try {
            allBiddings = await getDemoBiddingsFromCsv(240);
        } catch (e) {
            // last-resort fallback
            allBiddings = [{
                id: 'demo_fallback_1',
                userId: 'M001',
                userEmail: getMerchantName('M001'),
                userContact: getMerchantEmail('M001'),
                zipcodes: ['98101'],
                startDate: '2025-07-15',
                endDate: '2025-07-15',
                bidAmount: 41,
                estimatedReach: 12000,
                status: 'active',
                timeSlots: demoTimeSlots(),
                createdAt: new Date().toISOString(),
                timestamp: Date.now()
            }];
        }
        updateStatistics();
        displayBiddings();
        renderAnalyticsCharts();
    }
}

// Update statistics
function updateStatistics() {
    const scopedBiddings = getFilteredBiddings();
    const scopedDeployments = getFilteredDeployments();
    const activeBids = scopedBiddings.filter((b) => b.status === 'active');
    const activeOrPendingDeployments = scopedDeployments.filter((d) => d.status === 'active' || d.status === 'pending');

    const deviceCount = activeOrPendingDeployments.reduce((sum, d) => sum + Number(d.activeDevices || 0), 0);
    const liveImpressions = Math.round(activeBids.reduce((sum, b) => sum + Number(b.estimatedReach || 0), 0) / 24);
    const liveAds = activeBids.length;

    const deviceEl = document.getElementById('rtDeviceCount');
    if (deviceEl) deviceEl.textContent = formatNumber(deviceCount);
    const impEl = document.getElementById('rtImpressions');
    if (impEl) impEl.textContent = formatNumber(liveImpressions);
    const liveAdsEl = document.getElementById('rtLiveAds');
    if (liveAdsEl) liveAdsEl.textContent = formatNumber(liveAds);

    const hintEl = document.getElementById('rtLiveAdsHint');
    if (hintEl) {
        const preview = activeBids.slice(0, 3).map((b) => `#${String(b.id).slice(-6)}`).join(', ');
        hintEl.textContent = preview || 'No active ads in this region';
    }

    renderPerformanceHeatmap(scopedBiddings);
    renderCampaignTimeline(scopedBiddings);
    renderCampaignFunnel(scopedBiddings);
}

function renderMetricBar(value, max, label) {
    const safeMax = Math.max(1, Number(max) || 1);
    const safeVal = Math.max(0, Number(value) || 0);
    const pct = Math.min(100, Math.round((safeVal / safeMax) * 100));
    return `
        <div class="metric-line">
            <div class="metric-line-head">
                <span>${label}</span>
                <span>${safeVal.toLocaleString()}</span>
            </div>
            <div class="metric-track">
                <div class="metric-fill" style="width:${pct}%"></div>
            </div>
        </div>
    `;
}

function stripChineseForCampaignView(text) {
    return String(text || '')
        .replace(/[\u3400-\u9FFF]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function mutateCampaignStatusLocal(bidId, newStatus) {
    const idx = allBiddings.findIndex((b) => b.id === bidId);
    if (idx < 0) return false;
    allBiddings[idx].status = newStatus;
    allBiddings[idx].updatedAt = new Date().toISOString();
    return true;
}

async function setCampaignStatusSmart(bidId, newStatus, actionName) {
    const ask = confirm(`Confirm ${actionName} for this campaign?`);
    if (!ask) return;

    if (isUsingDemoData) {
        if (mutateCampaignStatusLocal(bidId, newStatus)) {
            refreshDashboardViews();
        }
        return;
    }

    await updateDoc(doc(db, 'bids', bidId), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: adminSession ? adminSession.username : 'admin'
    });
    await loadAllBiddings();
}

// Display biddings in table
function displayBiddings(filteredBiddings = null) {
    const biddings = filteredBiddings || getFilteredBiddings();
    const tbody = document.getElementById('biddingsTableBody');
    if (!tbody) return;
    const maxBid = Math.max(1, ...biddings.map((b) => Number(b.bidAmount) || 0));
    const maxReach = Math.max(1, ...biddings.map((b) => Number(b.estimatedReach) || 0));

    if (biddings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No campaigns found</td></tr>';
        return;
    }

    tbody.innerHTML = biddings.map(bid => {
        const zipcodes = bid.zipcodes && bid.zipcodes.length > 0
            ? bid.zipcodes.join(', ')
            : bid.zipcode || 'N/A';
        const geoPreview = zipToGeo((bid.zipcodes && bid.zipcodes[0]) || bid.zipcode || '');
        const merchantDisplay = stripChineseForCampaignView(bid.userEmail || 'Unknown') || 'Unknown';
        const merchantSub = stripChineseForCampaignView(bid.userContact || `ID: ${bid.userId?.slice(0, 8)}...`) || `ID: ${bid.userId?.slice(0, 8)}...`;

        return `
            <tr>
                <td>
                    <div><strong>#${bid.id.slice(-6)}</strong></div>
                    <div class="user-email">${bid.startDate} to ${bid.endDate}</div>
                </td>
                <td>
                    <div class="user-cell">
                        <div>${merchantDisplay}</div>
                        <div class="user-email">${merchantSub}</div>
                    </div>
                </td>
                <td>
                    <div class="market-chips">${zipcodes}</div>
                    <div class="user-email">${geoPreview.region.toUpperCase()} • ${geoPreview.state} • ${geoPreview.area}</div>
                </td>
                <td>
                    ${renderMetricBar(Number(bid.bidAmount || 0), maxBid, 'Bid')}
                    ${renderMetricBar(Number(bid.estimatedReach || 0), maxReach, 'Reach')}
                </td>
                <td><span class="status-badge status-${bid.status || 'pending'}">${(bid.status || 'pending').toUpperCase()}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-small btn-edit" onclick="editBidding('${bid.id}')">Edit</button>
                        ${bid.status !== 'active' ? `<button class="btn-small btn-approve" onclick="manualLaunchCampaign('${bid.id}')">Launch</button>` : ''}
                        ${(bid.status === 'active' || bid.status === 'pending') ? `<button class="btn-small btn-reject" onclick="manualWithdrawCampaign('${bid.id}')">Withdraw</button>` : ''}
                        ${bid.status === 'pending' ? `<button class="btn-small btn-approve" onclick="updateStatus('${bid.id}', 'active')">Approve</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Display schedule timeline
function displaySchedule() {
    const timeline = document.getElementById('scheduleTimeline');
    if (!timeline) return;
    const scopedBiddings = getFilteredBiddings();

    // Group biddings by start date
    const scheduleMap = {};
    scopedBiddings
        .filter(b => b.status === 'active' || b.status === 'pending')
        .forEach(bid => {
            const date = bid.startDate;
            if (!scheduleMap[date]) {
                scheduleMap[date] = [];
            }
            scheduleMap[date].push(bid);
        });

    // Sort dates
    const sortedDates = Object.keys(scheduleMap).sort();

    if (sortedDates.length === 0) {
        timeline.innerHTML = '<p style="color: var(--tmobile-light-gray); padding: 40px; text-align: center;">No upcoming deployments</p>';
        return;
    }

    timeline.innerHTML = sortedDates.map(date => {
        const bids = scheduleMap[date];
        return `
            <div class="timeline-item">
                <div class="timeline-date">${date}</div>
                <div class="timeline-content">
                    <h4>${bids.length} Campaign${bids.length > 1 ? 's' : ''} Starting</h4>
                    ${bids.map(bid => `
                        <div style="margin: 10px 0; padding: 10px; background: var(--tmobile-black); border-radius: 8px;">
                            <strong>Campaign #${bid.id.slice(-6)}</strong> - ${bid.userEmail}<br>
                            <span style="font-size: 0.9em; color: var(--tmobile-light-gray);">
                                ${bid.zipcodes?.join(', ') || bid.zipcode} • $${bid.bidAmount} • ${bid.timeSlots?.length || 0} time slots
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// Filter biddings
window.filterBiddings = function() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchText = document.getElementById('searchUser').value.toLowerCase();
    const dateFilter = document.getElementById('dateFilter').value;

    let filtered = getFilteredBiddings();

    if (statusFilter) {
        filtered = filtered.filter(b => b.status === statusFilter);
    }

    if (searchText) {
        filtered = filtered.filter(b =>
            b.userEmail?.toLowerCase().includes(searchText) ||
            b.userId?.toLowerCase().includes(searchText)
        );
    }

    if (dateFilter) {
        filtered = filtered.filter(b =>
            b.startDate === dateFilter || b.endDate === dateFilter
        );
    }

    displayBiddings(filtered);
};

// Switch tabs
window.switchTab = function(tabName, tabElement) {
    // Update tab buttons
    document.querySelectorAll('.dash-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    if (tabElement) {
        tabElement.classList.add('active');
    } else {
        const matched = Array.from(document.querySelectorAll('.dash-tab')).find(t => t.getAttribute('onclick')?.includes(`'${tabName}'`));
        if (matched) matched.classList.add('active');
    }

    // Update tab content
    document.querySelectorAll('.dash-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    const target = document.getElementById(tabName);
    if (target) target.classList.add('active');
    
    // If switching to Analytics, render charts (they might not have been rendered yet)
    if (tabName === 'analytics') {
        setTimeout(() => renderAnalyticsCharts(), 100);
    }
};

window.switchInternalTab = function(tabName, tabElement) {
    document.querySelectorAll('.internal-tab').forEach(tab => tab.classList.remove('active'));
    if (tabElement) {
        tabElement.classList.add('active');
    } else {
        const matched = Array.from(document.querySelectorAll('.internal-tab')).find((t) => t.getAttribute('onclick')?.includes(`'${tabName}'`));
        if (matched) matched.classList.add('active');
    }
    document.querySelectorAll('.internal-tab-content').forEach(content => content.classList.remove('active'));
    const target = document.getElementById(tabName);
    if (target) target.classList.add('active');
};

window.switchSection = function(sectionName, tabElement) {
    currentSection = sectionName === 'internal-content' ? 'internal-content' : 'dashboard';
    document.querySelectorAll('.section-tab').forEach((tab) => tab.classList.remove('active'));
    if (tabElement) {
        tabElement.classList.add('active');
    } else {
        const matched = Array.from(document.querySelectorAll('.section-tab')).find((t) => t.getAttribute('onclick')?.includes(`'${currentSection}'`));
        if (matched) matched.classList.add('active');
    }
    const dashboard = document.getElementById('dashboard-section');
    const internal = document.getElementById('internal-content-section');
    if (dashboard) dashboard.classList.toggle('active', currentSection === 'dashboard');
    if (internal) internal.classList.toggle('active', currentSection === 'internal-content');
};

window.submitInternalAd = function() {
    const title = (document.getElementById('internalAdTitle')?.value || '').trim();
    const region = normalizeRegion(document.getElementById('internalAdRegion')?.value || 'all') || 'all';
    const note = (document.getElementById('internalAdNote')?.value || '').trim();
    if (!title) {
        alert('Please input internal ad title.');
        return;
    }
    const now = new Date().toISOString();
    internalAdsState.unshift({
        id: `ia_${Date.now()}`,
        title,
        note,
        region,
        status: 'pending',
        priority: Date.now(),
        createdAt: now,
        updatedAt: now
    });
    saveInternalAdsState();
    renderInternalAdsWorkflow();
    setInternalWorkflowHint('Submitted for review. Status: pending.');
    const titleEl = document.getElementById('internalAdTitle');
    const noteEl = document.getElementById('internalAdNote');
    if (titleEl) titleEl.value = '';
    if (noteEl) noteEl.value = '';
};

window.approveInternalAd = function(id) {
    const idx = internalAdsState.findIndex((x) => x.id === id);
    if (idx < 0) return;
    internalAdsState[idx].status = 'queued';
    internalAdsState[idx].updatedAt = new Date().toISOString();
    internalAdsState[idx].priority = Date.now();
    saveInternalAdsState();
    renderInternalAdsWorkflow();
    setInternalWorkflowHint('Approved. Item moved to launch queue front.');
};

window.rejectInternalAd = function(id) {
    const idx = internalAdsState.findIndex((x) => x.id === id);
    if (idx < 0) return;
    internalAdsState[idx].status = 'rejected';
    internalAdsState[idx].updatedAt = new Date().toISOString();
    saveInternalAdsState();
    renderInternalAdsWorkflow();
    setInternalWorkflowHint('Item rejected.');
};

window.launchInternalAdNow = function(id) {
    const idx = internalAdsState.findIndex((x) => x.id === id);
    if (idx < 0) return;
    internalAdsState.forEach((x) => {
        if (x.status === 'live') x.status = 'queued';
    });
    internalAdsState[idx].status = 'live';
    internalAdsState[idx].updatedAt = new Date().toISOString();
    saveInternalAdsState();
    renderInternalAdsWorkflow();
    setInternalWorkflowHint('Launched now. Previous live item returned to queue.');
};

window.playNextInternalAd = function() {
    const queued = internalAdsState
        .filter((x) => x.status === 'queued')
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    if (!queued.length) {
        alert('Queue is empty.');
        return;
    }
    launchInternalAdNow(queued[0].id);
};

window.removeInternalAd = function(id) {
    const idx = internalAdsState.findIndex((x) => x.id === id);
    if (idx < 0) return;
    internalAdsState.splice(idx, 1);
    saveInternalAdsState();
    renderInternalAdsWorkflow();
    setInternalWorkflowHint('Item removed from workflow.');
};

window.applyInternalAutoSettings = function() {
    const modeEl = document.getElementById('internalAutoMode');
    const intervalEl = document.getElementById('internalAutoIntervalSec');
    internalAutoMode = Boolean(modeEl?.checked);
    const sec = Number(intervalEl?.value || 20);
    internalAutoIntervalSec = Math.max(5, Math.min(300, Number.isFinite(sec) ? sec : 20));
    if (intervalEl) intervalEl.value = String(internalAutoIntervalSec);
    saveInternalAutoSettings();
    startInternalAutoTimer();
    renderInternalAdsWorkflow();
};

// Edit bidding
window.editBidding = function(bidId) {
    if (isUsingDemoData) {
        alert('Demo mode: editing is disabled (fake data only). Turn off Demo Mode to edit real campaigns.');
        return;
    }
    const bid = allBiddings.find(b => b.id === bidId);
    if (!bid) return;

    currentEditId = bidId;

    const formContent = `
        <div class="form-group">
            <label>Status</label>
            <select id="editStatus" style="width: 100%; padding: 10px; background: var(--tmobile-black); border: 2px solid var(--tmobile-gray); border-radius: 8px; color: white;">
                <option value="pending" ${bid.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="active" ${bid.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="completed" ${bid.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="rejected" ${bid.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                <option value="withdrawn" ${bid.status === 'withdrawn' ? 'selected' : ''}>Withdrawn</option>
            </select>
        </div>

        <div class="form-group">
            <label>Start Date</label>
            <input type="date" id="editStartDate" value="${bid.startDate}" style="width: 100%; padding: 10px; background: var(--tmobile-black); border: 2px solid var(--tmobile-gray); border-radius: 8px; color: white;">
        </div>

        <div class="form-group">
            <label>End Date</label>
            <input type="date" id="editEndDate" value="${bid.endDate}" style="width: 100%; padding: 10px; background: var(--tmobile-black); border: 2px solid var(--tmobile-gray); border-radius: 8px; color: white;">
        </div>

        <div class="form-group">
            <label>Bid Amount ($)</label>
            <input type="number" id="editBidAmount" value="${bid.bidAmount}" min="0" style="width: 100%; padding: 10px; background: var(--tmobile-black); border: 2px solid var(--tmobile-gray); border-radius: 8px; color: white;">
        </div>

        <div class="form-group">
            <label>Estimated Reach</label>
            <input type="number" id="editReach" value="${bid.estimatedReach || 0}" min="0" style="width: 100%; padding: 10px; background: var(--tmobile-black); border: 2px solid var(--tmobile-gray); border-radius: 8px; color: white;">
        </div>

        <div style="margin-top: 20px; padding: 15px; background: rgba(226, 0, 116, 0.1); border-radius: 8px;">
            <strong>User:</strong> ${bid.userEmail}<br>
            <strong>Campaign ID:</strong> #${bid.id}<br>
            <strong>Locations:</strong> ${bid.zipcodes?.join(', ') || bid.zipcode}<br>
            <strong>Time Slots:</strong> ${bid.timeSlots?.length || 0}
        </div>
    `;

    document.getElementById('editFormContent').innerHTML = formContent;
    document.getElementById('editModal').style.display = 'block';
};

// Save edit
window.saveEdit = async function() {
    if (!currentEditId) return;
    if (isUsingDemoData) {
        alert('Demo mode: saving edits is disabled (fake data only).');
        return;
    }

    const updates = {
        status: document.getElementById('editStatus').value,
        startDate: document.getElementById('editStartDate').value,
        endDate: document.getElementById('editEndDate').value,
        bidAmount: parseInt(document.getElementById('editBidAmount').value),
        estimatedReach: parseInt(document.getElementById('editReach').value),
        updatedAt: new Date().toISOString(),
        updatedBy: adminSession ? adminSession.username : 'admin'
    };

    try {
        await updateDoc(doc(db, 'bids', currentEditId), updates);
        console.log('Bidding updated');
        alert('Campaign updated successfully!');
        closeEditModal();
        loadAllBiddings();
    } catch (error) {
        console.error('Error updating bidding:', error);
        alert('Error updating campaign: ' + error.message);
    }
};

// Admin logout
window.signOutUser = function() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('adminSession');
        console.log('Admin logged out');
        window.location.href = '/admin-login.html';
    }
};

// Close edit modal
window.closeEditModal = function() {
    document.getElementById('editModal').style.display = 'none';
    currentEditId = null;
};

// Update status
window.updateStatus = async function(bidId, newStatus) {
    try {
        const action = newStatus === 'active' ? 'approve' : 'reject';
        await setCampaignStatusSmart(bidId, newStatus, action);
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Error updating status: ' + error.message);
    }
};

window.manualLaunchCampaign = async function(bidId) {
    try {
        await setCampaignStatusSmart(bidId, 'active', 'launch');
    } catch (error) {
        console.error('Error launching campaign:', error);
        alert('Failed to launch: ' + error.message);
    }
};

window.manualWithdrawCampaign = async function(bidId) {
    try {
        await setCampaignStatusSmart(bidId, 'withdrawn', 'withdraw');
    } catch (error) {
        console.error('Error withdrawing campaign:', error);
        alert('Failed to withdraw: ' + error.message);
    }
};

// Load all deployments
async function loadAllDeployments() {
    try {
        const q = query(
            collection(db, 'deployments'),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);
        allDeployments = [];

        snapshot.forEach(docSnap => {
            allDeployments.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        if (getDemoMode() || allDeployments.length === 0) {
            if (allDeployments.length === 0) setDemoMode(true);
            allDeployments = getDemoDeploymentsFromCampaigns(allBiddings);
            isUsingDemoData = true;
        }
        setDemoBadge(isUsingDemoData);
        const toggle = document.getElementById('adminDemoMode');
        if (toggle && isUsingDemoData) toggle.checked = true;

        console.log('Loaded', allDeployments.length, 'deployments');
        displayDeployments();

    } catch (error) {
        console.error('Error loading deployments:', error);
        // Safe demo fallback
        setDemoMode(true);
        isUsingDemoData = true;
        setDemoBadge(true);
        allDeployments = getDemoDeploymentsFromCampaigns(allBiddings);
        displayDeployments();
    }
}

// Display deployments table
function displayDeployments(filteredDeployments = null) {
    const deployments = filteredDeployments || getFilteredDeployments();
    const tbody = document.getElementById('deploymentsTableBody');

    if (!tbody) return;

    if (deployments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No deployments yet</td></tr>';
        return;
    }

    tbody.innerHTML = deployments.map(deploy => {
        const deployedAt = new Date(deploy.deployedAt).toLocaleString();

        return `
            <tr>
                <td><strong>#${deploy.id.slice(-6)}</strong></td>
                <td>
                    <div>${deploy.campaignName || 'N/A'}</div>
                    <div class="user-email">${deploy.userEmail || 'Unknown'}</div>
                </td>
                <td>${deploy.zipcodes?.join(', ') || 'N/A'}</td>
                <td>
                    ${renderMetricBar(Number(deploy.activeDevices || 0), Number(deploy.targetDevices || 0), 'Active')}
                    <div style="font-size: 0.8em; color: var(--tmobile-gray); margin-top: 6px;">${deploy.activeDevices || 0}/${deploy.targetDevices || 0} devices</div>
                </td>
                <td><span class="status-badge status-${deploy.status || 'pending'}">${(deploy.status || 'pending').toUpperCase()}</span></td>
                <td style="font-size: 0.85em;">${deployedAt}</td>
            </tr>
        `;
    }).join('');
}
