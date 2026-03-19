/**
 * TRADE JOURNAL PRO - CORE LOGIC
 * Features: Firebase, Tax Calculation, Image Annotation, PDF Parsing, Dashboard Charts
 */

// --- 1. CONFIGURATION & INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCWeNMH5KWGl9qrvMyLf3v4Z5VHAPqWcTE",
    authDomain: "trade-journal-pro-e0ee0.firebaseapp.com",
    projectId: "trade-journal-pro-e0ee0",
    storageBucket: "trade-journal-pro-e0ee0.firebasestorage.app",
    messagingSenderId: "706152926446",
    appId: "1:706152926446:web:2c03f11736e6cdf47377ff"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const storage = firebase.storage();

// --- 2. THE CALCULATION ENGINE (NSE/DHAN RULES) ---
const Calc = {
    tradeTaxes: function(trade) {
        const qty = Math.abs(trade.quantity || 0);
        const entry = trade.entryPrice || 0;
        const exit = trade.exitPrice || 0;
        const isLong = trade.direction === 'LONG' || trade.direction === 'BUY';
        
        const buyValue = entry * qty;
        const sellValue = exit * qty;
        const turnover = buyValue + sellValue;
        const grossPnL = isLong ? (exit - entry) * qty : (entry - exit) * qty;

        // Charges Breakdown
        const brokerage = 40; // ₹20 entry + ₹20 exit
        const stt = isLong ? (sellValue * 0.0005) : (sellValue * 0.0005); // 0.05% on sell
        const txnCharges = turnover * 0.00005; // 0.005%
        const gst = (brokerage + txnCharges) * 0.18; // 18% on specific charges
        const sebi = turnover * 0.000001; // ₹10 per crore
        const stamp = isLong ? (buyValue * 0.00003) : 0; // 0.003% on buy

        const totalFees = brokerage + stt + txnCharges + gst + sebi + stamp;
        
        return {
            grossPnL,
            netPnL: grossPnL - totalFees,
            totalFees,
            breakdown: { brokerage, stt, txnCharges, gst, sebi, stamp }
        };
    },

    format: (num) => (num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    formatDate: (str) => new Date(str + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
};

// --- 3. DATA PERSISTENCE ---
const TradeJournal = {
    async loadDay(date) {
        const doc = await db.collection('trades').doc(date).get();
        return doc.exists ? doc.data() : { trades: [], totalPnL: 0, notes: '' };
    },

    async saveTrade(date, tradeData, files = []) {
    try {
        const uploadedMeta = [];
        for (let file of files) {
            const ref = storage.ref(`screenshots/${date}/${Date.now()}_${file.name}`);
            
            // Ensure values are strings or defaults to avoid 'undefined'
            const meta = { 
                customMetadata: { 
                    'annotated': String(file.metadata?.annotated || false), 
                    'tags': JSON.stringify(file.metadata?.tags || []) 
                } 
            };
            
            await ref.put(file, meta);
            const url = await ref.getDownloadURL();
            
            // CRITICAL FIX: Use the nullish coalescing operator (??) 
            // to ensure 'undefined' never reaches Firestore.
            uploadedMeta.push({ 
                url: url, 
                annotated: file.metadata?.annotated ?? false, 
                tags: file.metadata?.tags ?? [] 
            });
        }

        const dayData = await this.loadDay(date);
        
        // Ensure tradeData itself doesn't have undefined fields
        const cleanTradeData = {
    symbol: tradeData.symbol || "Unknown",
    direction: tradeData.direction || "LONG",
    entryPrice: Number(tradeData.entryPrice) || 0,
    exitPrice: Number(tradeData.exitPrice) || 0,
    takeProfit: Number(tradeData.takeProfit) || 0,
    stopLoss: Number(tradeData.stopLoss) || 0,
    quantity: Number(tradeData.quantity) || 0,
    entryTime: tradeData.entryTime || "",
    exitTime: tradeData.exitTime || "",
    strategy: tradeData.strategy || "Other",
    notes: tradeData.notes || ""
};

        const newTrade = { 
            ...cleanTradeData, 
            screenshots: uploadedMeta, 
            id: Date.now().toString() 
        };
        
        dayData.trades.push(newTrade);
        
        // Recalculate Totals
        dayData.totalPnL = dayData.trades.reduce((sum, t) => sum + (Calc.tradeTaxes(t).grossPnL || 0), 0);
        dayData.totalNetPnL = dayData.trades.reduce((sum, t) => sum + (Calc.tradeTaxes(t).netPnL || 0), 0);

        await db.collection('trades').doc(date).set(dayData);
        return true;
    } catch (e) { 
        console.error("Detailed Save Error:", e); 
        return false; 
    }
},

    async deleteTrade(date, index) {
        const dayData = await this.loadDay(date);
        dayData.trades.splice(index, 1);
        dayData.totalPnL = dayData.trades.reduce((sum, t) => sum + Calc.tradeTaxes(t).grossPnL, 0);
        await db.collection('trades').doc(date).set(dayData);
        return true;
    }
};

// --- 4. PAGE-SPECIFIC CONTROLLERS ---

// A. INDEX PAGE (Journal View)
async function renderJournal(date) {
    const data = await TradeJournal.loadDay(date);
    const container = document.getElementById('journalContent');
    if (!container) return;

    // Update Summary Header
    document.getElementById('dayPnL').innerHTML = `₹${Calc.format(data.totalPnL)}`;
    document.getElementById('netPnL').innerHTML = `₹${Calc.format(data.totalNetPnL || 0)}`;

    if (!data.trades.length) {
        container.innerHTML = `<div class="empty-state"><p>No trades logged for this date.</p></div>`;
        return;
    }

    let html = `<table class="trades-table"><thead><tr><th>Symbol</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Gross P&L</th><th>Net P&L</th><th>Action</th></tr></thead><tbody>`;
    data.trades.forEach((t, i) => {
        const taxes = Calc.tradeTaxes(t);
        html += `
            <tr onclick="location.href='trade-detail.html?date=${date}&index=${i}'" style="cursor:pointer">
                <td><b>${t.symbol}</b></td>
                <td class="${t.direction.toLowerCase()}">${t.direction === 'LONG' ? '📈' : '📉'}</td>
                <td>₹${Calc.format(t.entryPrice)}</td>
                <td>₹${Calc.format(t.exitPrice)}</td>
                <td class="${taxes.grossPnL >= 0 ? 'profit' : 'loss'}">₹${Calc.format(taxes.grossPnL)}</td>
                <td class="${taxes.netPnL >= 0 ? 'profit' : 'loss'}">₹${Calc.format(taxes.netPnL)}</td>
                <td><button class="btn-sm btn-danger" onclick="event.stopPropagation(); deleteTradeFromList('${date}', ${i})"><i class="fas fa-trash"></i></button></td>
            </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

// B. DASHBOARD PAGE (Charts)
async function initDashboard() {
    const range = document.getElementById('timeRange').value;
    const snapshot = await db.collection('trades').get();
    let allTrades = [];
    snapshot.forEach(doc => {
        doc.data().trades.forEach(t => allTrades.push({...t, date: doc.id}));
    });

    // Update Totals
    const totals = allTrades.reduce((acc, t) => {
        const res = Calc.tradeTaxes(t);
        acc.gross += res.grossPnL;
        acc.net += res.netPnL;
        acc.fees += res.totalFees;
        return acc;
    }, { gross: 0, net: 0, fees: 0 });

    document.getElementById('totalPnL').innerText = `₹${Calc.format(totals.gross)}`;
    document.getElementById('netPnL').innerText = `₹${Calc.format(totals.net)}`;
    document.getElementById('totalTax').innerText = `₹${Calc.format(totals.fees)}`;

    renderCharts(allTrades);
}

function renderCharts(trades) {
    const canvas = document.getElementById('equityChart');
    if (!canvas) return;

    // --- CRITICAL FIX: Destroy existing chart if it exists ---
    if (activeCharts.equity) {
        activeCharts.equity.destroy();
    }

    const ctx = canvas.getContext('2d');
    const sorted = trades.sort((a,b) => new Date(a.date) - new Date(b.date));
    let cumulative = 0;
    const data = sorted.map(t => { 
        cumulative += (Calc.tradeTaxes(t).netPnL || 0); 
        return cumulative; 
    });

    // Store the new chart instance in the global object
    activeCharts.equity = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sorted.map(t => t.date),
            datasets: [{ 
                label: 'Equity Curve', 
                data: data, 
                borderColor: '#3498db', 
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                fill: true 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// --- 5. GLOBAL INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    // Date Picker Setup
    const picker = document.getElementById('datePicker');
    if (picker) {
        picker.value = new Date().toISOString().split('T')[0];
        renderJournal(picker.value);
    }

    if (path.includes('dashboard')) initDashboard();
    if (path.includes('calendar')) initCalendar(); // Implementation from original logic
});

/**
 * HELPER: Notify user
 */
function showNotification(msg, type) {
    const div = document.createElement('div');
    div.className = `notification notification-${type}`;
    div.innerText = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}








// --- CALENDAR NAVIGATION LOGIC ---
let currentCalendarDate = new Date();

async function initCalendar() {
    renderCalendarGrid(currentCalendarDate);
}

function changeMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendarGrid(currentCalendarDate);
}

async function renderCalendarGrid(date) {
    const grid = document.getElementById('calendarGrid');
    const monthYearLabel = document.getElementById('currentMonthYear');
    if (!grid) return;

    const year = date.getFullYear();
    const month = date.getMonth();
    monthYearLabel.innerText = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Clear existing days (keep headers)
    const headers = grid.querySelectorAll('.calendar-header');
    grid.innerHTML = '';
    headers.forEach(h => grid.appendChild(h));

    // Calculate days...
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Fetch all trades for this month to color code
    const snapshot = await db.collection('trades').get(); // Optimization: use query for month
    
    for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="calendar-day other-month"></div>`;
    
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayOfWeek = new Date(year, month, d).getDay();
        
        let classes = ['calendar-day'];
        if (dayOfWeek === 2) classes.push('nifty-expiry');
        if (dayOfWeek === 4) classes.push('sensex-expiry');
        
        grid.innerHTML += `<div class="${classes.join(' ')}" onclick="location.href='index.html?date=${dateStr}'">
            <span class="day-number">${d}</span>
        </div>`;
    }
}

// --- BACKUP & RESTORE LOGIC ---
async function exportJournal() {
    const snapshot = await db.collection('trades').get();
    const data = {};
    snapshot.forEach(doc => data[doc.id] = doc.data());
    
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade_journal_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}


// Add to the TradeJournal object in app.js
TradeJournal.loadDayTrades = async function(date) {
    return await this.loadDay(date); 
};





// calender section/

async function renderCalendarGrid(date) {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('currentMonthYear');
    if (!grid) return;

    label.innerText = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Clear grid and re-add weekday headers
    const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    grid.innerHTML = headers.map(h => `<div class="calendar-header py-2 text-center fw-bold bg-light">${h}</div>`).join('');

    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Fetch month data
    const snapshot = await db.collection('trades').get();
    const allTradesData = {};
    snapshot.forEach(doc => { allTradesData[doc.id] = doc.data(); });

    // Empty cells for month start
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="calendar-day no-trade-day opacity-50"></div>`;
    }

    // Generate Day Cells
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayOfWeek = new Date(year, month, d).getDay();
        const dayData = allTradesData[dateStr] || { trades: [] };
        const trades = dayData.trades || [];
        const tradeCount = trades.length;

        // --- REPAIR LOGIC: If summary is 0 but trades exist, recalculate ---
        let netPnL = dayData.totalNetPnL || 0;
        if (tradeCount > 0 && netPnL === 0) {
            netPnL = trades.reduce((sum, t) => sum + (Calc.tradeTaxes(t).netPnL || 0), 0);
        }

        // --- ALIGN WITH YOUR LEGEND CLASSES ---
        let pnlClass = 'no-trade-day';
        if (tradeCount > 0) {
            if (netPnL > 0.1) pnlClass = 'profitable-day';
            else if (netPnL < -0.1) pnlClass = 'losing-day';
            else pnlClass = 'breakeven-day';
        }

        const expiryClass = (dayOfWeek === 2) ? 'nifty-expiry' : (dayOfWeek === 4 ? 'sensex-expiry' : '');

        const dayCell = document.createElement('div');
        dayCell.className = `calendar-day ${pnlClass} ${expiryClass} ${tradeCount > 0 ? 'has-trades' : ''}`;
        
        dayCell.innerHTML = `
            <span class="day-number fw-bold">${d}</span>
            ${tradeCount > 0 ? `
                <div class="day-info text-end">
                    <div class="day-trade-count">${tradeCount} Trades</div>
                    <div class="day-pnl-value">₹${Calc.format(netPnL)}</div>
                </div>
            ` : ''}
        `;

        dayCell.onclick = () => selectDay(dateStr, { trades, totalNetPnL: netPnL });
        grid.appendChild(dayCell);
    }
}










//  dashboard.html section


// --- 1. GLOBAL CHART INSTANCES (to allow destroying/updating) ---
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
});

// --- 2. THE MAIN DATA ENGINE ---
async function loadDashboardData() {
    const range = document.getElementById('timeRange').value;
    const snapshot = await db.collection('trades').get();
    let allTrades = [];
    
    // Flatten Firestore documents into a single trade list
    snapshot.forEach(doc => {
        const date = doc.id;
        const data = doc.data();
        data.trades.forEach(t => allTrades.push({ ...t, date }));
    });

    // Sort by date for proper chart chronological flow
    allTrades.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Filter based on Time Range
    const now = new Date();
    const filteredTrades = allTrades.filter(t => {
        const tDate = new Date(t.date);
        if (range === 'week') return (now - tDate) <= 7 * 24 * 60 * 60 * 1000;
        if (range === 'month') return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
        if (range === 'quarter') return (now - tDate) <= 90 * 24 * 60 * 60 * 1000;
        if (range === 'year') return (now - tDate) <= 365 * 24 * 60 * 60 * 1000;
        return true; // "all"
    });

    calculateAndDisplayMetrics(filteredTrades);
    renderDashboardCharts(filteredTrades);
    renderRecentTradesTable(filteredTrades);
}

// --- 3. METRIC CALCULATIONS ---
function calculateAndDisplayMetrics(trades) {
    let stats = {
        grossPnL: 0, netPnL: 0, totalFees: 0,
        wins: 0, losses: 0, 
        winSum: 0, lossSum: 0,
        maxWin: 0, maxLoss: 0,
        uniqueDays: new Set()
    };

    trades.forEach(t => {
        const res = Calc.tradeTaxes(t);
        stats.grossPnL += res.grossPnL;
        stats.netPnL += res.netPnL;
        stats.totalFees += res.totalFees;
        stats.uniqueDays.add(t.date);

        if (res.netPnL > 0) {
            stats.wins++;
            stats.winSum += res.netPnL;
            if (res.netPnL > stats.maxWin) stats.maxWin = res.netPnL;
        } else {
            stats.losses++;
            stats.lossSum += Math.abs(res.netPnL);
            if (Math.abs(res.netPnL) > stats.maxLoss) stats.maxLoss = Math.abs(res.netPnL);
        }
    });

    // Update HTML Elements
    document.getElementById('totalPnL').innerText = `₹${Calc.format(stats.grossPnL)}`;
    document.getElementById('totalTrades').innerText = trades.length;
    document.getElementById('winRate').innerText = trades.length ? Math.round((stats.wins / trades.length) * 100) + '%' : '0%';
    document.getElementById('totalTax').innerText = `₹${Calc.format(stats.totalFees)}`;
    document.getElementById('netPnL').innerText = `₹${Calc.format(stats.netPnL)}`;
    document.getElementById('taxPercentage').innerText = stats.grossPnL ? Math.round((stats.totalFees / Math.abs(stats.grossPnL)) * 100) + '%' : '0%';
    document.getElementById('tradingDays').innerText = stats.uniqueDays.size;

    document.getElementById('avgWin').innerText = `₹${Calc.format(stats.winSum / (stats.wins || 1))}`;
    document.getElementById('avgLoss').innerText = `₹${Calc.format(stats.lossSum / (stats.losses || 1))}`;
    document.getElementById('largestWin').innerText = `₹${Calc.format(stats.maxWin)}`;
    document.getElementById('largestLoss').innerText = `₹${Calc.format(stats.maxLoss)}`;
    document.getElementById('profitFactor').innerText = (stats.winSum / (stats.lossSum || 1)).toFixed(2);
}
let activeCharts = {};
// --- 4. CHART RENDERING ---
function renderDashboardCharts(trades) {
    // 1. Data Preparation: Grouping and sorting
    const sortedTrades = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Helper to cleanup existing charts
    const cleanupChart = (id) => {
        if (activeCharts[id]) {
            activeCharts[id].destroy();
        }
    };

    // --- CHART 1: EQUITY CURVE (Line) ---
    const equityCanvas = document.getElementById('equityChart');
    if (equityCanvas) {
        cleanupChart('equity');
        let cumulativeNet = 0;
        const equityData = sortedTrades.map(t => {
            cumulativeNet += Calc.tradeTaxes(t).netPnL;
            return { x: t.date, y: cumulativeNet };
        });

        activeCharts.equity = new Chart(equityCanvas.getContext('2d'), {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Net Equity (₹)',
                    data: equityData,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // --- CHART 2: DAILY P&L (Bar) ---
    const dailyCanvas = document.getElementById('dailyPnLChart');
    if (dailyCanvas) {
        cleanupChart('daily');
        const dailyMap = {};
        sortedTrades.forEach(t => {
            dailyMap[t.date] = (dailyMap[t.date] || 0) + Calc.tradeTaxes(t).netPnL;
        });

        activeCharts.daily = new Chart(dailyCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(dailyMap),
                datasets: [{
                    label: 'Daily Net P&L',
                    data: Object.values(dailyMap),
                    backgroundColor: Object.values(dailyMap).map(v => v >= 0 ? '#2ecc71' : '#e74c3c')
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // --- CHART 3: WIN/LOSS DISTRIBUTION (Doughnut) ---
    const winLossCanvas = document.getElementById('winLossChart');
    if (winLossCanvas) {
        cleanupChart('winLoss');
        const wins = trades.filter(t => Calc.tradeTaxes(t).netPnL > 0).length;
        const losses = trades.length - wins;

        activeCharts.winLoss = new Chart(winLossCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Wins', 'Losses'],
                datasets: [{
                    data: [wins, losses],
                    backgroundColor: ['#2ecc71', '#e74c3c'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
        });
    }

    // --- CHART 4: PERFORMANCE BY SYMBOL (Bar) ---
    const symbolCanvas = document.getElementById('symbolChart');
    if (symbolCanvas) {
        cleanupChart('symbol');
        const symbolMap = {};
        trades.forEach(t => {
            const sym = t.symbol || 'Unknown';
            symbolMap[sym] = (symbolMap[sym] || 0) + Calc.tradeTaxes(t).netPnL;
        });

        activeCharts.symbol = new Chart(symbolCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: Object.keys(symbolMap),
                datasets: [{
                    label: 'Total P&L per Symbol',
                    data: Object.values(symbolMap),
                    backgroundColor: '#34495e'
                }]
            },
            options: {
                indexAxis: 'y', // Makes it a horizontal bar chart for better readability of symbols
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

// --- 5. RECENT TRADES TABLE ---
function renderRecentTradesTable(trades) {
    const list = document.getElementById('recentTradesList');
    const recent = trades.slice(-10).reverse(); // Last 10 trades

    if (recent.length === 0) {
        list.innerHTML = `<tr><td colspan="7" class="text-center">No trades found in this range</td></tr>`;
        return;
    }

    list.innerHTML = recent.map(t => {
        const res = Calc.tradeTaxes(t);
        return `
            <tr>
                <td>${t.date}</td>
                <td><b>${t.symbol}</b></td>
                <td class="${t.direction.toLowerCase()}">${t.direction}</td>
                <td>₹${t.entryPrice}</td>
                <td>₹${t.exitPrice}</td>
                <td>${t.quantity}</td>
                <td class="${res.netPnL >= 0 ? 'profit' : 'loss'}">₹${Calc.format(res.netPnL)}</td>
            </tr>
        `;
    }).join('');
}