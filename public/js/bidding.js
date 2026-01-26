// Bidding System Logic
console.log('🚀 Bidding.js module loading...');

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Import auth.js for shared auth functionality
import './auth.js';

console.log('✅ Bidding.js imports successful');

// Global state
let currentUser = null;
let currentStep = 1;
let biddingData = {
    zipcode: '',
    zipcodes: [],
    startDate: '',
    endDate: '',
    timeSlots: [],
    advancedAudience: false,
    selectedPoster: null,
    bidAmount: 0,
    bidType: ''
};
let userAds = [];

// Map state
let map = null;
let selectedMarkers = [];
let selectedCircles = [];

// ---------- Smart bidding (historical CSV driven) ----------
// Put the CSV under: TADTBD/public/data/ads_input_1000_local_usd_week.csv
const HISTORICAL_CSV_URL = '/data/ads_input_1000_local_usd_week.csv';

// Slot ID mapping to match the dataset (ads_input_1000_local_usd_week.csv)
// The CSV uses Slot IDs 1~8 for the 8 visible time slots on this page:
// 06-08 => 1, 08-10 => 2, ... , 20-22 => 8
const SLOT_ID_BY_LABEL = {
    '06:00-08:00': 1,
    '08:00-10:00': 2,
    '10:00-12:00': 3,
    '12:00-14:00': 4,
    '14:00-16:00': 5,
    '16:00-18:00': 6,
    '18:00-20:00': 7,
    '20:00-22:00': 8
};

let _historyRowsCache = null;
let _historyLoadPromise = null;

function $(id) {
    return document.getElementById(id);
}

function formatUSD(amount) {
    if (typeof amount !== 'number' || Number.isNaN(amount)) return '-';
    return '$' + Math.round(amount).toLocaleString();
}

function safeNumber(x, fallback = null) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
}

function parseAdId(adId) {
    // Match "...z<zip>d<date>..." where date is usually like 07122025
    try {
        const zIdx = adId.indexOf('z');
        const dIdx = adId.indexOf('d');
        if (zIdx === -1 || dIdx === -1) return { zip: null, date: null };
        return {
            zip: adId.slice(zIdx + 1, dIdx),
            date: adId.slice(dIdx + 1)
        };
    } catch {
        return { zip: null, date: null };
    }
}

function parseCsvLine(line) {
    // Minimal CSV parser with quotes support
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out;
}

function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];
    const header = parseCsvLine(lines[0]).map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const row = {};
        for (let c = 0; c < header.length; c++) {
            row[header[c]] = (cols[c] ?? '').trim();
        }
        rows.push(row);
    }
    return rows;
}

async function loadHistoryRows() {
    if (_historyRowsCache) return _historyRowsCache;
    if (_historyLoadPromise) return _historyLoadPromise;

    _historyLoadPromise = (async () => {
        const res = await fetch(HISTORICAL_CSV_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Failed to load CSV (${res.status}) from ${HISTORICAL_CSV_URL}`);
        const text = await res.text();
        const rows = parseCsv(text);
        // Add parsed_zip / parsed_date (like the python init step)
        for (const r of rows) {
            const { zip, date } = parseAdId(r.ad_id || '');
            r.parsed_zip = zip;
            r.parsed_date = date;
        }
        _historyRowsCache = rows;
        return rows;
    })();

    return _historyLoadPromise;
}

function enumerateDatesMMDDYYYY(startISO, endISO) {
    // startISO/endISO: "YYYY-MM-DD"
    const [sy, sm, sd] = startISO.split('-').map(Number);
    const [ey, em, ed] = endISO.split('-').map(Number);
    const start = new Date(Date.UTC(sy, sm - 1, sd));
    const end = new Date(Date.UTC(ey, em - 1, ed));
    const out = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const yyyy = String(d.getUTCFullYear());
        out.push(`${mm}${dd}${yyyy}`);
    }
    return out;
}

function median(values) {
    if (!values.length) return 10.0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeRecommendedBudgetFromHistory(rows, zipCodes, dates, slotIds) {
    const nUnits = zipCodes.length * dates.length * slotIds.length;
    if (!nUnits) {
        return { totalBudget: 0, nUnits: 0, medianUnit: 10.0 };
    }

    const referencePrices = [];

    for (const date of dates) {
        for (const zipCode of zipCodes) {
            const competitors = rows.filter(r => String(r.parsed_zip) === String(zipCode) && String(r.parsed_date) === String(date));

            for (const slot of slotIds) {
                const slotBids = [];
                for (const row of competitors) {
                    for (let i = 1; i <= 5; i++) {
                        const pCol = `preferred_slot_${i}`;
                        const bCol = `bid_usd_${i}`;
                        const pref = safeNumber(row[pCol], null);
                        if (pref !== null && pref === slot) {
                            const bid = safeNumber(row[bCol], null);
                            if (bid !== null) slotBids.push(bid);
                        }
                    }
                }

                slotBids.sort((a, b) => b - a);
                let refPrice = 10;
                if (slotBids.length >= 3) refPrice = slotBids[2];
                else if (slotBids.length > 0) refPrice = slotBids[slotBids.length - 1];
                referencePrices.push(refPrice);
            }
        }
    }

    const medianUnit = median(referencePrices);
    const totalBudget = medianUnit * nUnits;
    return { totalBudget, nUnits, medianUnit };
}

function setRecStatus(text, isError = false) {
    const el = $('recStatus');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ff6b6b' : 'var(--tmobile-light-gray)';
}

function renderPriceCards({ recTotal, nUnits, medianUnit }) {
    const container = $('priceOptions');
    if (!container) return;

    const mk = (label, total, type, desc) => `
        <div class="price-card" onclick="selectPrice(${Math.round(total)}, '${type}')">
            <div class="price-label">${label}</div>
            <div class="price-amount">${formatUSD(total)}</div>
            <div class="price-description">${desc}</div>
        </div>
    `;

    const conservative = recTotal * 0.85;
    const competitive = recTotal;
    const aggressive = recTotal * 1.2;

    container.innerHTML = [
        mk('Conservative', conservative, 'conservative', 'Lower budget, lower win probability'),
        mk('Competitive', competitive, 'competitive', 'Recommended by historical median threshold'),
        mk('Aggressive', aggressive, 'aggressive', 'Higher budget, higher win probability')
    ].join('');

    // Fill detail box
    const details = $('recDetails');
    if (details) details.style.display = 'block';
    if ($('recUnits')) $('recUnits').textContent = nUnits.toLocaleString();
    if ($('recMedianUnit')) $('recMedianUnit').textContent = formatUSD(medianUnit);
    if ($('recTotal')) $('recTotal').textContent = formatUSD(recTotal);
    if ($('recB1')) $('recB1').textContent = nUnits ? formatUSD(recTotal / nUnits) : '-';

    setRecStatus('Ready. Pick a strategy or enter a custom total budget.');
}

async function updateRecommendedPrices() {
    // Must be called after Step 4 DOM exists (it always exists in the page)
    try {
        setRecStatus('Calculating recommended prices from historical bids...');
        const rows = await loadHistoryRows();

        const zipCodes = (biddingData.zipcodes || []).map(String);
        const dates = enumerateDatesMMDDYYYY(biddingData.startDate, biddingData.endDate);
        const slotIds = (biddingData.timeSlots || [])
            .map(label => SLOT_ID_BY_LABEL[label])
            .filter(Boolean);

        const { totalBudget, nUnits, medianUnit } = computeRecommendedBudgetFromHistory(rows, zipCodes, dates, slotIds);

        // If CSV has no matching history, still give a sane minimum baseline
        const safeTotal = totalBudget && totalBudget > 0 ? totalBudget : (10 * (nUnits || 1));
        renderPriceCards({ recTotal: safeTotal, nUnits: nUnits || 0, medianUnit });

    } catch (e) {
        console.error('❌ Smart recommendation failed:', e);
        setRecStatus(`Smart recommendation unavailable (${e.message}). Using fallback prices.`, true);

        // Fallback: keep the UI usable
        const container = $('priceOptions');
        if (container) {
            container.innerHTML = `
                <div class="price-card" onclick="selectPrice(50, 'conservative')">
                    <div class="price-label">Conservative</div>
                    <div class="price-amount">$50</div>
                    <div class="price-description">Safe bid, moderate competition</div>
                </div>
                <div class="price-card" onclick="selectPrice(100, 'competitive')">
                    <div class="price-label">Competitive</div>
                    <div class="price-amount">$100</div>
                    <div class="price-description">Recommended for best results</div>
                </div>
                <div class="price-card" onclick="selectPrice(200, 'aggressive')">
                    <div class="price-label">Aggressive</div>
                    <div class="price-amount">$200</div>
                    <div class="price-description">Maximum visibility</div>
                </div>
            `;
        }
    }
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function simulateBiddingOutcomeFromHistory(rows, zipCodes, dates, slotIds, totalBudget) {
    const totalUnits = zipCodes.length * dates.length * slotIds.length;
    if (!totalUnits) {
        return {
            totalUnits: 0,
            winUnits: 0,
            winRate: 0,
            perUnitBid: 0,
            spentBudget: 0,
            refundBudget: totalBudget
        };
    }

    const b1 = totalBudget / totalUnits;
    let winUnits = 0;
    const details = [];

    for (const date of dates) {
        for (const zipCode of zipCodes) {
            const competitors = rows.filter(r => String(r.parsed_zip) === String(zipCode) && String(r.parsed_date) === String(date));

            for (const slot of slotIds) {
                const competingBids = [];
                for (const row of competitors) {
                    for (let i = 1; i <= 5; i++) {
                        const pCol = `preferred_slot_${i}`;
                        const bCol = `bid_usd_${i}`;
                        const pref = safeNumber(row[pCol], null);
                        if (pref !== null && pref === slot) {
                            const bid = safeNumber(row[bCol], null);
                            if (bid !== null) competingBids.push(bid);
                        }
                    }
                }

                const allBids = competingBids.concat([b1]);
                allBids.sort((a, b) => b - a);
                // Match python agent behavior: rank uses the first occurrence (ties favor our bid)
                const rank = allBids.indexOf(b1) + 1;
                const isWin = rank <= 3;
                if (isWin) winUnits += 1;

                details.push({
                    zip: String(zipCode),
                    date: String(date), // MMDDYYYY to match the dataset/logs
                    slot: Number(slot),
                    rank,
                    totalBids: allBids.length,
                    outcome: isWin ? 'WIN' : 'LOST'
                });
            }
        }
    }

    const spentBudget = winUnits * b1;
    const refundBudget = Math.max(0, totalBudget - spentBudget);

    return {
        totalUnits,
        winUnits,
        winRate: totalUnits ? winUnits / totalUnits : 0,
        perUnitBid: b1,
        spentBudget,
        refundBudget,
        details
    };
}

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
        alert('Please sign in to access bidding');
        window.location.href = '/login.html';
    } else {
        loadUserAds();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Bidding page DOM loaded');
    generateTimeSlots();
    setMinDates();
    initializeMockupMap();
});

// ZIP options for the mockup "map" (Seattle metro area)
// Keep the same UI card style; only replace the selectable ZIP list.
const majorCities = [
    { name: 'Bellevue', lat: 47.6101, lng: -122.2015, zip: '98005' },
    { name: 'Seattle', lat: 47.6720, lng: -122.3050, zip: '98115' },
    { name: 'Kirkland', lat: 47.6769, lng: -122.2060, zip: '98033' },
    { name: 'Redmond', lat: 47.6739, lng: -122.1215, zip: '98052' },
    { name: 'Bellevue', lat: 47.6101, lng: -122.2015, zip: '98007' },
    { name: 'Bellevue', lat: 47.6101, lng: -122.2015, zip: '98004' },
    { name: 'Seattle', lat: 47.6278, lng: -122.3426, zip: '98109' },
    { name: 'Seattle', lat: 47.6367, lng: -122.3220, zip: '98102' },
    { name: 'Bellevue', lat: 47.6101, lng: -122.2015, zip: '98008' },
    { name: 'Seattle', lat: 47.6105, lng: -122.3366, zip: '98101' }
];

// Initialize Mockup Map
function initializeMockupMap() {
    console.log('🗺️ Initializing mockup map...');

    const mapMockup = document.getElementById('mapMockup');
    if (!mapMockup) return;

    // Create city markers
    const html = majorCities.map(city => `
        <div class="city-marker" data-zip="${city.zip}" onclick="toggleCitySelection('${city.zip}', '${city.name}')">
            <div class="city-name">${city.name}</div>
            <div class="city-zip">ZIP: ${city.zip}</div>
            ${city.population ? `<div class="city-population">${city.population}</div>` : ''}
        </div>
    `).join('');

    mapMockup.innerHTML = html;
    console.log('✅ Mockup map initialized with', majorCities.length, 'cities');
}

// Toggle city selection on mockup map
window.toggleCitySelection = function(zip, cityName) {
    console.log('📍 Toggle ZIP:', zip, cityName);

    const cityMarker = document.querySelector(`.city-marker[data-zip="${zip}"]`);
    if (!cityMarker) return;

    // Check if already selected
    const index = biddingData.zipcodes.indexOf(zip);
    if (index > -1) {
        // Deselect
        biddingData.zipcodes.splice(index, 1);
        cityMarker.classList.remove('selected');
    } else {
        // Select
        biddingData.zipcodes.push(zip);
        cityMarker.classList.add('selected');
    }

    updateSelectedZipcodesDisplay();
};

// Update selected zipcodes display
function updateSelectedZipcodesDisplay() {
    const container = document.getElementById('selectedZipcodes');
    const infoBox = document.getElementById('zipcodeInfo');

    if (biddingData.zipcodes.length === 0) {
        infoBox.classList.remove('active');
        return;
    }

    infoBox.classList.add('active');

    const html = biddingData.zipcodes.map(zip => {
        const city = majorCities.find(c => c.zip === zip);
        return `
            <div class="zipcode-tag">
                <span>${zip} - ${city ? city.name : 'Unknown'}</span>
                <span class="remove" onclick="removeZipcode('${zip}')">×</span>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Remove zipcode
window.removeZipcode = function(zip) {
    const city = majorCities.find(c => c.zip === zip);
    if (city) {
        toggleCitySelection(zip, city.name);
    }
};

// Handle manual zipcode input
window.handleManualZipcode = function() {
    const input = document.getElementById('zipcode');
    const zip = input.value.trim();

    if (zip.length === 5) {
        // Check if it matches a known city
        const city = majorCities.find(c => c.zip === zip);
        if (city) {
            if (!biddingData.zipcodes.includes(zip)) {
                toggleCitySelection(zip, city.name);
            }
        } else {
            // Add custom zipcode
            if (!biddingData.zipcodes.includes(zip)) {
                biddingData.zipcodes.push(zip);
                updateSelectedZipcodesDisplay();
            }
        }
    }
};

// Generate time slots (2-hour blocks)
function generateTimeSlots() {
    const timeSlotsContainer = document.getElementById('timeSlots');
    const slots = [
        // Removed: 22:00-24:00, 00:00-02:00, 02:00-04:00, 04:00-06:00
        '06:00-08:00', '08:00-10:00', '10:00-12:00', '12:00-14:00',
        '14:00-16:00', '16:00-18:00', '18:00-20:00', '20:00-22:00'
    ];

    timeSlotsContainer.innerHTML = slots.map(slot =>
        `<div class="time-slot" onclick="toggleTimeSlot('${slot}')">${slot}</div>`
    ).join('');
}

// Toggle time slot selection
window.toggleTimeSlot = function(slot) {
    const element = event.target;
    element.classList.toggle('selected');

    const index = biddingData.timeSlots.indexOf(slot);
    if (index > -1) {
        biddingData.timeSlots.splice(index, 1);
    } else {
        biddingData.timeSlots.push(slot);
    }

    console.log('Selected time slots:', biddingData.timeSlots);
};

// Set minimum dates
function setMinDates() {
    // Custom date picker: year fixed to 2025 (browser native date UI can't be restricted)
    const startIsoEl = document.getElementById('startDate');
    const endIsoEl = document.getElementById('endDate');
    const startMonthEl = document.getElementById('startMonth');
    const startDayEl = document.getElementById('startDay');
    const endMonthEl = document.getElementById('endMonth');
    const endDayEl = document.getElementById('endDay');
    if (!startIsoEl || !endIsoEl || !startMonthEl || !startDayEl || !endMonthEl || !endDayEl) return;

    const YEAR = 2025;

    const daysInMonth = (year, month) => new Date(year, month, 0).getDate(); // month: 1-12
    const pad2 = (n) => String(n).padStart(2, '0');

    const fillMonths = (sel) => {
        sel.innerHTML = Array.from({ length: 12 }, (_, i) => {
            const m = i + 1;
            return `<option value="${m}">${pad2(m)}</option>`;
        }).join('');
    };

    const fillDays = (sel, year, month, selectedDay = null) => {
        const max = daysInMonth(year, month);
        const cur = selectedDay ? Math.min(selectedDay, max) : 1;
        sel.innerHTML = Array.from({ length: max }, (_, i) => {
            const d = i + 1;
            return `<option value="${d}">${pad2(d)}</option>`;
        }).join('');
        sel.value = String(cur);
    };

    const setIsoFromPickers = () => {
        const sm = Number(startMonthEl.value);
        const sd = Number(startDayEl.value);
        const em = Number(endMonthEl.value);
        const ed = Number(endDayEl.value);
        startIsoEl.value = `${YEAR}-${pad2(sm)}-${pad2(sd)}`;
        endIsoEl.value = `${YEAR}-${pad2(em)}-${pad2(ed)}`;
    };

    const ensureEndNotBeforeStart = () => {
        setIsoFromPickers();
        const s = new Date(startIsoEl.value);
        const e = new Date(endIsoEl.value);
        if (e < s) {
            // Snap end = start
            endMonthEl.value = startMonthEl.value;
            fillDays(endDayEl, YEAR, Number(endMonthEl.value), Number(startDayEl.value));
            setIsoFromPickers();
        }
    };

    // Init options
    fillMonths(startMonthEl);
    fillMonths(endMonthEl);

    // Default: dataset demo window
    const defaultStart = { month: 7, day: 12 };
    const defaultEnd = { month: 7, day: 13 };

    startMonthEl.value = String(defaultStart.month);
    fillDays(startDayEl, YEAR, defaultStart.month, defaultStart.day);
    endMonthEl.value = String(defaultEnd.month);
    fillDays(endDayEl, YEAR, defaultEnd.month, defaultEnd.day);
    setIsoFromPickers();

    // Wire changes
    startMonthEl.addEventListener('change', () => {
        fillDays(startDayEl, YEAR, Number(startMonthEl.value), Number(startDayEl.value));
        ensureEndNotBeforeStart();
    });
    startDayEl.addEventListener('change', ensureEndNotBeforeStart);

    endMonthEl.addEventListener('change', () => {
        fillDays(endDayEl, YEAR, Number(endMonthEl.value), Number(endDayEl.value));
        ensureEndNotBeforeStart();
    });
    endDayEl.addEventListener('change', ensureEndNotBeforeStart);
}

// Navigation functions
window.goToStep = function(step) {
    // Hide all cards
    document.querySelectorAll('.bidding-card').forEach(card => {
        card.classList.remove('active');
    });

    // Update progress circles
    for (let i = 1; i <= 4; i++) {
        const circle = document.getElementById(`circle-${i}`);
        circle.classList.remove('active', 'completed');
        if (i < step) {
            circle.classList.add('completed');
        } else if (i === step) {
            circle.classList.add('active');
        }
    }

    // Show selected card
    document.getElementById(`step-${step}`).classList.add('active');
    currentStep = step;

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Step 1 -> Step 2
window.goToStep2 = function() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    // Validation
    if (biddingData.zipcodes.length === 0) {
        alert('Please select at least one ZIP code region from the map or enter manually');
        return;
    }

    if (!startDate || !endDate) {
        alert('Please select start and end dates');
        return;
    }

    if (biddingData.timeSlots.length === 0) {
        alert('Please select at least one time slot');
        return;
    }

    // Basic validation: end date must be on/after start date
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        alert('Please select valid start and end dates');
        return;
    }
    if (end < start) {
        alert('End date must be on or after start date');
        return;
    }

    // Save data (keep first zipcode for backward compatibility)
    biddingData.zipcode = biddingData.zipcodes[0];
    biddingData.startDate = startDate;
    biddingData.endDate = endDate;

    // Calculate reach (fake numbers based on selections)
    calculateReach();

    // Go to step 2
    goToStep(2);
};

// Calculate reach (demo with fake numbers)
function calculateReach() {
    const baseDevices = Math.floor(Math.random() * 5000) + 10000; // 10k-15k per zipcode
    const timeSlotsMultiplier = biddingData.timeSlots.length * 0.1;
    const zipcodesMultiplier = biddingData.zipcodes.length; // More zipcodes = more reach
    const devices = Math.floor(baseDevices * (1 + timeSlotsMultiplier) * zipcodesMultiplier);
    const impressionsPerDay = Math.floor(devices * 1.5);

    document.getElementById('deviceReach').textContent = devices.toLocaleString();
    document.getElementById('impressionsReach').textContent = impressionsPerDay.toLocaleString();

    // Calculate advanced reach
    const advancedDevices = Math.floor(devices * 0.3);
    document.getElementById('advancedReach').textContent = '+' + advancedDevices.toLocaleString();

    // Store for later use
    biddingData.baseReach = devices;
    biddingData.advancedReachBonus = advancedDevices;
}

// Toggle advanced audience
window.toggleAdvanced = function() {
    const checkbox = document.getElementById('advancedCheckbox');
    const option = document.getElementById('advancedOption');

    checkbox.checked = !checkbox.checked;
    biddingData.advancedAudience = checkbox.checked;

    if (checkbox.checked) {
        option.classList.add('selected');
    } else {
        option.classList.remove('selected');
    }

    console.log('Advanced audience:', biddingData.advancedAudience);
};

// Step 2 -> Step 3
window.goToStep3 = function() {
    goToStep(3);
};

// Load user's saved ads
async function loadUserAds() {
    if (!currentUser) return;

    const posterGrid = document.getElementById('posterGrid');
    posterGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--tmobile-light-gray);">Loading your ads...</div>';

    try {
        const q = query(
            collection(db, 'ads'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            posterGrid.innerHTML = `
                <div style="padding: 40px; text-align: center; grid-column: 1/-1;">
                    <p style="color: var(--tmobile-light-gray); margin-bottom: 20px;">No saved ads yet</p>
                    <a href="/ad-generator.html" class="btn-primary">Create Your First Ad</a>
                </div>
            `;
            return;
        }

        userAds = [];
        let html = '';

        snapshot.forEach(doc => {
            const data = doc.data();
            userAds.push({ id: doc.id, ...data });

            const date = new Date(data.createdAt).toLocaleDateString();
            html += `
                <div class="poster-item" onclick="selectPoster('${doc.id}')">
                    <img src="${data.imageUrl}" alt="${data.slogan}">
                    <div class="poster-info">
                        <div class="poster-title">${data.slogan || 'Untitled'}</div>
                        <div class="poster-date">${date}</div>
                    </div>
                </div>
            `;
        });

        posterGrid.innerHTML = html;
        console.log('✅ Loaded', userAds.length, 'ads');

    } catch (error) {
        console.error('❌ Error loading ads:', error);
        posterGrid.innerHTML = '<div style="padding: 40px; text-align: center; color: #f00;">Error loading ads. Please refresh the page.</div>';
    }
}

// Select poster
window.selectPoster = function(posterId) {
    // Remove previous selection
    document.querySelectorAll('.poster-item').forEach(item => {
        item.classList.remove('selected');
        const badge = item.querySelector('.selected-badge');
        if (badge) badge.remove();
    });

    // Add selection
    event.currentTarget.classList.add('selected');
    const badge = document.createElement('div');
    badge.className = 'selected-badge';
    badge.textContent = '✓ Selected';
    event.currentTarget.appendChild(badge);

    // Save selection
    biddingData.selectedPoster = userAds.find(ad => ad.id === posterId);
    console.log('Selected poster:', biddingData.selectedPoster);
};

// Step 3 -> Step 4
window.goToStep4 = function() {
    if (!biddingData.selectedPoster) {
        alert('Please select an ad to continue');
        return;
    }

    // Generate campaign summary
    updateCampaignSummary();
    // Compute smart recommended budgets for Step 4
    updateRecommendedPrices();
    goToStep(4);
};

// Update campaign summary
function updateCampaignSummary() {
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.round((new Date(biddingData.endDate) - new Date(biddingData.startDate)) / msPerDay) + 1;
    const totalReach = biddingData.advancedAudience
        ? biddingData.baseReach + biddingData.advancedReachBonus
        : biddingData.baseReach;

    const summary = `
        <div style="display: grid; gap: 10px;">
            <div><strong>Locations:</strong> ${biddingData.zipcodes.length} ZIP code(s) - ${biddingData.zipcodes.join(', ')}</div>
            <div><strong>Duration:</strong> ${days} days (${biddingData.startDate} to ${biddingData.endDate})</div>
            <div><strong>Time Slots:</strong> ${biddingData.timeSlots.length} selected</div>
            <div><strong>Estimated Reach:</strong> ${totalReach.toLocaleString()} devices</div>
            <div><strong>Audience Type:</strong> ${biddingData.advancedAudience ? 'Premium' : 'Standard'}</div>
            <div><strong>Ad:</strong> ${biddingData.selectedPoster.slogan}</div>
        </div>
    `;

    document.getElementById('campaignSummary').innerHTML = summary;
}

// Select price
window.selectPrice = function(amount, type) {
    // Remove previous selection
    document.querySelectorAll('.price-card').forEach(card => {
        card.classList.remove('selected');
    });

    // Clear custom input
    document.getElementById('customBid').value = '';

    // Add selection
    event.currentTarget.classList.add('selected');

    // Save data
    biddingData.bidAmount = amount;
    biddingData.bidType = type;

    console.log('Selected bid:', amount, type);
};

// Handle custom bid input
document.addEventListener('DOMContentLoaded', function() {
    const customBidInput = document.getElementById('customBid');
    if (customBidInput) {
        customBidInput.addEventListener('input', function() {
            // Remove selection from preset prices
            document.querySelectorAll('.price-card').forEach(card => {
                card.classList.remove('selected');
            });

            if (this.value) {
                biddingData.bidAmount = parseInt(this.value);
                biddingData.bidType = 'custom';
                console.log('Custom bid:', biddingData.bidAmount);
            }
        });
    }
});

// Submit bid
window.submitBid = async function() {
    if (!biddingData.bidAmount || biddingData.bidAmount < 10) {
        alert('Please select or enter a bid amount (minimum $10)');
        return;
    }

    if (!currentUser) {
        alert('Please sign in to submit a bid');
        return;
    }

    const confirmMsg = `
Are you sure you want to submit this bid?

Amount: $${biddingData.bidAmount}
Duration: ${Math.round((new Date(biddingData.endDate) - new Date(biddingData.startDate)) / (1000 * 60 * 60 * 24)) + 1} days
Estimated Reach: ${(biddingData.advancedAudience ? biddingData.baseReach + biddingData.advancedReachBonus : biddingData.baseReach).toLocaleString()} devices
    `.trim();

    if (!confirm(confirmMsg)) return;

    try {
        // Try to compute final bidding result (demo simulation) from the historical CSV
        let biddingResult = null;
        try {
            const rows = await loadHistoryRows();
            const zipCodes = (biddingData.zipcodes || []).map(String);
            const dates = enumerateDatesMMDDYYYY(biddingData.startDate, biddingData.endDate);
            const slotIds = (biddingData.timeSlots || [])
                .map(label => SLOT_ID_BY_LABEL[label])
                .filter(Boolean);

            biddingResult = simulateBiddingOutcomeFromHistory(rows, zipCodes, dates, slotIds, biddingData.bidAmount);
            // Round for display/storage
            biddingResult = {
                ...biddingResult,
                perUnitBid: round2(biddingResult.perUnitBid),
                spentBudget: round2(biddingResult.spentBudget),
                refundBudget: round2(biddingResult.refundBudget),
                winRate: round2(biddingResult.winRate)
            };
        } catch (e) {
            console.warn('⚠️ Could not compute bidding result (CSV missing/unavailable).', e);
        }

        // Save bid to Firestore
        const bidDoc = {
            userId: currentUser.uid,
            userEmail: currentUser.email,
            zipcode: biddingData.zipcode,
            zipcodes: biddingData.zipcodes || [biddingData.zipcode],
            startDate: biddingData.startDate,
            endDate: biddingData.endDate,
            timeSlots: biddingData.timeSlots,
            advancedAudience: biddingData.advancedAudience,
            estimatedReach: biddingData.advancedAudience
                ? biddingData.baseReach + biddingData.advancedReachBonus
                : biddingData.baseReach,
            posterId: biddingData.selectedPoster.id,
            posterSlogan: biddingData.selectedPoster.slogan,
            posterImageUrl: biddingData.selectedPoster.imageUrl,
            bidAmount: biddingData.bidAmount,
            bidType: biddingData.bidType,
            status: 'active',
            biddingResult: biddingResult,
            createdAt: new Date().toISOString(),
            timestamp: Date.now()
        };

        await addDoc(collection(db, 'bids'), bidDoc);

        alert('✅ Bid submitted successfully!\n\nYou will be notified when your bid is processed.');

        // Redirect to my biddings page
        window.location.href = '/my-biddings.html';

    } catch (error) {
        console.error('❌ Error submitting bid:', error);
        alert('Error submitting bid: ' + error.message);
    }
};

// Debug: Log that all functions are registered
console.log('✅ All window functions registered:', {
    removeZipcode: typeof window.removeZipcode,
    handleManualZipcode: typeof window.handleManualZipcode,
    toggleTimeSlot: typeof window.toggleTimeSlot,
    goToStep: typeof window.goToStep,
    goToStep2: typeof window.goToStep2,
    goToStep3: typeof window.goToStep3,
    goToStep4: typeof window.goToStep4,
    toggleAdvanced: typeof window.toggleAdvanced,
    selectPoster: typeof window.selectPoster,
    selectPrice: typeof window.selectPrice,
    submitBid: typeof window.submitBid
});
