/**
 * script.js
 * Main Controller for FinTrack PRO
 */

const state = {
    settings: {},
    activeAccount: 'personal', // personal, shared, company
    transactions: [],
    filteredTransactions: [],
};

const DOM = {
    // Navigation
    navLinks: document.querySelectorAll('.nav-links li'),
    sections: document.querySelectorAll('.page-section'),
    pageTitle: document.getElementById('page-title'),
    accountBtns: document.querySelectorAll('.account-btn'),
    themeToggle: document.getElementById('theme-toggle'),

    // Dashboard
    dashBalance: document.getElementById('dash-balance'),
    dashIncome: document.getElementById('dash-income'),
    dashExpense: document.getElementById('dash-expense'),
    dashSavings: document.getElementById('dash-savings'),
    recentTxnList: document.getElementById('recent-transaction-list'),
    sharedStatus: document.getElementById('shared-account-status'),

    // Ledger Filters
    searchInput: document.getElementById('search-input'),
    filterType: document.getElementById('filter-type'),
    filterDate: document.getElementById('filter-date'),

    // Modals
    txnModal: document.getElementById('transaction-modal'),
    budgetModal: document.getElementById('budget-modal'),
    
    // Txn Form
    txnForm: document.getElementById('transaction-form'),
    typeCredit: document.getElementById('type-credit'),
    typeDebit: document.getElementById('type-debit'),
    txnCategory: document.getElementById('txn-category'),
    memberGroup: document.getElementById('member-group'),
    txnMember: document.getElementById('txn-member'),
};

// --- App Initialization ---
const initApp = () => {
    state.settings = getSettings();
    applyTheme(state.settings.theme);
    
    // Live Date & Time Sync with Device
    const updateTime = () => {
        document.getElementById('current-datetime').textContent = new Date().toLocaleString('en-US', { 
            weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };
    updateTime(); // initial call
    setInterval(updateTime, 1000); // tick every second

    checkRecurringTransactions();
    setupEventListeners();
    switchAccount('personal'); // Default
};

// --- Recurring Transactions Engine ---
const checkRecurringTransactions = () => {
    const today = new Date().toISOString().slice(0,10);
    if (state.settings.lastRecurringCheck === today) return; // Already checked today

    const accounts = ['personal', 'shared', 'company'];
    let generated = 0;

    accounts.forEach(acc => {
        const txns = getTransactions(acc);
        const recurring = txns.filter(t => t.isRecurring);

        recurring.forEach(rt => {
            const lastDate = new Date(rt.date);
            const nextDate = new Date(lastDate);
            nextDate.setMonth(nextDate.getMonth() + 1);

            // If a month has passed, generate new transaction
            if (new Date() >= nextDate) {
                const newTxn = { ...rt, id: generateID(), date: nextDate.toISOString() };
                addTransaction(acc, newTxn);
                generated++;
            }
        });
    });

    state.settings.lastRecurringCheck = today;
    saveSettings(state.settings);
    if(generated > 0) showToast(`${generated} recurring transaction(s) generated.`, 'info');
};

// --- Main UI Updater ---
const updateUI = () => {
    state.transactions = getTransactions(state.activeAccount);
    
    // Calculate global running balances for the whole account before filtering
    state.transactions = calculateRunningBalances(state.transactions);
    
    // Apply Ledger Filters
    applyFilters();

    // Render Sub-Modules
    renderDashboard();
    if(window.Budget) window.Budget.render(state.transactions, state.activeAccount, state.settings);
    if(window.Charts && document.getElementById('analytics').classList.contains('active')) {
        window.Charts.render(state.transactions);
    }
};

window.updateUI = updateUI;

// --- Account Switching ---
const switchAccount = (account) => {
    state.activeAccount = account;
    
    // Update active button
    DOM.accountBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.account === account);
    });

    // Handle UI visibility based on account type
    const isPersonal = account === 'personal';
    document.querySelector('li[data-target="budget"]').style.display = isPersonal ? 'flex' : 'none';
    document.querySelector('li[data-target="savings"]').style.display = isPersonal ? 'flex' : 'none';

    // If on a hidden tab, redirect to dashboard
    if (!isPersonal && ['budget', 'savings'].includes(document.querySelector('.nav-links li.active').dataset.target)) {
        document.querySelector('li[data-target="dashboard"]').click();
    }

    updateUI();
};

// --- Dashboard Logic ---
const renderDashboard = () => {
    const totals = getAccountTotals(state.activeAccount);
    const curr = state.settings.currency;

    DOM.dashBalance.textContent = formatCurrency(totals.balance, curr);

    // Calculate monthly credit/debit
    let mCredit = 0, mDebit = 0;
    state.transactions.forEach(t => {
        if(isThisMonth(t.date)) {
            if(t.type === 'credit') mCredit += parseFloat(t.amount);
            else mDebit += parseFloat(t.amount);
        }
    });

    DOM.dashIncome.textContent = formatCurrency(mCredit, curr);
    DOM.dashExpense.textContent = formatCurrency(mDebit, curr);

    // Savings logic (only for personal)
    if (state.activeAccount === 'personal') {
        const sav = getSavingsData();
        DOM.dashSavings.textContent = formatCurrency(sav.balance, curr);
        renderSavingsView(sav);
    } else {
        DOM.dashSavings.textContent = 'N/A';
    }

    // Shared Account specific logic
    if (state.activeAccount === 'shared') {
        renderSharedStatus();
    } else {
        DOM.sharedStatus.classList.add('hidden');
    }

    // Recent Activity
    DOM.recentTxnList.innerHTML = '';
    const recent = state.transactions.slice(0, 5);
    
    if(recent.length === 0) {
        DOM.recentTxnList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No recent activity.</div>';
    } else {
        recent.forEach(t => {
            const isCredit = t.type === 'credit';
            const colorClass = isCredit ? 'text-credit' : 'text-debit';
            
            let descStr = `<h4>${t.description}</h4>`;
            if (state.activeAccount === 'shared' && t.member) descStr += `<p style="font-size: 0.7rem;">By: ${t.member}</p>`;

            const div = document.createElement('div');
            div.className = 'txn-item';
            div.innerHTML = `
                <div class="txn-item-left">
                    <div class="txn-icon ${isCredit ? 'credit-icon' : 'debit-icon'}"><i class="fa-solid ${isCredit ? 'fa-arrow-turn-down' : 'fa-arrow-turn-up'}"></i></div>
                    <div class="txn-details">
                        ${descStr}
                        <p>${formatDateOnly(t.date)} • ${t.category}</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="txn-amount ${colorClass}">
                        ${isCredit ? '+' : '-'}${formatCurrency(t.amount, curr)}
                    </div>
                    <div class="action-btns" style="display: flex; gap: 8px;">
                        <button onclick="editTxn('${t.id}')" title="Edit" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px;"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deleteTxn('${t.id}')" title="Delete" style="background: none; border: none; cursor: pointer; color: var(--debit, #ef4444); padding: 4px;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
            DOM.recentTxnList.appendChild(div);
        });
    }

    if(window.Charts) window.Charts.renderQuickCashFlow(state.transactions);
};

const renderSharedStatus = () => {
    const members = getSharedMembers();
    if(members.length === 0) return;

    let memberContributions = {};
    members.forEach(m => memberContributions[m] = 0);
    let totalExpenses = 0;

    state.transactions.forEach(t => {
        if(t.type === 'credit' && t.member && memberContributions[t.member] !== undefined) {
            memberContributions[t.member] += parseFloat(t.amount);
        }
        if(t.type === 'debit') {
            totalExpenses += parseFloat(t.amount);
        }
    });

    const curr = state.settings.currency;
    const equalShare = members.length > 0 ? totalExpenses / members.length : 0;

    let html = `<div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px; font-size: 0.9rem;">
        <strong>Shared Expenses Pool</strong>
        <span class="text-muted">Total Spent: ${formatCurrency(totalExpenses, curr)} (${formatCurrency(equalShare, curr)} per member)</span>
    </div>`;

    for(const [m, amt] of Object.entries(memberContributions)) {
        const net = amt - equalShare;
        const color = net >= 0 ? 'var(--credit)' : 'var(--debit)';
        html += `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.9rem;">
            <span><strong>${m}</strong> (Contributed: ${formatCurrency(amt, curr)})</span>
            <span style="color: ${color}; font-weight: 500;">Net Balance: ${formatCurrency(net, curr)}</span>
        </div>`;
    }

    DOM.sharedStatus.innerHTML = html;
    DOM.sharedStatus.classList.remove('hidden');
};

const renderSavingsView = (sav) => {
    const curr = state.settings.currency;
    document.getElementById('total-savings-amount').textContent = formatCurrency(sav.balance, curr);
    document.getElementById('savings-goal-input').value = sav.goal;
    
    let percent = sav.goal > 0 ? (sav.balance / sav.goal) * 100 : 0;
    document.getElementById('savings-progress-text').textContent = `${percent.toFixed(1)}%`;
    document.getElementById('savings-progress-fill').style.width = `${Math.min(percent, 100)}%`;
};

// --- Filters & Ledger Delegation ---
const applyFilters = () => {
    let filtered = [...state.transactions];
    const searchTerm = DOM.searchInput.value.toLowerCase();
    const typeF = DOM.filterType.value;

    // Dynamically build month options based on actual transactions
    const uniqueMonths = new Set();
    state.transactions.forEach(t => {
        if(t.date) uniqueMonths.add(t.date.slice(0, 7)); // Extract YYYY-MM
    });
    const sortedMonths = Array.from(uniqueMonths).sort().reverse();
    
    const currentMonthSelection = DOM.filterDate.value;
    
    let optionsHtml = '<option value="all">All Time</option>';
    sortedMonths.forEach(m => {
        const [year, month] = m.split('-');
        const dateObj = new Date(year, month - 1);
        const label = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
        optionsHtml += `<option value="${m}">${label}</option>`;
    });
    DOM.filterDate.innerHTML = optionsHtml;
    
    // Restore selection
    if (currentMonthSelection && sortedMonths.includes(currentMonthSelection)) {
        DOM.filterDate.value = currentMonthSelection;
    } else {
        DOM.filterDate.value = 'all';
    }
    
    const dateF = DOM.filterDate.value;

    if (searchTerm) {
        filtered = filtered.filter(t => 
            t.description.toLowerCase().includes(searchTerm) ||
            t.category.toLowerCase().includes(searchTerm) ||
            (t.id && t.id.toLowerCase().includes(searchTerm))
        );
    }
    if (typeF !== 'all') filtered = filtered.filter(t => t.type === typeF);
    
    if (dateF !== 'all') {
        filtered = filtered.filter(t => t.date.startsWith(dateF));
    }

    state.filteredTransactions = filtered;
    if(window.Ledger) window.Ledger.render(state.filteredTransactions, state.activeAccount, state.settings);
};

// --- Event Listeners Setup ---
const setupEventListeners = () => {
    // Navigation
    DOM.navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if(link.style.display === 'none') return;
            DOM.navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const target = link.dataset.target;
            DOM.sections.forEach(sec => sec.classList.remove('active'));
            document.getElementById(target).classList.add('active');
            
            DOM.pageTitle.textContent = capitalize(target);
            updateUI(); // Refresh view
        });
    });

    // Account Switcher
    DOM.accountBtns.forEach(btn => {
        btn.addEventListener('click', () => switchAccount(btn.dataset.account));
    });

    // Theme Toggle
    DOM.themeToggle.addEventListener('click', () => {
        const newTheme = state.settings.theme === 'light' ? 'dark' : 'light';
        state.settings.theme = newTheme;
        updateSetting('theme', newTheme);
        applyTheme(newTheme);
        updateUI();
    });

    // Modal Triggers
    document.getElementById('btn-add-transaction').addEventListener('click', () => openTxnModal());
    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => DOM.txnModal.classList.remove('show')));
    
    // Form handlers
    DOM.typeCredit.addEventListener('change', populateCategories);
    DOM.typeDebit.addEventListener('change', populateCategories);
    DOM.txnForm.addEventListener('submit', handleTxnSubmit);
    document.getElementById('btn-reset-form').addEventListener('click', () => DOM.txnForm.reset());

    // Filter Listeners
    DOM.searchInput.addEventListener('input', () => { if(window.Ledger) Ledger.currentPage = 1; updateUI(); });
    DOM.filterType.addEventListener('change', () => { if(window.Ledger) Ledger.currentPage = 1; updateUI(); });
    DOM.filterDate.addEventListener('change', () => { if(window.Ledger) Ledger.currentPage = 1; updateUI(); });

    // Export Listeners
    document.getElementById('btn-export-pdf').addEventListener('click', () => window.ExportService.toPDF(state.filteredTransactions, state.activeAccount, state.settings));
    document.getElementById('btn-export-csv').addEventListener('click', () => window.ExportService.toCSV(state.filteredTransactions, state.activeAccount));

    // Settings Listeners
    setupSettingsListeners();
};

const applyTheme = (theme) => {
    document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
    DOM.themeToggle.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
};

// --- Transaction Modal Logic ---
const openTxnModal = (txn = null) => {
    document.getElementById('modal-title').textContent = txn ? 'Edit Transaction' : `New Transaction (${capitalize(state.activeAccount)})`;
    
    if (state.activeAccount === 'shared') {
        DOM.memberGroup.style.display = 'block';
        const members = getSharedMembers();
        DOM.txnMember.innerHTML = members.map(m => `<option value="${m}">${m}</option>`).join('');
    } else {
        DOM.memberGroup.style.display = 'none';
    }

    if (txn) {
        document.getElementById('txn-id').value = txn.id;
        document.getElementById('txn-amount').value = txn.amount;
        // datetime-local format expects YYYY-MM-DDThh:mm
        const d = new Date(txn.date);
        document.getElementById('txn-date').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        document.getElementById('txn-description').value = txn.description;
        document.getElementById('txn-payment').value = txn.paymentMethod;
        document.getElementById('txn-ref').value = txn.refNo || '';
        document.getElementById('txn-notes').value = txn.notes || '';
        document.getElementById('txn-recurring').checked = !!txn.isRecurring;
        
        if (txn.type === 'credit') DOM.typeCredit.checked = true;
        else DOM.typeDebit.checked = true;
        
        populateCategories();
        DOM.txnCategory.value = txn.category;
        if(state.activeAccount === 'shared') DOM.txnMember.value = txn.member;
    } else {
        DOM.txnForm.reset();
        document.getElementById('txn-id').value = '';
        DOM.typeDebit.checked = true;
        // Set date to now
        const now = new Date();
        document.getElementById('txn-date').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        populateCategories();
    }
    
    DOM.txnModal.classList.add('show');
};

const populateCategories = () => {
    const isCredit = DOM.typeCredit.checked;
    const list = CATEGORIES[state.activeAccount][isCredit ? 'credit' : 'debit'];
    DOM.txnCategory.innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('');
    
    const deductGroup = document.getElementById('deduct-personal-group');
    if (deductGroup) {
        if (state.activeAccount === 'shared' && isCredit) {
            deductGroup.style.display = 'block';
        } else {
            deductGroup.style.display = 'none';
        }
    }
};

const handleTxnSubmit = (e) => {
    e.preventDefault();
    const id = document.getElementById('txn-id').value;
    
    const isCredit = DOM.typeCredit.checked;
    const txnData = {
        id: id || generateID(),
        type: isCredit ? 'credit' : 'debit',
        amount: parseFloat(document.getElementById('txn-amount').value),
        date: new Date(document.getElementById('txn-date').value).toISOString(),
        category: DOM.txnCategory.value,
        description: document.getElementById('txn-description').value.trim(),
        paymentMethod: document.getElementById('txn-payment').value,
        refNo: document.getElementById('txn-ref').value.trim(),
        notes: document.getElementById('txn-notes').value.trim(),
        isRecurring: document.getElementById('txn-recurring').checked
    };

    if (state.activeAccount === 'shared') {
        txnData.member = DOM.txnMember.value;
        
        const deductPersonal = document.getElementById('txn-deduct-personal');
        if (!id && isCredit && deductPersonal && deductPersonal.checked) {
            const personalTxn = {
                id: generateID('PTXN'),
                type: 'debit',
                amount: txnData.amount,
                date: txnData.date,
                category: 'Savings Transfer', 
                description: `Shared Wallet Deposit (${txnData.member})`,
                paymentMethod: txnData.paymentMethod,
                refNo: txnData.refNo,
                notes: 'Auto-deducted for shared wallet deposit.',
                isRecurring: false
            };
            addTransaction('personal', personalTxn);
        }
    }

    if (id) {
        updateTransaction(state.activeAccount, id, txnData);
        showToast('Transaction updated');
    } else {
        addTransaction(state.activeAccount, txnData);
        showToast('Transaction recorded');
    }

    DOM.txnModal.classList.remove('show');
    updateUI();
};

window.editTxn = (id) => {
    const txn = state.transactions.find(t => t.id === id);
    if(txn) openTxnModal(txn);
};

window.deleteTxn = (id) => {
    if(confirm('Delete this transaction?')) {
        deleteTransaction(state.activeAccount, id);
        showToast('Transaction deleted', 'warning');
        updateUI();
    }
};

// --- Settings & Extra Modules Listeners ---
const setupSettingsListeners = () => {
    // Basic Prefs
    document.getElementById('currency-select').value = state.settings.currency;
    document.getElementById('budget-allocation-mode').value = state.settings.budgetMode;

    document.getElementById('btn-save-settings').addEventListener('click', () => {
        updateSetting('currency', document.getElementById('currency-select').value);
        showToast('Preferences saved');
        updateUI();
    });

    document.getElementById('budget-allocation-mode').addEventListener('change', (e) => {
        updateSetting('budgetMode', e.target.value);
        updateUI();
    });

    // Shared Members
    const renderMembers = () => {
        const mems = getSharedMembers();
        document.getElementById('shared-members-list').innerHTML = mems.map(m => 
            `<span class="badge" style="background:var(--border-color); color:var(--text-primary); margin-right:5px; padding: 5px 10px;">${m} <i class="fa-solid fa-times" style="cursor:pointer;" onclick="removeMember('${m}')"></i></span>`
        ).join('');
    };
    renderMembers();

    document.getElementById('btn-add-member').addEventListener('click', () => {
        const input = document.getElementById('new-member-name');
        const val = input.value.trim();
        if(val) {
            const mems = getSharedMembers();
            if(!mems.includes(val)) {
                mems.push(val);
                saveSharedMembers(mems);
                input.value = '';
                renderMembers();
                showToast('Member added');
            }
        }
    });

    window.removeMember = (m) => {
        let mems = getSharedMembers();
        mems = mems.filter(x => x !== m);
        saveSharedMembers(mems);
        renderMembers();
    };

    // Savings Goal
    document.getElementById('savings-goal-input').addEventListener('change', (e) => {
        const sav = getSavingsData();
        sav.goal = parseFloat(e.target.value) || 0;
        saveSavingsData(sav);
        updateUI();
    });

    // Transfer Funds
    document.getElementById('transfer-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('transfer-amount').value);
        const dir = document.getElementById('transfer-direction').value;
        const sav = getSavingsData();

        if (dir === 'to_savings') {
            const totals = getAccountTotals('personal');
            if (totals.balance < amt) return showToast('Insufficient main balance.', 'error');
            sav.balance += amt;
            // Record debit in personal
            addTransaction('personal', {
                id: generateID(), type: 'debit', amount: amt, date: new Date().toISOString(),
                category: 'Savings Transfer', description: 'Transferred to Savings Reserve', paymentMethod: 'System'
            });
        } else {
            if (sav.balance < amt) return showToast('Insufficient savings balance.', 'error');
            sav.balance -= amt;
            // Record credit in personal
            addTransaction('personal', {
                id: generateID(), type: 'credit', amount: amt, date: new Date().toISOString(),
                category: 'Savings Transfer', description: 'Transferred from Savings Reserve', paymentMethod: 'System'
            });
        }
        
        saveSavingsData(sav);
        document.getElementById('transfer-form').reset();
        showToast('Transfer completed successfully!');
        updateUI();
    });

    // Budget Setup
    document.getElementById('btn-add-budget').addEventListener('click', () => {
        const select = document.getElementById('budget-category');
        select.innerHTML = CATEGORIES.personal.debit.map(c => `<option value="${c}">${c}</option>`).join('');
        document.getElementById('budget-amount-label').textContent = state.settings.budgetMode === 'percentage' ? 'Allocation Percentage (%)' : 'Amount Limit';
        DOM.budgetModal.classList.add('show');
    });
    
    document.querySelector('.close-modal-budget').addEventListener('click', () => DOM.budgetModal.classList.remove('show'));
    
    document.getElementById('budget-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const cat = document.getElementById('budget-category').value;
        const amt = parseFloat(document.getElementById('budget-amount').value);
        const b = getBudgets();
        b[cat] = amt;
        saveBudgets(b);
        DOM.budgetModal.classList.remove('show');
        showToast('Budget configured');
        updateUI();
    });

    // Data Management
    document.getElementById('btn-backup-data').addEventListener('click', exportAllData);
    
    document.getElementById('restore-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            if(importAllData(event.target.result)) {
                showToast('Data restored successfully!');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                showToast('Invalid backup file', 'error');
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('btn-reset-data').addEventListener('click', () => {
        if(confirm("DANGER! This will delete ALL transactions across ALL accounts. Proceed?")) {
            resetAllData();
            window.location.reload();
        }
    });
};

// --- Boot ---
document.addEventListener('DOMContentLoaded', initApp);
