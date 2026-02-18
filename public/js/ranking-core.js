// Core GSP Ranking Logic (ported from TADRANKING/gsp_bidding_sim.py)
// - Group by (zipcode, date, time_slot)
// - Pick top 3 bids by bid_cpm
// - Payments: pos1 pays bid(pos2), pos2 pays bid(pos3), pos3 pays reserve
// - Impressions: 3600 / 2400 / 1200 for positions 1/2/3

export const IMPRESSIONS_BY_RANK = { 1: 3600, 2: 2400, 3: 1200 };

// Our bidding system time slot labels
export const TIME_SLOTS = [
  '00:00-02:00', '02:00-04:00', '04:00-06:00', '06:00-08:00',
  '08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00',
  '16:00-18:00', '18:00-20:00', '20:00-22:00', '22:00-24:00'
];

export function timeSlotLabelToIndex(label) {
  const idx = TIME_SLOTS.indexOf(label);
  return idx === -1 ? null : idx + 1; // 1..12
}

export function yyyymmdd(dateStr) {
  // input: YYYY-MM-DD
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

export function dateInRange(targetYmd, startYmd, endYmd) {
  if (!targetYmd || !startYmd || !endYmd) return false;
  return targetYmd >= startYmd && targetYmd <= endYmd;
}

export function expandBidsToAuctionInputs(bids, targetDateYmd) {
  // Convert Firestore bid documents into per-auction bid rows compatible with GSP.
  // We treat bidAmount as bid_cpm (demo mapping).
  const rows = [];
  for (const b of bids) {
    const zipcodes = (b.zipcodes && b.zipcodes.length) ? b.zipcodes : (b.zipcode ? [b.zipcode] : []);
    const slots = Array.isArray(b.timeSlots) ? b.timeSlots : [];
    const start = yyyymmdd(b.startDate);
    const end = yyyymmdd(b.endDate);
    if (!dateInRange(targetDateYmd, start, end)) continue;

    const merchantId = b.userId || 'unknown';
    const merchantEmail = b.userEmail || '';
    const campaignId = b.id || b.bidId || '';
    const posterId = b.posterId || '';
    const adCode = `${posterId || 'AD'}:${campaignId || 'C'}`; // ensure unique-ish

    const bidCpm = Number(b.bidAmount || 0);
    if (!Number.isFinite(bidCpm) || bidCpm <= 0) continue;

    for (const z of zipcodes) {
      for (const slotLabel of slots) {
        const slotIdx = timeSlotLabelToIndex(slotLabel);
        if (!slotIdx) continue;
        rows.push({
          zipcode: String(z),
          date: String(targetDateYmd),
          time_slot: slotIdx,
          merchant_id: merchantId,
          merchant_email: merchantEmail,
          ad_code: adCode,
          bid_cpm: Number(bidCpm.toFixed(2)),
          campaign_id: campaignId,
          poster_image_url: b.posterImageUrl || '',
          poster_slogan: b.posterSlogan || ''
        });
      }
    }
  }
  return rows;
}

export function runGspAuctions(bidRows, reserveCpm = 1.0) {
  // Returns auction rows (winners) similar to auction_df in python.
  const byKey = new Map();
  for (const r of bidRows) {
    const key = `${r.zipcode}|${r.date}|${r.time_slot}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r);
  }

  const out = [];
  for (const [key, rows] of byKey.entries()) {
    rows.sort((a, b) => {
      if (b.bid_cpm !== a.bid_cpm) return b.bid_cpm - a.bid_cpm;
      return String(a.ad_code).localeCompare(String(b.ad_code));
    });
    const top = rows.slice(0, 3);
    for (let pos = 1; pos <= top.length; pos++) {
      const winner = top[pos - 1];
      let pay = reserveCpm;
      if (pos === 1) pay = top[1] ? top[1].bid_cpm : reserveCpm;
      if (pos === 2) pay = top[2] ? top[2].bid_cpm : reserveCpm;
      if (pos === 3) pay = reserveCpm;

      const impressions = IMPRESSIONS_BY_RANK[pos];
      const costUsd = Number((pay * impressions / 1000.0).toFixed(2));

      out.push({
        zipcode: winner.zipcode,
        date: winner.date,
        time_slot: winner.time_slot,
        position: pos,
        ad_code: winner.ad_code,
        merchant_id: winner.merchant_id,
        merchant_email: winner.merchant_email,
        bid_cpm: Number(winner.bid_cpm.toFixed(2)),
        pay_cpm: Number(pay.toFixed(2)),
        impressions,
        cost_usd: costUsd,
        campaign_id: winner.campaign_id,
        poster_image_url: winner.poster_image_url,
        poster_slogan: winner.poster_slogan
      });
    }
  }
  return out;
}

export function summarizeMerchants(auctionRows) {
  const m = new Map();
  for (const r of auctionRows) {
    const key = r.merchant_id;
    if (!m.has(key)) m.set(key, { merchant_id: key, merchant_email: r.merchant_email || '', total_impressions: 0, total_spend_usd: 0, wins: 0 });
    const cur = m.get(key);
    cur.total_impressions += Number(r.impressions || 0);
    cur.total_spend_usd += Number(r.cost_usd || 0);
    cur.wins += 1;
    if (!cur.merchant_email && r.merchant_email) cur.merchant_email = r.merchant_email;
  }
  const arr = Array.from(m.values()).map(x => ({ ...x, total_spend_usd: Number(x.total_spend_usd.toFixed(2)) }));
  arr.sort((a, b) => b.total_spend_usd - a.total_spend_usd);
  return arr;
}

export function kpis(auctionRows) {
  const totalSpend = auctionRows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  const totalImps = auctionRows.reduce((s, r) => s + Number(r.impressions || 0), 0);
  const uniqueAds = new Set(auctionRows.map(r => r.ad_code)).size;
  const coveredSlots = new Set(auctionRows.map(r => `${r.zipcode}|${r.date}|${r.time_slot}`)).size;
  return {
    totalSpend: Number(totalSpend.toFixed(2)),
    totalImps,
    uniqueAds,
    coveredSlots
  };
}


