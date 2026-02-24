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
    
    // Create 12 time slots
    const slots = Array.from({ length: 12 }, (_, i) => {
        const hour = (i * 2) + 6; // Start at 6 AM
        return {
            label: `${hour}:00`,
            count: 0
        };
    });
    
    // Count campaigns per slot
    biddings.forEach(bid => {
        if (bid.timeSlots && Array.isArray(bid.timeSlots)) {
            bid.timeSlots.forEach(slot => {
                const hour = parseInt(slot.split(':')[0]);
                const slotIndex = Math.floor((hour - 6) / 2);
                if (slotIndex >= 0 && slotIndex < 12) {
                    slots[slotIndex].count++;
                }
            });
        }
    });
    
    const maxCount = Math.max(...slots.map(s => s.count), 1);
    
    container.innerHTML = slots.map(slot => {
        const intensity = Math.max(1, Math.ceil((slot.count / maxCount) * 5));
        return `
            <div class="heatmap-cell intensity-${intensity}" title="${slot.label}: ${slot.count} campaigns">
                <div style="font-size: 0.7em;">${slot.label.split(':')[0]}</div>
                <div style="font-size: 0.65em; color: rgba(255,255,255,0.6);">${slot.count}</div>
            </div>
        `;
    }).join('');
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
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    container.innerHTML = activeCampaigns.map(campaign => {
        const start = new Date(campaign.startDate);
        const end = new Date(campaign.endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
        
        // Calculate position and width
        const totalDays = 7;
        const startOffset = Math.max(0, (start - today) / (24 * 60 * 60 * 1000));
        const duration = Math.max(1, (end - start) / (24 * 60 * 60 * 1000));
        
        const left = Math.min(100, Math.max(0, (startOffset / totalDays) * 100));
        const width = Math.min(100 - left, Math.max(6, (duration / totalDays) * 100));
        
        return `
            <div class="timeline-bar">
                <div class="timeline-segment" style="left: ${left}%; width: ${width}%;" title="${campaign.userEmail}: ${campaign.startDate} - ${campaign.endDate}">
                    ${campaign.userEmail?.split('@')[0] || 'Campaign'}
                </div>
            </div>
        `;
    }).join('');
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
