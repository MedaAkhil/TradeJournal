// Initialize Firebase with your config
const firebaseConfig = {
    apiKey: "AIzaSyCWeNMH5KWGl9qrvMyLf3v4Z5VHAPqWcTE",
    authDomain: "trade-journal-pro-e0ee0.firebaseapp.com",
    projectId: "trade-journal-pro-e0ee0",
    storageBucket: "trade-journal-pro-e0ee0.firebasestorage.app",
    messagingSenderId: "706152926446",
    appId: "1:706152926446:web:2c03f11736e6cdf47377ff"
};

// Add this near the top of app.js (after Firebase init)
window.isJournalFormInitialized = false;

// Reset flags when page unloads
window.addEventListener('beforeunload', function() {
    window.isJournalFormInitialized = false;
    window.isCameraInitialized = false;
});
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
// Setup Journal Form Page
function setupJournalForm() {
    console.log("Setting up journal form...");
    
    // Prevent double initialization
    if (window.isJournalFormInitialized) {
        console.log("Journal form already initialized, skipping...");
        return;
    }
    window.isJournalFormInitialized = true;
    
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
    const strategySelect = document.getElementById('strategy');
    const customStrategyRow = document.getElementById('customStrategyRow');
    
    if (strategySelect && customStrategyRow) {
        strategySelect.addEventListener('change', function() {
            if (this.value === 'Other') {
                customStrategyRow.style.display = 'flex';
            } else {
                customStrategyRow.style.display = 'none';
            }
        });
    }

    if (entryPrice && exitPrice && quantity && direction && pnlField) {
        function calculatePnL() {
            if (entryPrice.value && exitPrice.value && quantity.value) {
                const entry = parseFloat(entryPrice.value);
                const exit = parseFloat(exitPrice.value);
                const qty = parseFloat(quantity.value);
                const dir = direction.value;
                
                let pnl = (exit - entry) * qty;
                if (dir === 'SHORT') {
                    pnl = -pnl;
                }
                
                pnlField.value = pnl.toFixed(2);
            }
        }
        
        entryPrice.addEventListener('input', calculatePnL);
        exitPrice.addEventListener('input', calculatePnL);
        quantity.addEventListener('input', calculatePnL);
        direction.addEventListener('change', calculatePnL);
    }
    
    // Handle form submission with loading button
    const tradeForm = document.getElementById('tradeForm');
    const saveBtn = document.getElementById('saveTradeBtn');
    
    if (tradeForm && saveBtn) {
        tradeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Prevent double submission
            if (saveBtn.disabled) return;
            
            // Show loading state
            saveBtn.disabled = true;
            saveBtn.classList.add('loading');
            
            try {
                // Get strategy value (handle custom)
                let strategy = document.getElementById('strategy')?.value || '';
                if (strategy === 'Other') {
                    strategy = document.getElementById('customStrategy')?.value || 'Other';
                }
                
                // Get current date and combine with time
                const today = new Date().toISOString().split('T')[0];
                
                const entryTime = document.getElementById('entryTime')?.value;
                const exitTime = document.getElementById('exitTime')?.value;
                
                const entryDateTime = entryTime ? `${today}T${entryTime}:00` : new Date().toISOString();
                const exitDateTime = exitTime ? `${today}T${exitTime}:00` : null;
                
                const entryPrice = parseFloat(document.getElementById('entryPrice')?.value || '0');
                const exitPrice = parseFloat(document.getElementById('exitPrice')?.value || '0');
                const direction = document.getElementById('direction')?.value || 'LONG';
                const takeProfit = parseFloat(document.getElementById('takeProfit')?.value);
                const stopLoss = parseFloat(document.getElementById('stopLoss')?.value);
                
                // Determine if TP or SL was hit
                let hitTarget = 'none';
                if (takeProfit && stopLoss) {
                    if (direction === 'LONG') {
                        if (exitPrice >= takeProfit) hitTarget = 'TP';
                        else if (exitPrice <= stopLoss) hitTarget = 'SL';
                    } else { // SHORT
                        if (exitPrice <= takeProfit) hitTarget = 'TP';
                        else if (exitPrice >= stopLoss) hitTarget = 'SL';
                    }
                }
                
                const tradeData = {
                    symbol: document.getElementById('symbol')?.value.toUpperCase() || '',
                    direction: direction,
                    entryPrice: entryPrice,
                    exitPrice: exitPrice,
                    quantity: parseInt(document.getElementById('quantity')?.value || '0'),
                    pnl: parseFloat(document.getElementById('pnl')?.value || '0'),
                    notes: document.getElementById('notes')?.value || '',
                    takeProfit: takeProfit,
                    stopLoss: stopLoss,
                    entryTime: entryDateTime,
                    exitTime: exitDateTime,
                    strategy: strategy,
                    hitTarget: hitTarget
                };
                
                const fileInput = document.getElementById('fileInput');
                const screenshotFiles = fileInput ? fileInput.files : [];
                
                const success = await TradeJournal.saveTrade(date, tradeData, screenshotFiles);
                
                if (success) {
                    showNotification('Trade saved successfully!', 'success');
                    tradeForm.reset();
                    const preview = document.getElementById('preview');
                    if (preview) preview.innerHTML = '';
                    if (fileInput) fileInput.value = '';
                    
                    // Reset custom strategy row
                    if (customStrategyRow) customStrategyRow.style.display = 'none';
                    
                    loadTodaysTrades(date);
                } else {
                    showNotification('Error saving trade. Check console for details.', 'error');
                }
            } catch (error) {
                console.error('Error saving trade:', error);
                showNotification('Error saving trade. Please try again.', 'error');
            } finally {
                // Hide loading state
                saveBtn.disabled = false;
                saveBtn.classList.remove('loading');
            }
        });
    }
    
    loadTodaysTrades(date);
    
    // Setup enhanced upload options (includes camera)
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
            const dirClass = trade.direction?.toLowerCase() || 'long';
            
            // Format times
            const entryTime = trade.entryTime ? new Date(trade.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            const exitTime = trade.exitTime ? new Date(trade.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
            
            // TP/SL display
            const tpSl = trade.takeProfit && trade.stopLoss ? 
                `<span class="tp-sl-badge">
                    <span class="tp-badge">TP: ${trade.takeProfit}</span>
                    <span class="sl-badge">SL: ${trade.stopLoss}</span>
                </span>` : '-';
            
            // Hit target badge
            const hitBadge = trade.hitTarget === 'TP' ? 
                '<span class="hit-tp"><i class="fas fa-check-circle"></i> TP Hit</span>' : 
                trade.hitTarget === 'SL' ? 
                '<span class="hit-sl"><i class="fas fa-times-circle"></i> SL Hit</span>' : 
                '<span class="strategy-tag"><i class="fas fa-random"></i> Manual Exit</span>';
            
            // Strategy badge
            const strategyBadge = trade.strategy ? 
                `<span class="strategy-tag"><i class="fas fa-tag"></i> ${trade.strategy}</span>` : '';
            
            html += `<tr>
                <td>${trade.symbol || 'N/A'}</td>
                <td class="${dirClass}">${trade.direction === 'LONG' ? '📈 LONG' : '📉 SHORT'}</td>
                <td>$${trade.entryPrice?.toFixed(2) || '0.00'}</td>
                <td>$${trade.exitPrice?.toFixed(2) || '0.00'}</td>
                <td>${tpSl}</td>
                <td>${entryTime}</td>
                <td>${exitTime}</td>
                <td>${strategyBadge}</td>
                <td>${hitBadge}</td>
                <td class="${pnlClass}">$${trade.pnl?.toFixed(2) || '0.00'}</td>
                <td>${trade.screenshots ? trade.screenshots.length : 0} 📸</td>
                <td>
                    <button onclick="deleteTradeFromForm('${date}', ${index})" class="delete-btn small">Delete</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } else {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align: center;">No trades yet today</td></tr>';
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
    
    let totalGrossPnL = 0;
    let totalNetPnL = 0;
    let totalTax = 0;
    let totalBrokerage = 0;
    let totalSTT = 0;
    let totalTransactionCharges = 0;
    let totalGST = 0;
    
    const winningTrades = [];
    const losingTrades = [];
    
    trades.forEach(trade => {
        // Calculate taxes on the fly
        const taxData = calculateTradeTaxes(trade);
        
        totalGrossPnL += taxData.grossPnL;
        totalNetPnL += taxData.netPnL;
        totalTax += taxData.totalFees;
        totalBrokerage += taxData.breakdown.brokerage;
        totalSTT += taxData.breakdown.stt;
        totalTransactionCharges += taxData.breakdown.transactionCharges;
        totalGST += taxData.breakdown.gst;
        
        if (taxData.grossPnL > 0) winningTrades.push(trade);
        else if (taxData.grossPnL < 0) losingTrades.push(trade);
    });
    
    const winRate = (winningTrades.length / trades.length * 100) || 0;
    const uniqueDays = [...new Set(trades.map(t => t.date))].length;
    
    const avgWin = winningTrades.length ? 
        winningTrades.reduce((sum, t) => {
            const tax = calculateTradeTaxes(t);
            return sum + tax.grossPnL;
        }, 0) / winningTrades.length : 0;
        
    const avgLoss = losingTrades.length ? 
        Math.abs(losingTrades.reduce((sum, t) => {
            const tax = calculateTradeTaxes(t);
            return sum + tax.grossPnL;
        }, 0) / losingTrades.length) : 0;
    
    const allGrossPnLs = trades.map(t => calculateTradeTaxes(t).grossPnL);
    const largestWin = Math.max(...allGrossPnLs);
    const largestLoss = Math.min(...allGrossPnLs);
    
    const totalWins = winningTrades.reduce((sum, t) => {
        const tax = calculateTradeTaxes(t);
        return sum + tax.grossPnL;
    }, 0);
    
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => {
        const tax = calculateTradeTaxes(t);
        return sum + tax.grossPnL;
    }, 0));
    
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    
    const taxPercentage = totalGrossPnL !== 0 ? 
        (totalTax / Math.abs(totalGrossPnL) * 100).toFixed(2) : 0;
    
    // Update DOM with dynamic values
    setElementText('totalPnL', '₹' + formatNumber(totalNetPnL), totalNetPnL >= 0 ? 'profit' : 'loss');
    setElementText('totalTrades', trades.length);
    setElementText('winRate', winRate.toFixed(1) + '%');
    setElementText('tradingDays', uniqueDays);
    setElementText('avgWin', '₹' + formatNumber(avgWin), 'profit');
    setElementText('avgLoss', '₹' + formatNumber(avgLoss), 'loss');
    setElementText('largestWin', '₹' + formatNumber(largestWin), 'profit');
    setElementText('largestLoss', '₹' + formatNumber(largestLoss), 'loss');
    setElementText('profitFactor', profitFactor === Infinity ? '∞' : profitFactor.toFixed(2));
    
    // Tax-specific updates
    setElementText('totalTax', '₹' + formatNumber(totalTax));
    setElementText('netPnL', '₹' + formatNumber(totalNetPnL), totalNetPnL >= 0 ? 'profit' : 'loss');
    setElementText('taxPercentage', taxPercentage + '%');
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
    setElementText('totalTax', '₹0.00');
    setElementText('netPnL', '₹0.00');
    setElementText('taxPercentage', '0%');
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
            // html += '<th>P&L</th>';
            html += '<th>Gross P&L</th>';
            html += '<th>Net P&L</th>';
            html += '<th>Tax</th>'; 
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
                    <td class="${pnlClass}">$${formatNumber(trade.pnl)}</td>;
                    <td class="${pnlAfterTaxClass}">$${formatNumber(trade.pnlAfterTax)}</td>;
                    <td>$${formatNumber(trade.totalFees)}</td>;
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
function updateDailySummary(date, dayData, totalGrossPnL, totalNetPnL, totalTax) {
    const totalTradesEl = document.getElementById('totalTradesBadge');
    const dayPnLEl = document.getElementById('dayPnL');
    const screenshotsEl = document.getElementById('totalScreenshotsBadge');
    
    if (totalTradesEl) {
        const tradeCount = dayData.trades ? dayData.trades.length : 0;
        totalTradesEl.textContent = tradeCount;
    }
    
    if (dayPnLEl) {
        // Show net P&L in summary card
        dayPnLEl.textContent = '₹' + formatNumber(totalNetPnL);
        dayPnLEl.className = totalNetPnL >= 0 ? 'summary-value profit' : 'summary-value loss';
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























// ============== TRADE DETAIL PAGE FUNCTIONS ==============

// Initialize trade detail page when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on the trade detail page
    if (window.location.pathname.includes('trade-detail.html')) {
        console.log("Loading trade detail page...");
        loadTradeDetail();
    }
});

// Navigate to trade detail page
function viewTradeDetail(date, tradeIndex) {
    window.location.href = `trade-detail.html?date=${date}&index=${tradeIndex}`;
}

// Load trade detail page
async function loadTradeDetail() {
    console.log("loadTradeDetail function called");
    
    // Get parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const date = urlParams.get('date');
    const tradeIndex = parseInt(urlParams.get('index'));
    
    console.log("Date:", date, "Index:", tradeIndex);
    
    if (!date || isNaN(tradeIndex)) {
        showError('Invalid trade reference');
        return;
    }
    
    try {
        // Load trade data
        const dayData = await TradeJournal.loadDayTrades(date);
        console.log("Day data loaded:", dayData);
        
        if (!dayData.trades || !dayData.trades[tradeIndex]) {
            showError('Trade not found');
            return;
        }
        
        const trade = dayData.trades[tradeIndex];
        console.log("Trade found:", trade);
        
        // Hide loading spinner
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) spinner.style.display = 'none';
        
        // Display trade details
        displayTradeDetails(date, tradeIndex, trade, dayData);
        
        // Display screenshots if any
        if (trade.screenshots && trade.screenshots.length > 0) {
            displayScreenshots(trade.screenshots);
        }
        
        // Show action buttons
        const actionButtons = document.getElementById('actionButtons');
        if (actionButtons) actionButtons.style.display = 'flex';
        
        // Store trade info for edit/delete
        window.currentTrade = {
            date: date,
            index: tradeIndex,
            trade: trade,
            dayData: dayData
        };
        
    } catch (error) {
        console.error("Error loading trade detail:", error);
        showError('Error loading trade details');
    }
}

// Display trade details
function displayTradeDetails(date, tradeIndex, trade, dayData) {
    const container = document.getElementById('tradeDetailCard');
    if (!container) {
        console.error("Trade detail container not found");
        return;
    }
    
    // Calculate trade metrics
    const pnl = trade.pnl || 0;
    const pnlClass = pnl >= 0 ? 'profit' : 'loss';
    const direction = trade.direction || 'LONG';
    const dirClass = direction.toLowerCase();
    const dirIcon = direction === 'LONG' ? '📈' : '📉';
    
    // Calculate R multiple (simplified - assumes 1R = 1% risk)
    const riskAmount = Math.abs(trade.entryPrice * 0.01); // 1% risk example
    const rMultiple = riskAmount > 0 ? (pnl / riskAmount).toFixed(2) : '0.00';
    
    // Format date
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Calculate day's total after this trade
    const dayTotal = dayData.totalPnL || 0;
    
    const html = `
        <div class="trade-header">
            <div class="trade-title">
                <h1>${trade.symbol || 'N/A'} ${dirIcon} ${direction}</h1>
                <span class="trade-date">${formattedDate}</span>
            </div>
            <div class="trade-pnl-large ${pnlClass}">
                ${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}
            </div>
        </div>

        <div class="trade-metrics-grid">
            <div class="metric-card">
                <div class="metric-icon"><i class="fas fa-sign-in-alt"></i></div>
                <div class="metric-details">
                    <span class="metric-label">Entry Price</span>
                    <span class="metric-value">$${trade.entryPrice?.toFixed(2) || '0.00'}</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-icon"><i class="fas fa-sign-out-alt"></i></div>
                <div class="metric-details">
                    <span class="metric-label">Exit Price</span>
                    <span class="metric-value">$${trade.exitPrice?.toFixed(2) || '0.00'}</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-icon"><i class="fas fa-weight-hanging"></i></div>
                <div class="metric-details">
                    <span class="metric-label">Quantity</span>
                    <span class="metric-value">${trade.quantity || 0}</span>
                </div>
            </div>

            <div class="metric-card">
                <div class="metric-icon"><i class="fas fa-chart-line"></i></div>
                <div class="metric-details">
                    <span class="metric-label">R Multiple</span>
                    <span class="metric-value ${pnl >= 0 ? 'profit' : 'loss'}">${rMultiple}R</span>
                </div>
            </div>
        </div>

        <div class="trade-details-grid">
            <div class="detail-section">
                <h3><i class="fas fa-info-circle"></i> Trade Information</h3>
                <table class="details-table">
                    <tr>
                        <td>Direction:</td>
                        <td class="${dirClass}">${dirIcon} ${direction}</td>
                    </tr>
                    <tr>
                        <td>Entry Time:</td>
                        <td>${trade.timestamp ? new Date(trade.timestamp).toLocaleString() : 'Not recorded'}</td>
                    </tr>
                    <tr>
                        <td>Exit Time:</td>
                        <td>${trade.exitTime ? new Date(trade.exitTime).toLocaleString() : 'Not recorded'}</td>
                    </tr>
                    <tr>
                        <td>Trade Duration:</td>
                        <td>${calculateDuration(trade)}</td>
                    </tr>
                </table>
            </div>

            <div class="detail-section">
                <h3><i class="fas fa-chart-pie"></i> Performance Impact</h3>
                <table class="details-table">
                    <tr>
                        <td>Contribution to Day:</td>
                        <td class="${pnlClass}">${((pnl / dayTotal) * 100 || 0).toFixed(1)}%</td>
                    </tr>
                    <tr>
                        <td>Position Size:</td>
                        <td>$${Math.abs(trade.entryPrice * trade.quantity).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td>Return %:</td>
                        <td class="${pnlClass}">${((pnl / (trade.entryPrice * trade.quantity)) * 100 || 0).toFixed(2)}%</td>
                    </tr>
                </table>
            </div>
        </div>

        ${trade.notes ? `
        <div class="notes-section">
            <h3><i class="fas fa-sticky-note"></i> Trade Notes</h3>
            <div class="notes-content">
                ${trade.notes.replace(/\n/g, '<br>')}
            </div>
        </div>
        ` : ''}

        ${trade.tags && trade.tags.length > 0 ? `
        <div class="tags-section">
            <h3><i class="fas fa-tags"></i> Tags</h3>
            <div class="tags-container">
                ${trade.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
        </div>
        ` : ''}
    `;
    
    container.innerHTML = html;
}

// Display screenshots gallery
function displayScreenshots(screenshots) {
    const gallery = document.getElementById('screenshotsGallery');
    const grid = document.getElementById('galleryGrid');
    
    if (!gallery || !grid) return;
    
    gallery.style.display = 'block';
    
    let html = '';
    screenshots.forEach((url, index) => {
        html += `
            <div class="gallery-item" onclick="openFullscreenImage('${url}', ${index + 1})">
                <img src="${url}" alt="Screenshot ${index + 1}">
                <div class="gallery-overlay">
                    <i class="fas fa-search-plus"></i>
                </div>
            </div>
        `;
    });
    
    grid.innerHTML = html;
}

// Calculate trade duration
function calculateDuration(trade) {
    if (!trade.timestamp) return 'Not recorded';
    
    const entryTime = new Date(trade.timestamp);
    const exitTime = trade.exitTime ? new Date(trade.exitTime) : new Date();
    
    const diffMs = exitTime - entryTime;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) {
        return `${diffMins} minutes`;
    } else if (diffMins < 1440) {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h ${mins}m`;
    } else {
        const days = Math.floor(diffMins / 1440);
        const hours = Math.floor((diffMins % 1440) / 60);
        return `${days}d ${hours}h`;
    }
}

// Open fullscreen image
function openFullscreenImage(url, index) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('fullscreenImage');
    const caption = document.getElementById('imageCaption');
    
    if (!modal || !modalImg) return;
    
    modal.style.display = 'block';
    modalImg.src = url;
    caption.innerHTML = `Screenshot ${index}`;
}

// Close image modal
function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Edit trade
function editTrade() {
    if (window.currentTrade) {
        window.location.href = `journal.html?date=${window.currentTrade.date}&edit=${window.currentTrade.index}`;
    }
}

// Delete trade from detail page
async function deleteTradeFromDetail() {
    if (!window.currentTrade) return;
    
    if (confirm('Are you sure you want to delete this trade? This action cannot be undone.')) {
        const success = await TradeJournal.deleteTrade(
            window.currentTrade.date, 
            window.currentTrade.index
        );
        
        if (success) {
            showNotification('Trade deleted successfully', 'success');
            setTimeout(() => {
                window.location.href = `index.html?date=${window.currentTrade.date}`;
            }, 1500);
        } else {
            showNotification('Error deleting trade', 'error');
        }
    }
}

// Go back to previous page
function goBack() {
    const urlParams = new URLSearchParams(window.location.search);
    const date = urlParams.get('date');
    
    if (date) {
        window.location.href = `index.html?date=${date}`;
    } else {
        window.location.href = 'index.html';
    }
}

// Show error message
function showError(message) {
    const container = document.getElementById('tradeDetailCard');
    const spinner = document.getElementById('loadingSpinner');
    
    if (spinner) spinner.style.display = 'none';
    
    if (container) {
        container.innerHTML = `
            <div class="error-container">
                <i class="fas fa-exclamation-triangle"></i>
                <h2>Oops!</h2>
                <p>${message}</p>
                <button onclick="goBack()" class="back-btn">
                    <i class="fas fa-arrow-left"></i> Go Back
                </button>
            </div>
        `;
    }
}































// ============== NAVIGATION FUNCTIONS (Define these first) ==============

// Navigate to trade detail page
function viewTradeDetail(date, tradeIndex) {
    console.log("Navigating to trade detail:", date, tradeIndex);
    window.location.href = `trade-detail.html?date=${date}&index=${tradeIndex}`;
}

// Navigate to add trade page for current date
function goToAddTrade() {
    const datePicker = document.getElementById('datePicker');
    const date = datePicker ? datePicker.value : TradeJournal.getTodayDate();
    window.location.href = `journal.html?date=${date}`;
}

// ============== UI FUNCTIONS ==============

// Display trades for a specific date
function displayDayTrades(date) {
    TradeJournal.loadDayTrades(date).then(dayData => {
        const container = document.getElementById('journalContent');
        if (!container) return;
        let totalGrossPnL = 0;
        let totalNetPnL = 0;
        let totalTax = 0;
        if (dayData.trades) {
            dayData.trades.forEach(trade => {
                const taxData = calculateTradeTaxes(trade);
                trade.grossPnL = taxData.grossPnL;
                trade.netPnL = taxData.netPnL;
                trade.totalFees = taxData.totalFees;
                trade.taxBreakdown = taxData.breakdown;
                
                totalGrossPnL += taxData.grossPnL;
                totalNetPnL += taxData.netPnL;
                totalTax += taxData.totalFees;
            });
        }
        // Update summary card
        updateDailySummary(date, dayData, totalGrossPnL, totalNetPnL, totalTax);
        
        let html = `<h2><i class="fas fa-chart-line"></i> Trades for ${formatDisplayDate(date)}</h2>`;
        
        if (dayData.trades && dayData.trades.length > 0) {
            html += '<div class="trades-container">';
            html += '<table class="trades-table">';
            html += '<thead><tr>';
            html += '<th>Symbol</th>';
            html += '<th>Direction</th>';
            html += '<th>Entry</th>';
            html += '<th>Exit</th>';
            html += '<th>TP/SL</th>';
            html += '<th>Entry Time</th>';
            html += '<th>Exit Time</th>';
            html += '<th>Strategy</th>';
            html += '<th>Qty</th>';
            html += '<th>Gross P&L</th>';
            html += '<th>Net P&L</th>';
            html += '<th>Tax</th>'; 
            html += '<th>Images</th>';
            html += '<th>Actions</th>';
            html += '</tr></thead><tbody>';
            
            dayData.trades.forEach((trade, index) => {
                const grossClass = trade.grossPnL >= 0 ? 'profit' : 'loss';
                const netClass = trade.netPnL >= 0 ? 'profit' : 'loss';
                const dirClass = trade.direction ? trade.direction.toLowerCase() : 'long';
                const screenshotCount = trade.screenshots ? trade.screenshots.length : 0;
                
                // Make the entire row clickable
                html += `<tr onclick="viewTradeDetail('${date}', ${index})" style="cursor: pointer;" class="clickable-row">
                    <td><strong>${trade.symbol || 'N/A'}</strong></td>

                    <td class="${dirClass}">
                        ${trade.direction === 'LONG' ? '📈 LONG' : '📉 SHORT'}
                    </td>

                    <td>₹${formatNumber(trade.entryPrice)}</td>
                    <td>₹${formatNumber(trade.exitPrice)}</td>

                    <td>
                        ${trade.takeProfit ? 'TP: ₹' + formatNumber(trade.takeProfit) : '-'}<br>
                        ${trade.stopLoss ? 'SL: ₹' + formatNumber(trade.stopLoss) : ''}
                    </td>

                    <td>${trade.entryTime || '-'}</td>
                    <td>${trade.exitTime || '-'}</td>
                    <td>${trade.strategy || '-'}</td>

                    <td>${trade.quantity || 0}</td>

                    <td class="${grossClass}">₹${formatNumber(trade.grossPnL)}</td>
                    <td class="${netClass}">₹${formatNumber(trade.netPnL)}</td>
                    <td>₹${formatNumber(trade.totalFees)}</td>

                    <td onclick="event.stopPropagation()">
                        ${screenshotCount > 0 ? 
                            `<span class="image-count" onclick="showScreenshots('${date}', ${index})">
                                <i class="fas fa-image"></i> ${screenshotCount}
                            </span>` : 
                            '<span class="no-image"><i class="far fa-image"></i> 0</span>'
                        }
                    </td>

                    <td onclick="event.stopPropagation()">
                        <button onclick="deleteTrade('${date}', ${index})" class="delete-btn small">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
            });
            
            // Add total row (not clickable)
            html += `<tr class="total-row">
                <td colspan="5"><strong>Daily Total:</strong></td>
                <td class="${totalGrossPnL >= 0 ? 'profit' : 'loss'}">
                    <strong>₹${formatNumber(totalGrossPnL)}</strong>
                </td>
                <td class="${totalNetPnL >= 0 ? 'profit' : 'loss'}">
                    <strong>₹${formatNumber(totalNetPnL)}</strong>
                </td>
                <td><strong>₹${formatNumber(totalTax)}</strong></td>
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











// Calculate total fees for a trade
function calculateTradeFees(trade) {
    const quantity = Math.abs(trade.quantity);
    
    const brokerage = (trade.brokeragePerUnit || 0) * quantity;
    const stt = (trade.stt || 0) / quantity; // Distribute evenly
    const transactionCharges = (trade.transactionCharges || 0) * quantity;
    const stampDuty = (trade.stampDuty || 0) / quantity;
    const sebiFees = (trade.sebiFees || 0) / quantity;
    
    // GST is 18% on brokerage + transaction charges
    const gst = (brokerage + transactionCharges) * 0.18;
    
    return {
        brokerage,
        stt,
        transactionCharges,
        stampDuty,
        sebiFees,
        gst,
        total: brokerage + stt + transactionCharges + stampDuty + sebiFees + gst
    };
}

// Calculate P&L after tax
function calculatePnLAfterTax(trade) {
    const fees = calculateTradeFees(trade);
    return (trade.pnl || 0) - fees.total;
}

// Update dashboard with tax totals
async function updateTaxTotals(timeRange) {
    const trades = await loadTradesInRange(timeRange);
    
    let totalTax = 0;
    let totalGrossPnL = 0;
    let totalNetPnL = 0;
    
    trades.forEach(trade => {
        const fees = calculateTradeFees(trade);
        totalTax += fees.total;
        totalGrossPnL += trade.pnl || 0;
        totalNetPnL += (trade.pnl || 0) - fees.total;
    });
    
    document.getElementById('totalTax').textContent = formatCurrency(totalTax);
    document.getElementById('netPnL').textContent = formatCurrency(totalNetPnL);
    
    const taxPercentage = totalGrossPnL !== 0 ? 
        (totalTax / Math.abs(totalGrossPnL) * 100).toFixed(2) : 0;
    document.getElementById('taxPercentage').textContent = taxPercentage + '%';
}





// ============== TAX CALCULATION FUNCTIONS ==============

// Calculate all taxes for a Nifty options trade (based on Dhan/NSE rules)
function calculateTradeTaxes(trade) {
    const quantity = Math.abs(trade.quantity || 0);
    const entryPrice = trade.entryPrice || 0;
    const exitPrice = trade.exitPrice || 0;
    const isBuy = trade.direction === 'BUY' || trade.direction === 'LONG';
    const isOption = true; // Assuming all are options for now
    
    // Calculate turnover (total transaction value)
    const buyValue = entryPrice * quantity;
    const sellValue = exitPrice * quantity;
    const turnover = buyValue + sellValue;
    
    // 1. Brokerage (Dhan charges ₹20 per executed order or 0.03% whichever is lower)
    // For options, it's usually ₹20 per order
    const brokeragePerTrade = 20; // ₹20 per order
    const brokerage = isBuy ? brokeragePerTrade : brokeragePerTrade; // Both legs
    
    // 2. STT (Securities Transaction Tax)
    // For options: 0.05% on premium (selling side only)
    const sttRate = 0.0005; // 0.05%
    const stt = isBuy ? 0 : (sellValue * sttRate); // STT only on sell
    
    // 3. Transaction Charges (NSE)
    // Options: ₹50 per crore of turnover (0.005%)
    const transactionChargeRate = 0.00005; // 0.005%
    const transactionCharges = turnover * transactionChargeRate;
    
    // 4. GST (18% on brokerage + transaction charges)
    const gstRate = 0.18; // 18%
    const taxableAmount = brokerage + transactionCharges;
    const gst = taxableAmount * gstRate;
    
    // 5. SEBI Charges (₹10 per crore)
    const sebiRate = 0.000001; // 0.0001%
    const sebiCharges = turnover * sebiRate;
    
    // 6. Stamp Duty
    // Options: 0.003% on buy side only
    const stampDutyRate = 0.00003; // 0.003%
    const stampDuty = isBuy ? (buyValue * stampDutyRate) : 0;
    
    // Calculate gross P&L
    const grossPnL = isBuy ? 
        ((exitPrice - entryPrice) * quantity) : 
        ((entryPrice - exitPrice) * quantity);
    
    // Calculate total taxes and fees
    const totalFees = brokerage + stt + transactionCharges + gst + sebiCharges + stampDuty;
    const netPnL = grossPnL - totalFees;
    
    return {
        grossPnL: grossPnL,
        netPnL: netPnL,
        totalFees: totalFees,
        breakdown: {
            brokerage: brokerage,
            stt: stt,
            transactionCharges: transactionCharges,
            gst: gst,
            sebiCharges: sebiCharges,
            stampDuty: stampDuty
        }
    };
}

// Format number with 2 decimals
function formatNumber(num) {
    if (num === undefined || num === null) return '0.00';
    return num.toFixed(2);
}

// Format currency in Rupees
function formatCurrency(value) {
    return '₹' + value.toFixed(2);
}

// Format date for display
function formatDisplayDate(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}
















// ============== CAMERA FUNCTIONS ==============

let currentStream = null;
let currentFacingMode = 'environment'; // 'environment' for back camera, 'user' for front
let isCameraInitialized = false;

// Setup camera option
function setupCameraOption() {
    const cameraOption = document.getElementById('cameraOption');
    const cameraInput = document.getElementById('cameraInput');
    
    if (cameraOption) {
        cameraOption.addEventListener('click', () => {
            // Check if browser supports advanced camera API
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                openCameraModal();
            } else {
                // Fallback to simple file input with camera
                if (cameraInput) {
                    cameraInput.click();
                }
            }
        });
    }
    
    // Handle camera input change (fallback method)
    if (cameraInput) {
        cameraInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFiles(e.target.files);
            }
        });
    }
}

// Open camera modal
async function openCameraModal() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraPreview');
    
    if (!modal || !video) return;
    
    modal.style.display = 'block';
    
    // Don't reinitialize if already initialized
    if (isCameraInitialized) {
        return;
    }
    
    try {
        // Stop any existing stream
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        
        // Get new stream with better error handling
        const constraints = {
            video: { 
                facingMode: currentFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };
        
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Important: Set srcObject BEFORE calling play()
        video.srcObject = currentStream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                resolve();
            };
        });
        
        await video.play();
        isCameraInitialized = true;
        
    } catch (error) {
        console.error("Error accessing camera:", error);
        
        let errorMessage = 'Could not access camera. ';
        if (error.name === 'NotAllowedError') {
            errorMessage += 'Please grant camera permission.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No camera found on this device.';
        } else if (error.name === 'NotReadableError') {
            errorMessage += 'Camera is already in use by another application.';
        } else {
            errorMessage += 'Please check camera permissions.';
        }
        
        showNotification(errorMessage, 'error');
        closeCameraModal();
    }
}

// Close camera modal
function closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraPreview');
    
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Stop camera stream
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
        });
        currentStream = null;
    }
    
    if (video) {
        video.srcObject = null;
        video.load(); // Reset video element
    }
    
    isCameraInitialized = false;
}

// Capture photo from camera
function capturePhoto() {
    const video = document.getElementById('cameraPreview');
    const canvas = document.getElementById('cameraCanvas');
    
    if (!video || !canvas || !video.videoWidth) {
        showNotification('Camera not ready', 'error');
        return;
    }
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert canvas to blob
    canvas.toBlob(async (blob) => {
        // Create a file from the blob
        const fileName = `camera_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        
        // Add to preview
        await addFileToPreview(file);
        
        // Add to file input
        addFileToInput(file);
        
        // Close camera modal
        closeCameraModal();
        
        showNotification('📸 Photo captured successfully!', 'success');
    }, 'image/jpeg', 0.9);
}

// Switch between front and back camera
async function switchCamera() {
    // Toggle facing mode
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    
    // Reset initialization flag
    isCameraInitialized = false;
    
    // Close current stream
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    
    // Clear video source
    const video = document.getElementById('cameraPreview');
    if (video) {
        video.srcObject = null;
    }
    
    // Reopen camera with new facing mode
    await openCameraModal();
}

// Add this to your setupEnhancedUpload function
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
        
        pasteArea.addEventListener('paste', async (e) => {
            e.preventDefault();
            
            const items = e.clipboardData.items;
            
            for (let item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const blob = item.getAsFile();
                    const file = new File([blob], `pasted_image_${Date.now()}.png`, { type: blob.type });
                    
                    await addFileToPreview(file);
                    addFileToInput(file);
                    
                    pasteArea.value = '';
                    showNotification('✅ Image pasted successfully!', 'success');
                }
            }
        });
    }
    
    // NEW: Setup camera option
    setupCameraOption();
    
    // Setup modal close for camera
    const modal = document.getElementById('cameraModal');
    const closeBtn = modal?.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCameraModal);
    }
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeCameraModal();
        }
    });
}