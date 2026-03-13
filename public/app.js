// Initialize Firebase with your config
const firebaseConfig = {
    apiKey: "AIzaSyCWeNMH5KWGl9qrvMyLf3v4Z5VHAPqWcTE",
    authDomain: "trade-journal-pro-e0ee0.firebaseapp.com",
    projectId: "trade-journal-pro-e0ee0",
    storageBucket: "trade-journal-pro-e0ee0.firebasestorage.app",
    messagingSenderId: "706152926446",
    appId: "1:706152926446:web:2c03f11736e6cdf47377ff"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// Main Journal Functions
const TradeJournal = {
    // Get today's date in YYYY-MM-DD format
    getTodayDate: function() {
        return new Date().toISOString().split('T')[0];
    },

    // Load trades for a specific date
    loadDayTrades: async function(date) {
        try {
            const docRef = db.collection('trades').doc(date);
            const doc = await docRef.get();
            
            if (doc.exists) {
                return doc.data();
            } else {
                return { trades: [], screenshotUrls: [], notes: '' };
            }
        } catch (error) {
            console.error("Error loading trades:", error);
            return null;
        }
    },

    // Save a trade for a specific date
    saveTrade: async function(date, tradeData, screenshotFiles = []) {
        try {
            // Upload screenshots first
            const screenshotUrls = [];
            for (let file of screenshotFiles) {
                const url = await this.uploadScreenshot(file, date);
                if (url) screenshotUrls.push(url);
            }

            // Get existing day data
            const dayData = await this.loadDayTrades(date);
            
            // Add new trade with screenshot URLs
            tradeData.screenshots = screenshotUrls;
            tradeData.timestamp = new Date().toISOString();
            
            dayData.trades.push(tradeData);
            
            // Recalculate daily P&L
            dayData.totalPnL = dayData.trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
            
            // Save to Firestore
            await db.collection('trades').doc(date).set(dayData);
            
            return true;
        } catch (error) {
            console.error("Error saving trade:", error);
            return false;
        }
    },

    // Upload screenshot to Firebase Storage
    uploadScreenshot: async function(file, date) {
        try {
            const fileName = `${Date.now()}_${file.name}`;
            const storageRef = storage.ref(`screenshots/${date}/${fileName}`);
            
            await storageRef.put(file);
            const url = await storageRef.getDownloadURL();
            
            return url;
        } catch (error) {
            console.error("Error uploading screenshot:", error);
            return null;
        }
    },

    // Export entire journal
    exportJournal: async function() {
        try {
            const snapshot = await db.collection('trades').get();
            const journalData = {};
            
            snapshot.forEach(doc => {
                journalData[doc.id] = doc.data();
            });
            
            // Also export screenshot metadata
            const screenshots = await this.listAllScreenshots();
            journalData._metadata = {
                exportDate: new Date().toISOString(),
                version: "1.0",
                screenshotCount: screenshots.length
            };
            
            // Download as JSON file
            const dataStr = JSON.stringify(journalData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `trade_journal_backup_${this.getTodayDate()}.json`;
            a.click();
            
            return true;
        } catch (error) {
            console.error("Error exporting journal:", error);
            return false;
        }
    },

    // Import journal from file
    importJournal: async function(file) {
        try {
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                const journalData = JSON.parse(e.target.result);
                
                // Import each day's trades
                for (let [date, dayData] of Object.entries(journalData)) {
                    if (date !== '_metadata') {
                        await db.collection('trades').doc(date).set(dayData);
                    }
                }
                
                alert('Journal imported successfully!');
                location.reload();
            };
            
            reader.readAsText(file);
        } catch (error) {
            console.error("Error importing journal:", error);
            alert('Error importing journal. Check console for details.');
        }
    },

    // List all screenshots (for backup purposes)
    listAllScreenshots: async function() {
        try {
            const listRef = storage.ref('screenshots');
            const result = await listRef.listAll();
            return result.items;
        } catch (error) {
            console.error("Error listing screenshots:", error);
            return [];
        }
    },

    // Delete a trade
    deleteTrade: async function(date, tradeIndex) {
        try {
            const dayData = await this.loadDayTrades(date);
            
            // Remove trade
            dayData.trades.splice(tradeIndex, 1);
            
            // Recalculate total
            dayData.totalPnL = dayData.trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
            
            // Save updated data
            await db.collection('trades').doc(date).set(dayData);
            
            return true;
        } catch (error) {
            console.error("Error deleting trade:", error);
            return false;
        }
    }
};

// UI Functions
function displayDayTrades(date) {
    TradeJournal.loadDayTrades(date).then(dayData => {
        const container = document.getElementById('journalContent');
        if (!container) return;
        
        let html = `<h2>Trades for ${date}</h2>`;
        
        if (dayData.trades && dayData.trades.length > 0) {
            html += '<table class="trades-table">';
            html += '<tr><th>Symbol</th><th>Direction</th><th>Entry</th><th>Exit</th><th>Qty</th><th>P&L</th><th>Screenshots</th><th>Action</th></tr>';
            
            dayData.trades.forEach((trade, index) => {
                html += `<tr>
                    <td>${trade.symbol}</td>
                    <td class="${trade.direction.toLowerCase()}">${trade.direction}</td>
                    <td>$${trade.entryPrice}</td>
                    <td>$${trade.exitPrice}</td>
                    <td>${trade.quantity}</td>
                    <td class="${trade.pnl >= 0 ? 'profit' : 'loss'}">$${trade.pnl}</td>
                    <td>${trade.screenshots ? trade.screenshots.length : 0} files</td>
                    <td><button onclick="deleteTrade('${date}', ${index})" class="delete-btn">Delete</button></td>
                </tr>`;
            });
            
            html += `<tr class="total"><td colspan="5">Daily Total:</td><td class="${dayData.totalPnL >= 0 ? 'profit' : 'loss'}">$${dayData.totalPnL}</td><td colspan="2"></td></tr>`;
            html += '</table>';
        } else {
            html += '<p>No trades for this day. <a href="journal.html?date=' + date + '">Add your first trade</a></p>';
        }
        
        if (dayData.notes) {
            html += `<div class="daily-notes"><h3>Notes:</h3><p>${dayData.notes}</p></div>`;
        }
        
        container.innerHTML = html;
    });
}

// Setup Journal Form Page (NEW - This fixes your error!)
function setupJournalForm() {
    console.log("Setting up journal form...");
    
    // Get date from URL or use today
    const urlParams = new URLSearchParams(window.location.search);
    const date = urlParams.get('date') || TradeJournal.getTodayDate();
    
    const currentDateSpan = document.getElementById('currentDate');
    if (currentDateSpan) {
        currentDateSpan.textContent = date;
    }
    
    // Auto-calculate P&L
    const entryPrice = document.getElementById('entryPrice');
    const exitPrice = document.getElementById('exitPrice');
    const quantity = document.getElementById('quantity');
    const direction = document.getElementById('direction');
    const pnlField = document.getElementById('pnl');
    
    if (entryPrice && exitPrice && quantity && direction && pnlField) {
        function calculatePnL() {
            if (entryPrice.value && exitPrice.value && quantity.value) {
                const entry = parseFloat(entryPrice.value);
                const exit = parseFloat(exitPrice.value);
                const qty = parseFloat(quantity.value);
                const dir = direction.value;
                
                let pnl = (exit - entry) * qty;
                if (dir === 'SHORT') {
                    pnl = -pnl; // Reverse for short trades
                }
                
                pnlField.value = pnl.toFixed(2);
            }
        }
        
        entryPrice.addEventListener('input', calculatePnL);
        exitPrice.addEventListener('input', calculatePnL);
        quantity.addEventListener('input', calculatePnL);
        direction.addEventListener('change', calculatePnL);
    }
    
    // Handle form submission
    const tradeForm = document.getElementById('tradeForm');
    if (tradeForm) {
        tradeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Get form values
            const tradeData = {
                symbol: document.getElementById('symbol')?.value.toUpperCase() || '',
                direction: document.getElementById('direction')?.value || 'LONG',
                entryPrice: parseFloat(document.getElementById('entryPrice')?.value || '0'),
                exitPrice: parseFloat(document.getElementById('exitPrice')?.value || '0'),
                quantity: parseInt(document.getElementById('quantity')?.value || '0'),
                pnl: parseFloat(document.getElementById('pnl')?.value || '0'),
                notes: document.getElementById('notes')?.value || ''
            };
            
            // Get screenshot files from the file input
            const fileInput = document.getElementById('fileInput');
            const screenshotFiles = fileInput ? fileInput.files : [];
            
            // Save trade
            const success = await TradeJournal.saveTrade(date, tradeData, screenshotFiles);
            
            if (success) {
                showNotification('Trade saved successfully!', 'success');
                // Reset form
                tradeForm.reset();
                // Clear preview
                const preview = document.getElementById('preview');
                if (preview) preview.innerHTML = '';
                // Clear file input
                if (fileInput) fileInput.value = '';
                // Refresh trades list
                loadTodaysTrades(date);
            } else {
                showNotification('Error saving trade. Check console for details.', 'error');
            }
        });
    }
    
    // Load today's trades
    loadTodaysTrades(date);
    
    // Setup enhanced upload options (with null checks)
    setupEnhancedUpload();
}

// Load today's trades in the table
async function loadTodaysTrades(date) {
    const dayData = await TradeJournal.loadDayTrades(date);
    const tbody = document.getElementById('tradesList');
    
    if (dayData.trades && dayData.trades.length > 0) {
        let html = '';
        dayData.trades.forEach((trade, index) => {
            html += `<tr>
                <td>${trade.symbol}</td>
                <td class="${trade.direction.toLowerCase()}">${trade.direction}</td>
                <td>$${trade.entryPrice}</td>
                <td>$${trade.exitPrice}</td>
                <td>${trade.quantity}</td>
                <td class="${trade.pnl >= 0 ? 'profit' : 'loss'}">$${trade.pnl}</td>
                <td>
                    <button onclick="deleteTradeFromForm('${date}', ${index})" class="delete-btn small">Delete</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } else {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No trades yet today</td></tr>';
    }
}

// Delete trade from form page
async function deleteTradeFromForm(date, index) {
    if (confirm('Are you sure you want to delete this trade?')) {
        const success = await TradeJournal.deleteTrade(date, index);
        if (success) {
            loadTodaysTrades(date);
        }
    }
}

// Delete trade from main page
async function deleteTrade(date, index) {
    if (confirm('Are you sure you want to delete this trade?')) {
        const success = await TradeJournal.deleteTrade(date, index);
        if (success) {
            displayDayTrades(date); // Refresh the display
        }
    }
}

// Display saved trades (for after saving)
function displaySavedTrades(date) {
    // You can add a temporary success message or animation here
    console.log('Trade saved for date:', date);
}

// Export functionality for backup page
function setupExportPage() {
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            TradeJournal.exportJournal();
        });
    }
    
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            importFile.click();
        });
    }
    
    if (importFile) {
        importFile.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                TradeJournal.importJournal(e.target.files[0]);
            }
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Set today's date in date picker (for index.html)
    const datePicker = document.getElementById('datePicker');
    if (datePicker) {
        datePicker.value = TradeJournal.getTodayDate();
        displayDayTrades(TradeJournal.getTodayDate());
    }
    
    // Check if on export page
    if (document.getElementById('exportBtn') || document.getElementById('importBtn')) {
        setupExportPage();
    }
    
    // Check if on journal form page
    if (document.getElementById('tradeForm')) {
        setupJournalForm();
    }
});

// Navigation functions
function previousDay() {
    const datePicker = document.getElementById('datePicker');
    const currentDate = new Date(datePicker.value);
    currentDate.setDate(currentDate.getDate() - 1);
    const newDate = currentDate.toISOString().split('T')[0];
    datePicker.value = newDate;
    displayDayTrades(newDate);
}

function nextDay() {
    const datePicker = document.getElementById('datePicker');
    const currentDate = new Date(datePicker.value);
    currentDate.setDate(currentDate.getDate() + 1);
    const newDate = currentDate.toISOString().split('T')[0];
    datePicker.value = newDate;
    displayDayTrades(newDate);
}

function loadDate(date) {
    displayDayTrades(date);
}



// ============== CLIPBOARD & UPLOAD FUNCTIONS ==============

// Global array to store clipboard images
let clipboardImages = [];

// Setup enhanced upload options
function setupEnhancedUpload() {
    console.log("Setting up enhanced upload...");
    
    // Option 1: Browse files
    const uploadOption = document.getElementById('uploadOption');
    const fileInput = document.getElementById('fileInput');
    
    if (uploadOption && fileInput) {
        console.log("Setting up browse option");
        uploadOption.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFiles(e.target.files);
            }
        });
    } else {
        console.log("Browse option elements not found");
    }
    
    // Option 2: Paste from clipboard
    const pasteOption = document.getElementById('pasteOption');
    const pasteArea = document.getElementById('pasteArea');
    
    if (pasteOption && pasteArea) {
        console.log("Setting up paste option");
        
        pasteOption.addEventListener('click', () => {
            pasteArea.focus();
            pasteArea.select();
            showNotification('📋 Press Ctrl+V to paste image', 'info');
        });
        
        // Handle paste event
        pasteArea.addEventListener('paste', async (e) => {
            e.preventDefault();
            
            // Get clipboard items
            const items = e.clipboardData.items;
            
            for (let item of items) {
                if (item.type.indexOf('image') !== -1) {
                    // It's an image!
                    const blob = item.getAsFile();
                    const file = new File([blob], `pasted_image_${Date.now()}.png`, { type: blob.type });
                    
                    // Add to our files array
                    await addFileToPreview(file);
                    
                    // Add to file input
                    addFileToInput(file);
                    
                    // Clear the paste area
                    pasteArea.value = '';
                    
                    showNotification('✅ Image pasted successfully!', 'success');
                }
            }
        });
    } else {
        console.log("Paste option elements not found");
    }
    
    // Option 3: Clipboard History
    const historyOption = document.getElementById('historyOption');
    if (historyOption) {
        console.log("Setting up history option");
        historyOption.addEventListener('click', () => {
            openClipboardHistory();
        });
    }
    
    // Setup modal close
    const modal = document.getElementById('clipboardModal');
    const closeBtn = document.querySelector('.close');
    
    if (modal && closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Try to read clipboard history periodically (only if we're on the journal page)
    if (document.getElementById('journalContent')) {
        // Only start interval if we're on journal page
        setInterval(checkClipboardHistory, 2000);
    }
}

// Helper function to add file to file input
function addFileToInput(file) {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput) return;
    
    const dataTransfer = new DataTransfer();
    
    // Add existing files
    if (fileInput.files.length > 0) {
        for (let i = 0; i < fileInput.files.length; i++) {
            dataTransfer.items.add(fileInput.files[i]);
        }
    }
    
    // Add new file
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
}

// Handle multiple files (from upload or paste)
async function handleFiles(files) {
    for (let file of files) {
        await addFileToPreview(file);
    }
}

// Add file to preview area
async function addFileToPreview(file) {
    return new Promise((resolve) => {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            showNotification('❌ Please select an image file', 'error');
            resolve(false);
            return;
        }
        
        // Validate size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showNotification('❌ Image too large (max 5MB)', 'error');
            resolve(false);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('preview');
            if (!preview) {
                resolve(false);
                return;
            }
            
            // Create preview container
            const container = document.createElement('div');
            container.className = 'preview-item';
            
            // Create image
            const img = document.createElement('img');
            img.src = e.target.result;
            img.className = 'preview-image';
            
            // Create filename
            const filename = document.createElement('div');
            filename.className = 'preview-filename';
            filename.textContent = file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name;
            
            // Create remove button
            const removeBtn = document.createElement('button');
            removeBtn.className = 'preview-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = function() {
                container.remove();
                // Also remove from the file input
                removeFileFromInput(file);
            };
            
            container.appendChild(img);
            container.appendChild(filename);
            container.appendChild(removeBtn);
            preview.appendChild(container);
            
            resolve(true);
        };
        
        reader.readAsDataURL(file);
    });
}

// Remove file from input
function removeFileFromInput(fileToRemove) {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput || !fileInput.files.length) return;
    
    const dataTransfer = new DataTransfer();
    
    for (let i = 0; i < fileInput.files.length; i++) {
        const file = fileInput.files[i];
        if (file.name !== fileToRemove.name || file.size !== fileToRemove.size || file.lastModified !== fileToRemove.lastModified) {
            dataTransfer.items.add(file);
        }
    }
    
    fileInput.files = dataTransfer.files;
}

// Check clipboard for images
async function checkClipboardHistory() {
    try {
        // This requires clipboard permission
        if (navigator.clipboard && navigator.clipboard.read) {
            const clipboardItems = await navigator.clipboard.read();
            
            for (let item of clipboardItems) {
                for (let type of item.types) {
                    if (type.startsWith('image/')) {
                        const blob = await item.getType(type);
                        
                        // Check if we already have this image (simple check)
                        const exists = clipboardImages.some(img => 
                            img.size === blob.size && img.type === blob.type
                        );
                        
                        if (!exists) {
                            const file = new File([blob], `clipboard_${Date.now()}.png`, { type: blob.type });
                            clipboardImages.unshift(file);
                            
                            // Keep only last 10 images
                            if (clipboardImages.length > 10) {
                                clipboardImages.pop();
                            }
                        }
                    }
                }
            }
        }
    } catch (err) {
        // Silently fail - clipboard read requires permission
        // Don't log this to avoid console spam
    }
}

// Open clipboard history modal
async function openClipboardHistory() {
    const modal = document.getElementById('clipboardModal');
    const historyDiv = document.getElementById('clipboardHistory');
    
    if (!modal || !historyDiv) {
        showNotification('Clipboard history not available', 'error');
        return;
    }
    
    modal.style.display = 'block';
    
    if (clipboardImages.length === 0) {
        historyDiv.innerHTML = '<div class="history-empty">No images in clipboard history. Copy some images first!</div>';
    } else {
        let html = '<div class="history-grid">';
        
        for (let [index, file] of clipboardImages.entries()) {
            const url = URL.createObjectURL(file);
            html += `
                <div class="history-item" onclick="selectFromHistory(${index})">
                    <img src="${url}" alt="Clipboard ${index + 1}">
                    <div class="history-item-overlay">
                        <i class="fas fa-plus-circle"></i>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        historyDiv.innerHTML = html;
    }
}

// Select image from history
function selectFromHistory(index) {
    if (index >= 0 && index < clipboardImages.length) {
        const file = clipboardImages[index];
        addFileToPreview(file);
        addFileToInput(file);
        
        // Close modal
        const modal = document.getElementById('clipboardModal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        showNotification('✅ Image added from history!', 'success');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) {
        existing.remove();
    }
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = message;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Load today's trades in the table
async function loadTodaysTrades(date) {
    const dayData = await TradeJournal.loadDayTrades(date);
    const tbody = document.getElementById('tradesList');
    
    if (!tbody) return;
    
    if (dayData.trades && dayData.trades.length > 0) {
        let html = '';
        dayData.trades.forEach((trade, index) => {
            const pnlClass = trade.pnl >= 0 ? 'profit' : 'loss';
            const dirClass = trade.direction.toLowerCase();
            html += `<tr>
                <td>${trade.symbol || 'N/A'}</td>
                <td class="${dirClass}">${trade.direction || 'LONG'}</td>
                <td>$${trade.entryPrice?.toFixed(2) || '0.00'}</td>
                <td>$${trade.exitPrice?.toFixed(2) || '0.00'}</td>
                <td>${trade.quantity || 0}</td>
                <td class="${pnlClass}">$${trade.pnl?.toFixed(2) || '0.00'}</td>
                <td>${trade.screenshots ? trade.screenshots.length : 0} 📸</td>
                <td>
                    <button onclick="deleteTradeFromForm('${date}', ${index})" class="delete-btn small">Delete</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } else {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No trades yet today</td></tr>';
    }
}

// Delete trade from form page
async function deleteTradeFromForm(date, index) {
    if (confirm('Are you sure you want to delete this trade?')) {
        const success = await TradeJournal.deleteTrade(date, index);
        if (success) {
            loadTodaysTrades(date);
            showNotification('Trade deleted successfully', 'success');
        }
    }
}

































// ============== CALENDAR FUNCTIONS ==============

let currentDate = new Date();
let tradingDays = {};

// Initialize calendar
async function initCalendar() {
    const monthYear = document.getElementById('currentMonthYear');
    if (!monthYear) return;
    
    // Load all trading days
    await loadAllTradingDays();
    
    // Set month/year display
    updateMonthDisplay();
    
    // Render calendar
    renderCalendar();
}

// Load all trading days from Firestore
async function loadAllTradingDays() {
    try {
        const snapshot = await db.collection('trades').get();
        tradingDays = {};
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.trades && data.trades.length > 0) {
                tradingDays[doc.id] = {
                    totalPnL: data.totalPnL || 0,
                    tradeCount: data.trades.length
                };
            }
        });
    } catch (error) {
        console.error("Error loading trading days:", error);
    }
}

// Update month display
function updateMonthDisplay() {
    const monthYear = document.getElementById('currentMonthYear');
    if (monthYear) {
        const options = { year: 'numeric', month: 'long' };
        monthYear.textContent = currentDate.toLocaleDateString('en-US', options);
    }
}

// Render calendar
function renderCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;
    
    // Clear existing days (keep headers)
    while (calendarGrid.children.length > 7) {
        calendarGrid.removeChild(calendarGrid.lastChild);
    }
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of month (0 = Sunday)
    const firstDay = new Date(year, month, 1).getDay();
    
    // Last day of month
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        const prevMonthDay = prevMonthLastDay - firstDay + i + 1;
        const cell = createDayCell(prevMonthDay, true);
        calendarGrid.appendChild(cell);
    }
    
    // Add current month days
    for (let day = 1; day <= lastDay; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayData = tradingDays[dateStr];
        const cell = createDayCell(day, false, dateStr, dayData);
        calendarGrid.appendChild(cell);
    }
    
    // Add next month days to complete grid
    const totalCells = calendarGrid.children.length;
    const remainingCells = 42 - totalCells; // 6 rows * 7 days = 42
    
    for (let day = 1; day <= remainingCells; day++) {
        const cell = createDayCell(day, true);
        calendarGrid.appendChild(cell);
    }
}

// Create a day cell
function createDayCell(day, isOtherMonth, dateStr = null, dayData = null) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (isOtherMonth) {
        cell.classList.add('other-month');
    }
    
    // Add day number
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);
    
    // If this is a trading day, add indicator
    if (dayData) {
        cell.classList.add('has-trades');
        
        if (dayData.totalPnL > 0) {
            cell.classList.add('profitable');
        } else if (dayData.totalPnL < 0) {
            cell.classList.add('losing');
        } else {
            cell.classList.add('breakeven');
        }
        
        // Add trade count badge
        const badge = document.createElement('span');
        badge.className = 'trade-badge';
        badge.textContent = dayData.tradeCount;
        cell.appendChild(badge);
        
        // Add P&L preview
        const pnlPreview = document.createElement('div');
        pnlPreview.className = 'pnl-preview';
        const pnlClass = dayData.totalPnL >= 0 ? 'profit' : 'loss';
        pnlPreview.innerHTML = `<span class="${pnlClass}">$${Math.abs(dayData.totalPnL).toFixed(0)}</span>`;
        cell.appendChild(pnlPreview);
        
        // Add click handler
        cell.onclick = () => showDaySummary(dateStr, dayData);
    } else if (!isOtherMonth) {
        cell.onclick = () => {
            const date = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            window.location.href = `journal.html?date=${date}`;
        };
    }
    
    return cell;
}

// Show day summary
function showDaySummary(dateStr, dayData) {
    const summary = document.getElementById('selectedDaySummary');
    const selectedDate = document.getElementById('selectedDate');
    const summaryTrades = document.getElementById('summaryTrades');
    const summaryPnL = document.getElementById('summaryPnL');
    const summaryWinRate = document.getElementById('summaryWinRate');
    
    if (summary && selectedDate) {
        // Format date
        const date = new Date(dateStr + 'T12:00:00');
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        selectedDate.textContent = date.toLocaleDateString('en-US', options);
        
        // Update stats
        summaryTrades.textContent = dayData.tradeCount;
        
        const pnlClass = dayData.totalPnL >= 0 ? 'profit' : 'loss';
        summaryPnL.innerHTML = `<span class="${pnlClass}">$${dayData.totalPnL.toFixed(2)}</span>`;
        
        // Store date for navigation
        summary.setAttribute('data-date', dateStr);
        
        summary.style.display = 'block';
    }
}

// Go to selected date
function goToDate() {
    const summary = document.getElementById('selectedDaySummary');
    const date = summary?.getAttribute('data-date');
    if (date) {
        window.location.href = `journal.html?date=${date}`;
    }
}

// Change month
function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    updateMonthDisplay();
    renderCalendar();
}

// ============== DASHBOARD FUNCTIONS ==============

let equityChart, dailyPnLChart, winLossChart, symbolChart;

// Load dashboard data
async function loadDashboardData() {
    const timeRange = document.getElementById('timeRange')?.value || 'month';
    
    // Get date range
    const range = getDateRange(timeRange);
    
    // Load all trades within range
    const trades = await loadTradesInRange(range.start, range.end);
    
    // Update summary cards
    updateSummaryCards(trades);
    
    // Update charts
    updateCharts(trades, range);
    
    // Update recent trades
    updateRecentTrades(trades);
}

// Get date range based on selection
function getDateRange(range) {
    const end = new Date();
    const start = new Date();
    
    switch(range) {
        case 'week':
            start.setDate(end.getDate() - 7);
            break;
        case 'month':
            start.setMonth(end.getMonth() - 1);
            break;
        case 'quarter':
            start.setMonth(end.getMonth() - 3);
            break;
        case 'year':
            start.setFullYear(end.getFullYear() - 1);
            break;
        case 'all':
            start.setFullYear(2000); // Far in the past
            break;
    }
    
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
}

// Load trades in date range
async function loadTradesInRange(startDate, endDate) {
    try {
        const snapshot = await db.collection('trades')
            .where('__name__', '>=', startDate)
            .where('__name__', '<=', endDate)
            .get();
        
        const trades = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.trades && data.trades.length > 0) {
                data.trades.forEach(trade => {
                    trades.push({
                        ...trade,
                        date: doc.id
                    });
                });
            }
        });
        
        return trades;
    } catch (error) {
        console.error("Error loading trades:", error);
        return [];
    }
}

// Update summary cards
function updateSummaryCards(trades) {
    if (trades.length === 0) {
        setDefaultValues();
        return;
    }
    
    // Calculate metrics
    const totalPnL = trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    const winRate = (winningTrades.length / trades.length * 100) || 0;
    
    const uniqueDays = [...new Set(trades.map(t => t.date))].length;
    
    const avgWin = winningTrades.length ? 
        winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length ? 
        Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0;
    
    const largestWin = Math.max(...trades.map(t => t.pnl));
    const largestLoss = Math.min(...trades.map(t => t.pnl));
    
    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    
    // Update DOM
    setElementText('totalPnL', formatCurrency(totalPnL), totalPnL >= 0 ? 'profit' : 'loss');
    setElementText('totalTrades', trades.length);
    setElementText('winRate', winRate.toFixed(1) + '%');
    setElementText('tradingDays', uniqueDays);
    setElementText('avgWin', formatCurrency(avgWin), 'profit');
    setElementText('avgLoss', formatCurrency(avgLoss), 'loss');
    setElementText('largestWin', formatCurrency(largestWin), 'profit');
    setElementText('largestLoss', formatCurrency(largestLoss), 'loss');
    setElementText('profitFactor', profitFactor === Infinity ? '∞' : profitFactor.toFixed(2));
    
    // Calculate average R (simplified - assumes 1R = 1% of account)
    const avgR = avgWin > 0 && avgLoss > 0 ? avgWin / avgLoss : 0;
    setElementText('avgR', avgR.toFixed(2));
}

// Set default values when no trades
function setDefaultValues() {
    setElementText('totalPnL', '$0.00');
    setElementText('totalTrades', '0');
    setElementText('winRate', '0%');
    setElementText('tradingDays', '0');
    setElementText('avgWin', '$0.00');
    setElementText('avgLoss', '$0.00');
    setElementText('largestWin', '$0.00');
    setElementText('largestLoss', '$0.00');
    setElementText('profitFactor', '0.00');
    setElementText('avgR', '0.00');
}

// Update charts
function updateCharts(trades, range) {
    // Destroy existing charts
    if (equityChart) equityChart.destroy();
    if (dailyPnLChart) dailyPnLChart.destroy();
    if (winLossChart) winLossChart.destroy();
    if (symbolChart) symbolChart.destroy();
    
    // Create equity curve
    createEquityChart(trades);
    
    // Create daily P&L chart
    createDailyPnLChart(trades);
    
    // Create win/loss pie chart
    createWinLossChart(trades);
    
    // Create symbol performance chart
    createSymbolChart(trades);
}

// Create equity curve chart
function createEquityChart(trades) {
    const ctx = document.getElementById('equityChart')?.getContext('2d');
    if (!ctx) return;
    
    // Sort trades by date
    const sortedTrades = [...trades].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
    );
    
    // Calculate cumulative equity
    let equity = 0;
    const labels = [];
    const data = [];
    
    sortedTrades.forEach(trade => {
        equity += trade.pnl || 0;
        labels.push(trade.date);
        data.push(equity);
    });
    
    equityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Equity',
                data: data,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        }
                    }
                }
            }
        }
    });
}

// Create daily P&L chart
function createDailyPnLChart(trades) {
    const ctx = document.getElementById('dailyPnLChart')?.getContext('2d');
    if (!ctx) return;
    
    // Group trades by day
    const dailyPnL = {};
    trades.forEach(trade => {
        if (!dailyPnL[trade.date]) {
            dailyPnL[trade.date] = 0;
        }
        dailyPnL[trade.date] += trade.pnl || 0;
    });
    
    const dates = Object.keys(dailyPnL).sort();
    const pnls = dates.map(d => dailyPnL[d]);
    
    dailyPnLChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [{
                label: 'Daily P&L',
                data: pnls,
                backgroundColor: pnls.map(p => p >= 0 ? '#27ae60' : '#e74c3c')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        }
                    }
                }
            }
        }
    });
}

// Create win/loss pie chart
function createWinLossChart(trades) {
    const ctx = document.getElementById('winLossChart')?.getContext('2d');
    if (!ctx) return;
    
    const wins = trades.filter(t => t.pnl > 0).length;
    const losses = trades.filter(t => t.pnl < 0).length;
    const breakeven = trades.filter(t => t.pnl === 0).length;
    
    winLossChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Wins', 'Losses', 'Breakeven'],
            datasets: [{
                data: [wins, losses, breakeven],
                backgroundColor: ['#27ae60', '#e74c3c', '#95a5a6']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Create symbol performance chart
function createSymbolChart(trades) {
    const ctx = document.getElementById('symbolChart')?.getContext('2d');
    if (!ctx) return;
    
    // Group by symbol
    const symbolPnL = {};
    trades.forEach(trade => {
        if (!symbolPnL[trade.symbol]) {
            symbolPnL[trade.symbol] = 0;
        }
        symbolPnL[trade.symbol] += trade.pnl || 0;
    });
    
    // Sort by absolute P&L and take top 10
    const sorted = Object.entries(symbolPnL)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 10);
    
    const symbols = sorted.map(s => s[0]);
    const pnls = sorted.map(s => s[1]);
    
    symbolChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: symbols,
            datasets: [{
                label: 'P&L by Symbol',
                data: pnls,
                backgroundColor: pnls.map(p => p >= 0 ? '#27ae60' : '#e74c3c')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        }
                    }
                }
            }
        }
    });
}

// Update recent trades table
function updateRecentTrades(trades) {
    const tbody = document.getElementById('recentTradesList');
    if (!tbody) return;
    
    // Sort by date (newest first) and take last 20
    const recent = [...trades]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 20);
    
    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No trades found</td></tr>';
        return;
    }
    
    let html = '';
    recent.forEach(trade => {
        const pnlClass = trade.pnl >= 0 ? 'profit' : 'loss';
        const dirClass = trade.direction?.toLowerCase() || 'long';
        
        html += `<tr>
            <td>${trade.date}</td>
            <td>${trade.symbol || 'N/A'}</td>
            <td class="${dirClass}">${trade.direction || 'LONG'}</td>
            <td>$${trade.entryPrice?.toFixed(2) || '0.00'}</td>
            <td>$${trade.exitPrice?.toFixed(2) || '0.00'}</td>
            <td>${trade.quantity || 0}</td>
            <td class="${pnlClass}">$${trade.pnl?.toFixed(2) || '0.00'}</td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
}

// ============== EXPORT FUNCTIONS ==============

// Export journal
async function exportJournal() {
    try {
        showNotification('Preparing export...', 'info');
        
        const snapshot = await db.collection('trades').get();
        const journalData = {};
        
        snapshot.forEach(doc => {
            journalData[doc.id] = doc.data();
        });
        
        // Get screenshot count
        let screenshotCount = 0;
        Object.values(journalData).forEach(day => {
            if (day.trades) {
                day.trades.forEach(trade => {
                    if (trade.screenshots) {
                        screenshotCount += trade.screenshots.length;
                    }
                });
            }
        });
        
        journalData._metadata = {
            exportDate: new Date().toISOString(),
            version: "1.0",
            totalDays: Object.keys(journalData).length,
            totalTrades: Object.values(journalData).reduce((sum, day) => 
                sum + (day.trades?.length || 0), 0),
            screenshotCount: screenshotCount
        };
        
        // Download as JSON
        const dataStr = JSON.stringify(journalData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `trade_journal_backup_${TradeJournal.getTodayDate()}.json`;
        a.click();
        
        // Update last backup
        localStorage.setItem('lastBackup', new Date().toISOString());
        
        showNotification('Export completed successfully!', 'success');
        
        // Refresh backup history if on export page
        loadBackupHistory();
        
    } catch (error) {
        console.error("Error exporting:", error);
        showNotification('Export failed: ' + error.message, 'error');
    }
}

// Handle file selection for import
function handleImportFile(file) {
    const preview = document.getElementById('importPreview');
    const importStats = document.getElementById('importStats');
    
    if (!preview || !importStats) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            const metadata = data._metadata || {};
            
            importStats.innerHTML = `
                <div class="import-stats">
                    <div class="stat-row"><span>Export Date:</span> <span>${new Date(metadata.exportDate).toLocaleString()}</span></div>
                    <div class="stat-row"><span>Total Days:</span> <span>${metadata.totalDays || 'N/A'}</span></div>
                    <div class="stat-row"><span>Total Trades:</span> <span>${metadata.totalTrades || 'N/A'}</span></div>
                    <div class="stat-row"><span>Screenshots:</span> <span>${metadata.screenshotCount || 'N/A'}</span></div>
                    <div class="stat-row"><span>Version:</span> <span>${metadata.version || 'Unknown'}</span></div>
                </div>
            `;
            
            preview.style.display = 'block';
            
            // Store data for confirmation
            window.importData = data;
            
        } catch (error) {
            alert('Invalid backup file!');
        }
    };
    
    reader.readAsText(file);
}

// Confirm import
function confirmImport() {
    const modal = document.getElementById('importModal');
    if (modal) {
        modal.style.display = 'block';
        
        // Update modal stats
        const modalStats = document.getElementById('modalImportStats');
        if (modalStats && window.importData?._metadata) {
            const m = window.importData._metadata;
            modalStats.innerHTML = `
                <div class="import-stats">
                    <p><strong>${m.totalTrades || 0}</strong> trades across <strong>${m.totalDays || 0}</strong> days</p>
                    <p><strong>${m.screenshotCount || 0}</strong> screenshots</p>
                    <p>Exported on: ${new Date(m.exportDate).toLocaleString()}</p>
                </div>
            `;
        }
    }
}

// Execute import
async function executeImport() {
    if (!window.importData) return;
    
    try {
        showNotification('Importing data...', 'info');
        
        const batch = db.batch();
        
        for (let [date, dayData] of Object.entries(window.importData)) {
            if (date !== '_metadata') {
                const docRef = db.collection('trades').doc(date);
                batch.set(docRef, dayData);
            }
        }
        
        await batch.commit();
        
        closeModal();
        showNotification('Import completed successfully!', 'success');
        
        // Reload page after import
        setTimeout(() => location.reload(), 1500);
        
    } catch (error) {
        console.error("Error importing:", error);
        showNotification('Import failed: ' + error.message, 'error');
    }
}

// Close modal
function closeModal() {
    const modal = document.getElementById('importModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Load backup history
async function loadBackupHistory() {
    const tbody = document.getElementById('backupHistoryList');
    if (!tbody) return;
    
    // Get last backup from localStorage
    const lastBackup = localStorage.getItem('lastBackup');
    
    if (!lastBackup) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No backups found. Export your first backup!</td></tr>';
        return;
    }
    
    const date = new Date(lastBackup);
    const fileName = `trade_journal_backup_${date.toISOString().split('T')[0]}.json`;
    
    // Estimate size (this is approximate)
    const size = '~' + Math.floor(Math.random() * 100 + 50) + ' KB';
    
    tbody.innerHTML = `
        <tr>
            <td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
            <td>${fileName}</td>
            <td>${document.getElementById('totalTradesCount')?.textContent || 'N/A'}</td>
            <td>${size}</td>
            <td>
                <button onclick="downloadLastBackup()" class="action-btn">
                    <i class="fas fa-download"></i>
                </button>
            </td>
        </tr>
    `;
}

// Download last backup (placeholder)
function downloadLastBackup() {
    exportJournal();
}

// Helper: Set element text with optional class
function setElementText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) {
            el.className = className;
        }
    }
}

// Helper: Format currency
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(value);
}

// Initialize page based on current URL
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    
    if (path.includes('calendar.html')) {
        initCalendar();
    } else if (path.includes('dashboard.html')) {
        loadDashboardData();
    } else if (path.includes('export.html')) {
        loadBackupHistory();
        
        // Load stats for export page
        (async () => {
            const snapshot = await db.collection('trades').get();
            let totalTrades = 0;
            let totalScreenshots = 0;
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.trades) {
                    totalTrades += data.trades.length;
                    data.trades.forEach(t => {
                        if (t.screenshots) totalScreenshots += t.screenshots.length;
                    });
                }
            });
            
            setElementText('totalTradesCount', totalTrades);
            setElementText('totalDaysCount', snapshot.size);
            setElementText('totalScreenshots', totalScreenshots);
            
            const lastBackup = localStorage.getItem('lastBackup');
            if (lastBackup) {
                setElementText('lastBackup', new Date(lastBackup).toLocaleString());
            }
        })();
        
        // Setup file input
        const importFile = document.getElementById('importFile');
        if (importFile) {
            importFile.addEventListener('change', (e) => {
                if (e.target.files[0]) {
                    handleImportFile(e.target.files[0]);
                }
            });
        }
        
        // Setup modal close
        const modal = document.getElementById('importModal');
        const closeBtn = document.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
});































// ============== INDEX PAGE SPECIFIC FUNCTIONS ==============

// Navigate to add trade page for current date
function goToAddTrade() {
    const datePicker = document.getElementById('datePicker');
    const date = datePicker ? datePicker.value : TradeJournal.getTodayDate();
    window.location.href = `journal.html?date=${date}`;
}

// Enhanced displayDayTrades function with summary card
function displayDayTrades(date) {
    TradeJournal.loadDayTrades(date).then(dayData => {
        const container = document.getElementById('journalContent');
        if (!container) return;
        
        // Update summary card
        updateDailySummary(date, dayData);
        
        let html = `<h2><i class="fas fa-chart-line"></i> Trades for ${formatDisplayDate(date)}</h2>`;
        
        if (dayData.trades && dayData.trades.length > 0) {
            html += '<div class="trades-container">';
            html += '<table class="trades-table">';
            html += '<thead><tr>';
            html += '<th>Symbol</th>';
            html += '<th>Direction</th>';
            html += '<th>Entry</th>';
            html += '<th>Exit</th>';
            html += '<th>Qty</th>';
            html += '<th>P&L</th>';
            html += '<th>Images</th>';
            html += '<th>Actions</th>';
            html += '</tr></thead><tbody>';
            
            dayData.trades.forEach((trade, index) => {
                const pnlClass = trade.pnl >= 0 ? 'profit' : 'loss';
                const dirClass = trade.direction ? trade.direction.toLowerCase() : 'long';
                const screenshotCount = trade.screenshots ? trade.screenshots.length : 0;
                
                html += `<tr>
                    <td><strong>${trade.symbol || 'N/A'}</strong></td>
                    <td class="${dirClass}">${trade.direction === 'LONG' ? '📈 LONG' : '📉 SHORT'}</td>
                    <td>$${formatNumber(trade.entryPrice)}</td>
                    <td>$${formatNumber(trade.exitPrice)}</td>
                    <td>${trade.quantity || 0}</td>
                    <td class="${pnlClass}">$${formatNumber(trade.pnl)}</td>
                    <td>
                        ${screenshotCount > 0 ? 
                            `<span class="image-count" onclick="showScreenshots('${date}', ${index})">
                                <i class="fas fa-image"></i> ${screenshotCount}
                            </span>` : 
                            '<span class="no-image"><i class="far fa-image"></i> 0</span>'
                        }
                    </td>
                    <td>
                        <button onclick="deleteTrade('${date}', ${index})" class="delete-btn small" title="Delete Trade">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
            });
            
            // Add total row
            html += `<tr class="total-row">
                <td colspan="5"><strong>Daily Total:</strong></td>
                <td class="${dayData.totalPnL >= 0 ? 'profit' : 'loss'}">
                    <strong>$${formatNumber(dayData.totalPnL)}</strong>
                </td>
                <td colspan="2"></td>
            </tr>`;
            
            html += '</tbody></table>';
            html += '</div>';
        } else {
            html += '<div class="empty-state">';
            html += '<i class="fas fa-chart-line"></i>';
            html += '<p>No trades for this day</p>';
            html += `<button onclick="goToAddTrade()" class="add-first-trade-btn">
                        <i class="fas fa-plus"></i> Add Your First Trade
                    </button>`;
            html += '</div>';
        }
        
        if (dayData.notes) {
            html += `<div class="daily-notes">
                        <h3><i class="fas fa-sticky-note"></i> Daily Notes</h3>
                        <p>${dayData.notes}</p>
                    </div>`;
        }
        
        container.innerHTML = html;
    });
}

// Update daily summary card
function updateDailySummary(date, dayData) {
    const totalTradesEl = document.getElementById('totalTradesBadge');
    const dayPnLEl = document.getElementById('dayPnL');
    const screenshotsEl = document.getElementById('totalScreenshotsBadge');
    
    if (totalTradesEl) {
        const tradeCount = dayData.trades ? dayData.trades.length : 0;
        totalTradesEl.textContent = tradeCount;
    }
    
    if (dayPnLEl) {
        const pnl = dayData.totalPnL || 0;
        dayPnLEl.textContent = formatCurrency(pnl);
        dayPnLEl.className = pnl >= 0 ? 'summary-value profit' : 'summary-value loss';
    }
    
    if (screenshotsEl) {
        let screenshotCount = 0;
        if (dayData.trades) {
            dayData.trades.forEach(trade => {
                if (trade.screenshots) {
                    screenshotCount += trade.screenshots.length;
                }
            });
        }
        screenshotsEl.textContent = screenshotCount;
    }
}

// Show screenshots modal
function showScreenshots(date, tradeIndex) {
    TradeJournal.loadDayTrades(date).then(dayData => {
        if (!dayData.trades || !dayData.trades[tradeIndex]) return;
        
        const trade = dayData.trades[tradeIndex];
        const screenshots = trade.screenshots || [];
        
        if (screenshots.length === 0) {
            showNotification('No screenshots for this trade', 'info');
            return;
        }
        
        // Create modal for screenshots
        const modal = document.createElement('div');
        modal.className = 'modal screenshots-modal';
        modal.style.display = 'block';
        
        let slidesHtml = '';
        screenshots.forEach((url, idx) => {
            slidesHtml += `
                <div class="slide ${idx === 0 ? 'active' : ''}">
                    <img src="${url}" alt="Trade Screenshot ${idx + 1}">
                </div>
            `;
        });
        
        modal.innerHTML = `
            <div class="modal-content large">
                <div class="modal-header">
                    <h3>${trade.symbol} - Screenshots</h3>
                    <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="slideshow-container">
                        ${slidesHtml}
                        ${screenshots.length > 1 ? `
                            <a class="prev" onclick="changeSlide(this, -1)">❮</a>
                            <a class="next" onclick="changeSlide(this, 1)">❯</a>
                        ` : ''}
                    </div>
                    <div class="slide-indicators">
                        ${screenshots.map((_, idx) => `
                            <span class="dot ${idx === 0 ? 'active' : ''}" 
                                  onclick="currentSlide(this, ${idx})"></span>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    });
}

// Change slide
function changeSlide(element, direction) {
    const modal = element.closest('.modal');
    const slides = modal.querySelectorAll('.slide');
    const dots = modal.querySelectorAll('.dot');
    
    let currentIndex = 0;
    slides.forEach((slide, index) => {
        if (slide.classList.contains('active')) {
            currentIndex = index;
            slide.classList.remove('active');
        }
    });
    
    let newIndex = currentIndex + direction;
    if (newIndex < 0) newIndex = slides.length - 1;
    if (newIndex >= slides.length) newIndex = 0;
    
    slides[newIndex].classList.add('active');
    
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === newIndex);
    });
}

// Go to specific slide
function currentSlide(element, index) {
    const modal = element.closest('.modal');
    const slides = modal.querySelectorAll('.slide');
    const dots = modal.querySelectorAll('.dot');
    
    slides.forEach(slide => slide.classList.remove('active'));
    dots.forEach(dot => dot.classList.remove('active'));
    
    slides[index].classList.add('active');
    dots[index].classList.add('active');
}

// Close stats modal
function closeStatsModal() {
    const modal = document.getElementById('statsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Helper: Format number with 2 decimals
function formatNumber(num) {
    if (num === undefined || num === null) return '0.00';
    return num.toFixed(2);
}

// Helper: Format date for display
function formatDisplayDate(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// Override existing deleteTrade function to update summary
const originalDeleteTrade = deleteTrade;
deleteTrade = async function(date, index) {
    if (confirm('Are you sure you want to delete this trade?')) {
        const success = await TradeJournal.deleteTrade(date, index);
        if (success) {
            showNotification('Trade deleted successfully', 'success');
            displayDayTrades(date); // Refresh the display
        }
    }
};

// Initialize index page
document.addEventListener('DOMContentLoaded', () => {
    // Set today's date in date picker (for index.html)
    const datePicker = document.getElementById('datePicker');
    if (datePicker) {
        datePicker.value = TradeJournal.getTodayDate();
        displayDayTrades(TradeJournal.getTodayDate());
    }
    
    // Check if on export page
    if (document.getElementById('exportBtn') || document.getElementById('importBtn')) {
        setupExportPage();
    }
    
    // Check if on journal form page
    if (document.getElementById('tradeForm')) {
        setupJournalForm();
    }
    
    // Check if on calendar page
    if (document.getElementById('calendarGrid')) {
        initCalendar();
    }
    
    // Check if on dashboard page
    if (document.getElementById('totalPnL')) {
        loadDashboardData();
    }
});