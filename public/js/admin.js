// Admin Dashboard Logic
import { db } from './firebase-config.js';
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

// Check admin session on load
function checkAdminSession() {
    const session = localStorage.getItem('adminSession');

    if (!session) {
        console.log('❌ No admin session found');
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
            console.log('❌ Admin session expired');
            localStorage.removeItem('adminSession');
            window.location.href = '/admin-login.html';
            return false;
        }

        console.log('✅ Admin authenticated:', adminSession.username);

        // Update user display
        const userDisplay = document.querySelector('.user-display');
        if (userDisplay) {
            userDisplay.textContent = adminSession.username;
        }

        return true;

    } catch (error) {
        console.error('❌ Invalid session:', error);
        localStorage.removeItem('adminSession');
        window.location.href = '/admin-login.html';
        return false;
    }
}

// Initialize admin dashboard
window.addEventListener('DOMContentLoaded', function() {
    if (checkAdminSession()) {
        loadAllBiddings();
        loadAllDeployments();
    }
});

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

        console.log('✅ Loaded', allBiddings.length, 'biddings');
        updateStatistics();
        displayBiddings();
        displaySchedule();

    } catch (error) {
        console.error('❌ Error loading biddings:', error);
        alert('Error loading data: ' + error.message);
    }
}

// Update statistics
function updateStatistics() {
    const total = allBiddings.length;
    const active = allBiddings.filter(b => b.status === 'active').length;
    const pending = allBiddings.filter(b => b.status === 'pending').length;
    const totalRevenue = allBiddings.reduce((sum, b) => sum + (b.bidAmount || 0), 0);

    document.getElementById('totalBiddings').textContent = total;
    document.getElementById('activeBiddings').textContent = active;
    document.getElementById('pendingBiddings').textContent = pending;
    document.getElementById('totalRevenue').textContent = '$' + totalRevenue.toLocaleString();
}

// Display biddings in table
function displayBiddings(filteredBiddings = null) {
    const biddings = filteredBiddings || allBiddings;
    const tbody = document.getElementById('biddingsTableBody');

    if (biddings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;">No campaigns found</td></tr>';
        return;
    }

    tbody.innerHTML = biddings.map(bid => {
        const zipcodes = bid.zipcodes && bid.zipcodes.length > 0
            ? bid.zipcodes.join(', ')
            : bid.zipcode || 'N/A';

        return `
            <tr>
                <td><strong>#${bid.id.slice(-6)}</strong></td>
                <td>
                    <div class="user-cell">
                        <div>${bid.userEmail || 'Unknown'}</div>
                        <div class="user-email">ID: ${bid.userId?.slice(0, 8)}...</div>
                    </div>
                </td>
                <td>${zipcodes}</td>
                <td>
                    <div>${bid.startDate}</div>
                    <div style="font-size: 0.85em; color: var(--tmobile-gray);">to ${bid.endDate}</div>
                </td>
                <td><strong>$${bid.bidAmount}</strong></td>
                <td>${(bid.estimatedReach || 0).toLocaleString()}</td>
                <td><span class="status-badge status-${bid.status || 'pending'}">${(bid.status || 'pending').toUpperCase()}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="btn-small btn-edit" onclick="editBidding('${bid.id}')">Edit</button>
                        ${bid.status === 'pending' ? `
                            <button class="btn-small btn-approve" onclick="updateStatus('${bid.id}', 'active')">Approve</button>
                            <button class="btn-small btn-reject" onclick="updateStatus('${bid.id}', 'rejected')">Reject</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Display schedule timeline
function displaySchedule() {
    const timeline = document.getElementById('scheduleTimeline');

    // Group biddings by start date
    const scheduleMap = {};
    allBiddings
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

    let filtered = allBiddings;

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
window.switchTab = function(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
};

// Edit bidding
window.editBidding = function(bidId) {
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
        console.log('✅ Bidding updated');
        alert('Campaign updated successfully!');
        closeEditModal();
        loadAllBiddings();
    } catch (error) {
        console.error('❌ Error updating bidding:', error);
        alert('Error updating campaign: ' + error.message);
    }
};

// Admin logout
window.signOutUser = function() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('adminSession');
        console.log('✅ Admin logged out');
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
    const action = newStatus === 'active' ? 'approve' : 'reject';
    if (!confirm(`Are you sure you want to ${action} this campaign?`)) {
        return;
    }

    try {
        await updateDoc(doc(db, 'bids', bidId), {
            status: newStatus,
            updatedAt: new Date().toISOString(),
            updatedBy: adminSession ? adminSession.username : 'admin'
        });

        console.log('✅ Status updated to', newStatus);
        alert(`Campaign ${action}d successfully!`);
        loadAllBiddings();

    } catch (error) {
        console.error('❌ Error updating status:', error);
        alert('Error updating status: ' + error.message);
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

        console.log('✅ Loaded', allDeployments.length, 'deployments');
        displayDeployments();

    } catch (error) {
        console.error('❌ Error loading deployments:', error);
        // If collection doesn't exist yet, just show empty
        displayDeployments([]);
    }
}

// Display deployments table
function displayDeployments(filteredDeployments = null) {
    const deployments = filteredDeployments || allDeployments;
    const tbody = document.getElementById('deploymentsTableBody');

    if (!tbody) return;

    if (deployments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;">No deployments yet</td></tr>';
        return;
    }

    tbody.innerHTML = deployments.map(deploy => {
        const deployedAt = new Date(deploy.deployedAt).toLocaleString();
        const progress = deploy.targetDevices > 0
            ? Math.round((deploy.activeDevices / deploy.targetDevices) * 100)
            : 0;

        return `
            <tr>
                <td><strong>#${deploy.id.slice(-6)}</strong></td>
                <td>${deploy.campaignName || 'N/A'}</td>
                <td>
                    <div class="user-cell">
                        <div>${deploy.userEmail || 'Unknown'}</div>
                    </div>
                </td>
                <td>${deploy.zipcodes?.join(', ') || 'N/A'}</td>
                <td>${deploy.targetDevices || 0}</td>
                <td>
                    <div>${deploy.activeDevices || 0}</div>
                    <div style="font-size: 0.85em; color: var(--tmobile-gray);">${progress}%</div>
                </td>
                <td><span class="status-badge status-${deploy.status || 'pending'}">${(deploy.status || 'pending').toUpperCase()}</span></td>
                <td style="font-size: 0.85em;">${deployedAt}</td>
            </tr>
        `;
    }).join('');
}
