// Admin Dashboard Visualization Functions
// Sparklines, Heatmaps, Timelines, and Funnels

export function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatDateInput(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getLastNDates(n) {
    const dates = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(formatDateInput(d));
    }
    return dates;
}

function safeChart() {
    return typeof window.Chart !== 'undefined';
}

// Update trend indicators
export function updateTrends(biddings) {
    // Calculate trends (comparing last 7 days vs previous 7 days)
    const now = new Date();
    const last7Days = biddings.filter(b => {
        const created = new Date(b.createdAt || now);
        const daysDiff = (now - created) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7;
    });
    const prev7Days = biddings.filter(b => {
        const created = new Date(b.createdAt || now);
        const daysDiff = (now - created) / (1000 * 60 * 60 * 24);
        return daysDiff > 7 && daysDiff <= 14;
    });

    const trends = {
        campaigns: calculateTrendPercent(last7Days.length, prev7Days.length),
        revenue: calculateTrendPercent(
            last7Days.reduce((s, b) => s + (b.bidAmount || 0), 0),
            prev7Days.reduce((s, b) => s + (b.bidAmount || 0), 0)
        ),
        active: calculateTrendPercent(
            last7Days.filter(b => b.status === 'active').length,
            prev7Days.filter(b => b.status === 'active').length
        ),
        pending: calculateTrendPercent(
            last7Days.filter(b => b.status === 'pending').length,
            prev7Days.filter(b => b.status === 'pending').length
        ),
        impressions: calculateTrendPercent(
            last7Days.reduce((s, b) => s + (Number(b.estimatedReach) || 0), 0),
            prev7Days.reduce((s, b) => s + (Number(b.estimatedReach) || 0), 0)
        )
    };

    updateTrendElement('trendCampaigns', trends.campaigns);
    updateTrendElement('trendRevenue', trends.revenue);
    updateTrendElement('trendActive', trends.active);
    updateTrendElement('trendPending', trends.pending);
    updateTrendElement('trendImpressions', trends.impressions);
}

function calculateTrendPercent(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

function updateTrendElement(id, percent) {
    const el = document.getElementById(id);
    if (!el) return;
    
    const isPositive = percent >= 0;
    const marker = isPositive ? 'UP' : 'DOWN';
    el.textContent = `${marker} ${Math.abs(percent)}%`;
    el.className = 'mega-kpi-trend ' + (isPositive ? '' : 'negative');
}

// Render sparklines
export function renderSparklines(biddings) {
    if (!safeChart()) return;
    
    const last7Days = getLastNDates(7);
    
    // Revenue sparkline
    const revenueByDay = last7Days.map(date => {
        return biddings
            .filter(b => formatDateInput(new Date(b.createdAt || new Date())) === date)
            .reduce((sum, b) => sum + (b.bidAmount || 0), 0);
    });
    drawSparkline('sparklineRevenue', revenueByDay, '#E20074');
    
    // Campaigns sparkline
    const campaignsByDay = last7Days.map(date => {
        return biddings.filter(b => formatDateInput(new Date(b.createdAt || new Date())) === date).length;
    });
    drawSparkline('sparklineCampaigns', campaignsByDay, '#00D659');
    
    // Active sparkline
    const activeByDay = last7Days.map(date => {
        return biddings.filter(b => 
            formatDateInput(new Date(b.createdAt || new Date())) === date && 
            b.status === 'active'
        ).length;
    });
    drawSparkline('sparklineActive', activeByDay, '#FF8C00');
    
    // Pending sparkline
    const pendingByDay = last7Days.map(date => {
        return biddings.filter(b => 
            formatDateInput(new Date(b.createdAt || new Date())) === date && 
            b.status === 'pending'
        ).length;
    });
    drawSparkline('sparklinePending', pendingByDay, '#FFD700');
    
    // Impressions sparkline
    const impressionsByDay = last7Days.map(date => {
        return biddings
            .filter(b => formatDateInput(new Date(b.createdAt || new Date())) === date)
            .reduce((sum, b) => sum + (Number(b.estimatedReach) || 0), 0);
    });
    drawSparkline('sparklineImpressions', impressionsByDay, '#FF2D92');
}

function drawSparkline(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const max = Math.max(...data, 1);
    const points = data.map((val, i) => ({
        x: (i / (data.length - 1)) * width,
        y: height - (val / max) * height
    }));
    
    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    
    // Draw fill
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = color + '20';
    ctx.fill();
}

// Render performance heatmap
export function renderPerformanceHeatmap(biddings) {
    const container = document.getElementById('performanceHeatmap');
    if (!container) return;

    const slotLabels = ['06', '08', '10', '12', '14', '16', '18', '20'];
    const statusRows = ['active', 'pending', 'completed'];
    const matrix = statusRows.map(() => slotLabels.map(() => 0));

    biddings.forEach((bid) => {
        const row = statusRows.indexOf(String(bid.status || 'pending'));
        if (row < 0) return;
        const slots = Array.isArray(bid.timeSlots) ? bid.timeSlots : [];
        if (!slots.length) {
            matrix[row][2] += 1;
            return;
        }
        slots.forEach((slot) => {
            const hour = Number(String(slot).split(':')[0]);
            const col = Math.floor((hour - 6) / 2);
            if (col >= 0 && col < slotLabels.length) {
                matrix[row][col] += 1;
            }
        });
    });

    const allVals = matrix.flat();
    const maxVal = Math.max(1, ...allVals);

    const xAxis = slotLabels.map((l) => `<div class="heatmap-axis-item">${l}:00</div>`).join('');
    const rows = statusRows.map((status, rIdx) => {
        const cells = slotLabels.map((_, cIdx) => {
            const val = matrix[rIdx][cIdx];
            const intensity = Math.max(1, Math.ceil((val / maxVal) * 5));
            return `<div class="heatmap-cell intensity-${intensity}" title="${status} @ ${slotLabels[cIdx]}:00 = ${val}">
                <span>${val}</span>
            </div>`;
        }).join('');
        return `
            <div class="heatmap-row">
                <div class="heatmap-row-label">${status.toUpperCase()}</div>
                <div class="heatmap-row-cells">${cells}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="heatmap-axis">
            <div class="heatmap-axis-corner">Y/X</div>
            <div class="heatmap-axis-x">${xAxis}</div>
        </div>
        <div class="heatmap-body">${rows}</div>
    `;
}

// Render campaign timeline
export function renderCampaignTimeline(biddings) {
    const container = document.getElementById('campaignTimeline');
    if (!container) return;
    
    const activeCampaigns = biddings
        .filter(b => b.status === 'active')
        .slice(0, 10); // Show top 10
    
    if (activeCampaigns.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #aaaaaa; padding: 20px;">No active campaigns</div>';
        return;
    }
    
    // Calculate timeline range
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneDayMs = 24 * 60 * 60 * 1000;
    const formatShortDate = (dateObj) => {
        const d = new Date(dateObj);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}/${dd}`;
    };
    
    const axisLabels = Array.from({ length: 8 }, (_, idx) => {
        const day = new Date(today.getTime() + idx * oneDayMs);
        return `<div class="timeline-axis-tick">${formatShortDate(day)}</div>`;
    })
        .join('');

    const rows = activeCampaigns.map(campaign => {
        const start = new Date(campaign.startDate);
        const end = new Date(campaign.endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
        
        // Calculate position and width
        const totalDays = 7;
        const startOffset = Math.max(0, (start - today) / oneDayMs);
        const duration = Math.max(1, (end - start) / oneDayMs);
        const startDay = Math.max(0, Math.min(7, Math.floor(startOffset)));
        const endDay = Math.max(startDay + 1, Math.min(7, Math.ceil(startOffset + duration)));
        const rangeStartDate = new Date(today.getTime() + startDay * oneDayMs);
        const rangeEndDate = new Date(today.getTime() + endDay * oneDayMs);
        const segmentLabel = `${formatShortDate(rangeStartDate)}-${formatShortDate(rangeEndDate)}`;
        
        const left = Math.min(100, Math.max(0, (startOffset / totalDays) * 100));
        const width = Math.min(100 - left, Math.max(6, (duration / totalDays) * 100));
        
        return `
            <div class="timeline-row">
                <div class="timeline-row-label">${campaign.userEmail?.split('@')[0] || 'Campaign'}</div>
                <div class="timeline-bar">
                    <div class="timeline-segment" style="left: ${left}%; width: ${width}%;" title="${campaign.userEmail}: ${campaign.startDate} - ${campaign.endDate}">
                        ${segmentLabel}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="timeline-axis">
            <div class="timeline-axis-left">Campaign</div>
            <div class="timeline-axis-right">${axisLabels}</div>
        </div>
        ${rows}
    `;
}

// Render campaign funnel
export function renderCampaignFunnel(biddings) {
    const container = document.getElementById('campaignFunnel');
    if (!container) return;
    
    const total = biddings.length;
    const pending = biddings.filter(b => b.status === 'pending').length;
    const active = biddings.filter(b => b.status === 'active').length;
    const completed = biddings.filter(b => b.status === 'completed').length;
    
    const stages = [
        { label: 'Submitted', value: total, width: 100 },
        { label: 'Pending Review', value: pending, width: total > 0 ? (pending / total) * 100 : 0 },
        { label: 'Active', value: active, width: total > 0 ? (active / total) * 100 : 0 },
        { label: 'Completed', value: completed, width: total > 0 ? (completed / total) * 100 : 0 }
    ];
    
    container.innerHTML = stages.map((stage, index) => {
        const percentage = index === 0 ? 100 : Math.round((stage.value / total) * 100);
        return `
            <div class="funnel-stage">
                <div class="funnel-bar" style="width: ${stage.width}%;">
                    <div class="funnel-label">${stage.label}</div>
                    <div class="funnel-value">${stage.value}</div>
                </div>
                <div class="funnel-percentage">${percentage}%</div>
            </div>
        `;
    }).join('');
}
