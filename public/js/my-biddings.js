// My Biddings Page Logic
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    deleteDoc,
    doc,
    updateDoc,
    addDoc,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;

// ---------- Final bidding result (CSV driven demo) ----------
const HISTORICAL_CSV_URL = '/data/ads_input_1000_local_usd_week.csv';
// CSV uses Slot IDs 1~8 for the 8 visible time slots:
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

function formatUSD(amount) {
    if (typeof amount !== 'number' || Number.isNaN(amount)) return '-';
    return '$' + Math.round(amount).toLocaleString();
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function safeNumber(x, fallback = null) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
}

function parseAdId(adId) {
    try {
        const zIdx = adId.indexOf('z');
        const dIdx = adId.indexOf('d');
        if (zIdx === -1 || dIdx === -1) return { zip: null, date: null };
        return { zip: adId.slice(zIdx + 1, dIdx), date: adId.slice(dIdx + 1) };
    } catch {
        return { zip: null, date: null };
    }
}

function parseCsvLine(line) {
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
        for (let c = 0; c < header.length; c++) row[header[c]] = (cols[c] ?? '').trim();
        const { zip, date } = parseAdId(row.ad_id || '');
        row.parsed_zip = zip;
        row.parsed_date = date;
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
        _historyRowsCache = parseCsv(text);
        return _historyRowsCache;
    })();

    return _historyLoadPromise;
}

function enumerateDatesMMDDYYYY(startISO, endISO) {
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

function simulateBiddingOutcomeFromHistory(rows, zipCodes, dates, slotIds, totalBudget) {
    const totalUnits = zipCodes.length * dates.length * slotIds.length;
    if (!totalUnits) {
        return { totalUnits: 0, winUnits: 0, winRate: 0, perUnitBid: 0, spentBudget: 0, refundBudget: totalBudget };
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
                    date: String(date), // MMDDYYYY
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

async function ensureFinalResult(bidId, data) {
    // Always show Active in UI; backfill data.status/result for older docs if possible.
    const resultEl = document.getElementById(`finalResult-${bidId}`);
    if (!resultEl) return;

    const show = (r) => {
        if (!r) {
            resultEl.textContent = '—';
            return;
        }
        resultEl.textContent =
            `✅ ${r.winUnits}/${r.totalUnits} WIN • Spent ${formatUSD(r.spentBudget)} • Refund ${formatUSD(r.refundBudget)}`;

        const linesEl = document.getElementById(`finalLines-${bidId}`);
        if (linesEl) {
            const details = Array.isArray(r.details) ? r.details : [];
            linesEl.innerHTML = details.map(d => {
                const icon = d.outcome === 'WIN' ? '✅' : '❌';
                return `<div>${icon} [${d.outcome}] Zip ${d.zip} | Date ${d.date} | Slot ${d.slot} | Rank ${d.rank}/${d.totalBids}</div>`;
            }).join('');
        }
    };

    if (data?.biddingResult?.totalUnits !== undefined) {
        show(data.biddingResult);
        // Backfill status if needed (optional)
        if (data.status !== 'active') {
            try { await updateDoc(doc(db, 'bids', bidId), { status: 'active' }); } catch { /* ignore */ }
        }
        return;
    }

    // Compute on-the-fly if missing
    resultEl.textContent = 'Calculating...';
    try {
        const rows = await loadHistoryRows();
        const zipCodes = (data.zipcodes && data.zipcodes.length ? data.zipcodes : [data.zipcode]).map(String);
        const dates = enumerateDatesMMDDYYYY(data.startDate, data.endDate);
        const slotIds = (data.timeSlots || []).map(l => SLOT_ID_BY_LABEL[l]).filter(Boolean);
        const r = simulateBiddingOutcomeFromHistory(rows, zipCodes, dates, slotIds, Number(data.bidAmount) || 0);
        const rounded = {
            ...r,
            perUnitBid: round2(r.perUnitBid),
            spentBudget: round2(r.spentBudget),
            refundBudget: round2(r.refundBudget),
            winRate: round2(r.winRate)
        };
        show(rounded);
        // Persist for future loads
        await updateDoc(doc(db, 'bids', bidId), { status: 'active', biddingResult: rounded });
    } catch (e) {
        console.warn('Final result unavailable:', e);
        resultEl.textContent = '— (CSV missing/unavailable)';
        // Still normalize status in UI; best-effort persist
        try { await updateDoc(doc(db, 'bids', bidId), { status: 'active' }); } catch { /* ignore */ }
    }
}

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (!user) {
        window.location.href = '/login.html';
    } else {
        loadUserBiddings();
    }
});

// Load user's biddings
async function loadUserBiddings() {
    if (!currentUser) return;

    const list = document.getElementById('biddingsList');
    list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--tmobile-light-gray);">Loading your biddings...</div>';

    try {
        const q = query(
            collection(db, 'bids'),
            where('userId', '==', currentUser.uid),
            orderBy('timestamp', 'desc')
        );

        const snapshot = await getDocs(q);

        list.innerHTML = '';

        if (snapshot.empty) {
            list.innerHTML = `
                <div class="empty-state">
                    <h2>No biddings yet</h2>
                    <p>Click "Create New Bidding" to start your first campaign</p>
                </div>
            `;
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const card = createBiddingCard(docSnap.id, data);
            list.appendChild(card);
            // Fill final result asynchronously (and backfill status/result if needed)
            ensureFinalResult(docSnap.id, data);
        });

        console.log('✅ Loaded', snapshot.size, 'biddings');

    } catch (error) {
        console.error('❌ Error loading biddings:', error);
        list.innerHTML = `
            <div style="color: #f00; text-align: center; padding: 40px;">
                Error loading biddings. Please refresh the page.
            </div>
        `;
    }
}

// Create bidding card element
function createBiddingCard(bidId, data) {
    const card = document.createElement('div');
    card.className = 'bidding-card';
    card.setAttribute('data-bid-id', bidId);

    const date = new Date(data.createdAt).toLocaleDateString();
    // No pending in this demo: always show Active
    const statusClass = 'status-active';
    const statusText = 'Active';

    const zipcodes = data.zipcodes && data.zipcodes.length > 0
        ? data.zipcodes.join(', ')
        : data.zipcode || 'N/A';

    card.innerHTML = `
        <div class="bidding-header">
            <div>
                <div class="bidding-title">Campaign #${bidId.slice(-6)}</div>
                <div style="color: var(--tmobile-light-gray); font-size: 0.9em;">Created: ${date}</div>
            </div>
            <span class="bidding-status ${statusClass}">${statusText}</span>
        </div>

        <div class="bidding-details">
            <div class="detail-item">
                <div class="detail-label">Locations</div>
                <div class="detail-value">${zipcodes}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Duration</div>
                <div class="detail-value">${data.startDate} - ${data.endDate}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Bid Amount</div>
                <div class="detail-value">$${data.bidAmount}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Estimated Reach</div>
                <div class="detail-value">${(data.estimatedReach || 0).toLocaleString()} devices</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Final Result</div>
                <div class="detail-value" id="finalResult-${bidId}">Calculating...</div>
            </div>
        </div>

        <div style="margin-top: 10px; padding: 12px 15px; background: var(--tmobile-black); border-radius: 12px; border: 2px solid var(--tmobile-gray);">
            <div style="font-size: 0.85em; color: var(--tmobile-gray); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                Bidding outcome (per unit)
            </div>
            <div id="finalLines-${bidId}" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; font-size: 0.9em; color: var(--tmobile-light-gray); line-height: 1.6;">
                Calculating...
            </div>
        </div>

        <div class="bidding-ad-preview">
            <img src="${data.posterImageUrl}" alt="Ad Preview" class="ad-thumbnail">
            <div class="ad-preview-info">
                <h4>${data.posterSlogan || 'Your Ad'}</h4>
                <p>${data.timeSlots?.length || 0} time slots • ${data.advancedAudience ? 'Premium' : 'Standard'} audience</p>
            </div>
        </div>

        <div class="bidding-actions">
            <button class="btn-primary" onclick="launchToESP32('${bidId}')" style="background: var(--success-green);">🚀 Launch to ESP32</button>
            <button class="btn-primary" onclick="editBidding('${bidId}')">Edit Campaign</button>
            <button class="btn-secondary" onclick="viewDetails('${bidId}')">View Details</button>
            <button class="btn-danger" onclick="deleteBidding('${bidId}')">Delete</button>
        </div>
    `;

    return card;
}

// Edit bidding
window.editBidding = function(bidId) {
    // In a real app, you would load the bidding data and pre-fill the form
    window.location.href = `/bidding.html?id=${bidId}`;
};

// View details
window.viewDetails = function(bidId) {
    alert('View details functionality coming soon!');
};

// Delete bidding
window.deleteBidding = async function(bidId) {
    if (!confirm('Are you sure you want to delete this campaign?')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'bids', bidId));
        console.log('✅ Bidding deleted:', bidId);

        // Remove card from DOM
        const card = document.querySelector(`[data-bid-id="${bidId}"]`);
        if (card) {
            card.remove();
        }

        // Check if list is empty
        const list = document.getElementById('biddingsList');
        const cards = list.querySelectorAll('.bidding-card');
        if (cards.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <h2>No biddings yet</h2>
                    <p>Click "Create New Bidding" to start your first campaign</p>
                </div>
            `;
        }

        alert('Campaign deleted successfully');

    } catch (error) {
        console.error('❌ Error deleting bidding:', error);
        alert('Error deleting campaign: ' + error.message);
    }
};

// Launch campaign to ESP32 devices
window.launchToESP32 = async function(bidId) {
    if (!confirm('🚀 Launch this campaign to ESP32 devices?\n\nThis will deploy your ad to all connected displays in the selected regions.')) {
        return;
    }

    try {
        // Get bidding details
        const bidDoc = await getDoc(doc(db, 'bids', bidId));
        if (!bidDoc.exists()) {
            alert('Campaign not found');
            return;
        }

        const bidData = bidDoc.data();

        // Create deployment record
        const deployment = {
            bidId: bidId,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            campaignName: `Campaign #${bidId.slice(-6)}`,

            // Ad content
            adImageUrl: bidData.posterImageUrl,
            adSlogan: bidData.posterSlogan,

            // Deployment settings
            zipcodes: bidData.zipcodes || [bidData.zipcode],
            startDate: bidData.startDate,
            endDate: bidData.endDate,
            timeSlots: bidData.timeSlots,

            // Deployment status
            status: 'pending', // pending -> deploying -> active -> completed
            deployedAt: new Date().toISOString(),
            timestamp: Date.now(),

            // Device tracking
            targetDevices: calculateTargetDevices(bidData.zipcodes || [bidData.zipcode]),
            deployedDevices: 0,
            activeDevices: 0
        };

        // Save to deployments collection
        const deploymentDoc = await addDoc(collection(db, 'deployments'), deployment);

        console.log('✅ Deployment created:', deploymentDoc.id);

        // Update bidding status
        await updateDoc(doc(db, 'bids', bidId), {
            deploymentId: deploymentDoc.id,
            deploymentStatus: 'deployed',
            lastDeployedAt: new Date().toISOString()
        });

        alert(`✅ Campaign launched successfully!\n\nDeployment ID: ${deploymentDoc.id}\n\nYour ad will be deployed to ${deployment.targetDevices} ESP32 devices in the selected regions.`);

        // Reload the page to show updated status
        window.location.reload();

    } catch (error) {
        console.error('❌ Error launching campaign:', error);
        alert('Error launching campaign: ' + error.message);
    }
};

// Calculate target devices based on zipcodes (mock calculation)
function calculateTargetDevices(zipcodes) {
    // In production, this would query actual device database
    // For demo, calculate based on zipcode count
    const devicesPerZipcode = Math.floor(Math.random() * 50) + 20; // 20-70 devices per zipcode
    return zipcodes.length * devicesPerZipcode;
}
