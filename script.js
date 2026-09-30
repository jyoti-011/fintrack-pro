/**
 * script.js
 * Main Controller for FinTrack PRO
 */

const state = {
    settings: {},
    activeAccount: 'personal', // personal, shared, company
    transactions: [],
    filteredTransactions: [],
    expenseTabSelectedMonth: null
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

    // Expenses Explorer
    expMonthSelect: document.getElementById('expense-month-select'),
    expBalance: document.getElementById('exp-balance'),
    expIncome: document.getElementById('exp-income'),
    expExpense: document.getElementById('exp-expense'),
    expSaved: document.getElementById('exp-saved'),
    expListTitle: document.getElementById('exp-list-title'),
    expTableBody: document.getElementById('exp-table-body'),

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

    migrateData();
    checkRecurringTransactions();
    if (window.Goals) {
        Goals.init();
        Goals.runAutoSave();
    }
    setupEventListeners();
    switchAccount('personal'); // Default
};

// Keep in-memory settings in sync with storage
const setSetting = (key, val) => {
    state.settings[key] = val;
    updateSetting(key, val);
};

// --- Recurring Transactions Engine ---
// Only the latest entry of a recurring series carries isRecurring = true. When the next
// occurrence is generated the flag moves to the new entry, so each month is created exactly
// once. Unticking "Recurring" on the latest entry stops the series.

// Add months while keeping the original day where possible (31st -> 28/29th in Feb -> 31st in Mar)
const addMonthsClamped = (dateStr, months, day) => {
    const d = new Date(dateStr);
    const target = new Date(d.getFullYear(), d.getMonth() + months, 1, d.getHours(), d.getMinutes(), d.getSeconds());
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return target;
};

// Older data has no recurringId, so copies of the same series are grouped by their content
const recurringSignature = (t) => [t.type, t.category, t.description, t.amount, t.member || ''].join('|');

const checkRecurringTransactions = () => {
    const now = new Date();
    let generated = 0;

    ['personal', 'shared', 'company'].forEach(acc => {
        const txns = getTransactions(acc);
        let changed = false;

        // Find the latest entry of each series
        const latestBySeries = {};
        txns.filter(t => t.isRecurring).forEach(t => {
            const key = t.recurringId || recurringSignature(t);
            const current = latestBySeries[key];
            if (!current || new Date(t.date) > new Date(current.date)) latestBySeries[key] = t;
        });
        const latestEntries = Object.values(latestBySeries);

        // Clear the flag on older copies (repairs data duplicated by the previous engine)
        txns.forEach(t => {
            if (t.isRecurring && !latestEntries.includes(t)) {
                t.isRecurring = false;
                changed = true;
            }
        });

        latestEntries.forEach(latest => {
            if (!latest.recurringId) {
                latest.recurringId = latest.id;
                latest.recurringDay = new Date(latest.date).getDate();
                changed = true;
            }
            const day = latest.recurringDay || new Date(latest.date).getDate();

            // Catch up on every missed month
            let current = latest;
            let next = addMonthsClamped(current.date, 1, day);
            while (next <= now) {
                current.isRecurring = false;
                const { linkedId, linkedAccount, ...rest } = current;
                current = {
                    ...rest,
                    id: generateID(),
                    date: next.toISOString(),
                    refNo: '',
                    isRecurring: true,
                    recurringId: latest.recurringId,
                    recurringDay: day
                };
                txns.push(current);
                generated++;
                changed = true;
                next = addMonthsClamped(current.date, 1, day);
            }
        });

        if (changed) saveTransactions(acc, txns);
    });

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
    renderExpensesTab();
    if(window.Budget) window.Budget.render(state.transactions, state.activeAccount, state.settings);
    if(window.Goals && state.activeAccount === 'personal') window.Goals.render(state.transactions, state.settings);
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
    document.querySelector('li[data-target="goals"]').style.display = isPersonal ? 'flex' : 'none';

    // If on a hidden tab, redirect to dashboard
    if (!isPersonal && ['budget', 'savings', 'goals'].includes(document.querySelector('.nav-links li.active').dataset.target)) {
        document.querySelector('li[data-target="dashboard"]').click();
    }

    updateUI();
};

// --- Dashboard Logic ---
const getMonthlyHistory = (transactions) => {
    const history = {};
    transactions.forEach(t => {
        if (!t.date) return;
        const key = monthKey(t.date);
        if (!history[key]) history[key] = { income: 0, expense: 0 };
        if (isIncome(t)) history[key].income = roundMoney(history[key].income + parseFloat(t.amount));
        else if (isExpense(t)) history[key].expense = roundMoney(history[key].expense + parseFloat(t.amount));
    });

    return Object.keys(history).map(key => ({
        month: key,
        income: history[key].income,
        expense: history[key].expense,
        saved: roundMoney(history[key].income - history[key].expense)
    })).sort((a, b) => b.month.localeCompare(a.month));
};

const renderDashboard = () => {
    const curr = state.settings.currency;
    const pastTxns = state.transactions.filter(t => !isFuture(t.date));

    DOM.dashBalance.textContent = formatCurrency(getCurrentBalance(state.transactions), curr);

    // Calculate monthly credit/debit
    let mCredit = 0, mDebit = 0;
    pastTxns.forEach(t => {
        if(isThisMonth(t.date)) {
            if(isIncome(t)) mCredit += parseFloat(t.amount);
            else if(isExpense(t)) mDebit += parseFloat(t.amount);
        }
    });

    DOM.dashIncome.textContent = formatCurrency(mCredit, curr);
    DOM.dashExpense.textContent = formatCurrency(mDebit, curr);

    // Savings logic (only for personal)
    if (state.activeAccount === 'personal') {
        const history = getMonthlyHistory(pastTxns);
        const totalSav = history.reduce((acc, currItem) => acc + currItem.saved, 0);
        DOM.dashSavings.textContent = formatCurrency(totalSav, curr);
        renderSavingsView(history);
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
    const recent = pastTxns.slice(0, 5);

    if(recent.length === 0) {
        DOM.recentTxnList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No recent activity.</div>';
    } else {
        recent.forEach(t => {
            const isCredit = t.type === 'credit';
            const colorClass = isCredit ? 'text-credit' : 'text-debit';

            let descStr = `<h4>${escapeHTML(t.description)}</h4>`;
            if (state.activeAccount === 'shared' && t.member) descStr += `<p style="font-size: 0.7rem;">By: ${escapeHTML(t.member)}</p>`;

            const div = document.createElement('div');
            div.className = 'txn-item';
            div.innerHTML = `
                <div class="txn-item-left">
                    <div class="txn-icon ${isCredit ? 'credit-icon' : 'debit-icon'}"><i class="fa-solid ${isCredit ? 'fa-arrow-turn-down' : 'fa-arrow-turn-up'}"></i></div>
                    <div class="txn-details">
                        ${descStr}
                        <p>${formatDateOnly(t.date)} • ${escapeHTML(t.category)}</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div class="txn-amount ${colorClass}">
                        ${isCredit ? '+' : '-'}${formatCurrency(t.amount, curr)}
                    </div>
                    <div class="action-btns" style="display: flex; gap: 8px;">
                        <button data-action="edit-txn" data-id="${escapeHTML(t.id)}" title="Edit" style="background: none; border: none; cursor: pointer; color: var(--text-muted); padding: 4px;"><i class="fa-solid fa-pen"></i></button>
                        <button data-action="delete-txn" data-id="${escapeHTML(t.id)}" title="Delete" style="background: none; border: none; cursor: pointer; color: var(--debit, #ef4444); padding: 4px;"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
            DOM.recentTxnList.appendChild(div);
        });
    }

    if(window.Charts) window.Charts.renderQuickCashFlow(state.transactions);
};

// Pool model: members deposit into the shared wallet and expenses are paid from it.
// Each member's net = what they deposited - their equal share of all expenses.
const renderSharedStatus = () => {
    const current = getSharedMembers();
    const pastTxns = state.transactions.filter(t => !isFuture(t.date));

    // Members removed from Settings stay in the settlement if they have history,
    // so removing someone doesn't rewrite everyone's past shares
    const former = [...new Set(pastTxns.map(t => t.member).filter(m => m && !current.includes(m)))];
    const members = [...current, ...former];
    if(members.length === 0) {
        DOM.sharedStatus.classList.add('hidden');
        return;
    }

    let memberContributions = {};
    members.forEach(m => memberContributions[m] = 0);
    let totalExpenses = 0;

    pastTxns.forEach(t => {
        if(t.type === 'credit' && t.member && memberContributions[t.member] !== undefined) {
            memberContributions[t.member] = roundMoney(memberContributions[t.member] + parseFloat(t.amount));
        }
        if(t.type === 'debit') {
            totalExpenses = roundMoney(totalExpenses + parseFloat(t.amount));
        }
    });

    const curr = state.settings.currency;
    const equalShare = totalExpenses / members.length;

    let html = `<div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 8px; font-size: 0.9rem;">
        <strong>Shared Expenses Pool</strong>
        <span class="text-muted">Total Spent: ${formatCurrency(totalExpenses, curr)} (${formatCurrency(equalShare, curr)} per member)</span>
    </div>`;

    for(const [m, amt] of Object.entries(memberContributions)) {
        const net = amt - equalShare;
        const color = net >= 0 ? 'var(--credit)' : 'var(--debit)';
        const label = former.includes(m) ? `${escapeHTML(m)} <span class="text-muted">(former)</span>` : escapeHTML(m);
        html += `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.9rem;">
            <span><strong>${label}</strong> (Contributed: ${formatCurrency(amt, curr)})</span>
            <span style="color: ${color}; font-weight: 500;">Net Balance: ${formatCurrency(net, curr)}</span>
        </div>`;
    }

    DOM.sharedStatus.innerHTML = html;
    DOM.sharedStatus.classList.remove('hidden');
};

const renderSavingsView = (history) => {
    const curr = state.settings.currency;
    const totalSav = history.reduce((acc, current) => acc + current.saved, 0);
    const amountEl = document.getElementById('total-savings-amount');
    if(amountEl) amountEl.textContent = formatCurrency(totalSav, curr);
    
    const listEl = document.getElementById('savings-list');
    if (!listEl) return;
    
    if (history.length === 0) {
        listEl.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1rem; color: var(--text-muted);">No transaction history yet.</td></tr>';
        return;
    }

    listEl.innerHTML = history.map(h => {
        // Format YYYY-MM nicely
        const [year, month] = h.month.split('-');
        const d = new Date(year, month - 1);
        const monthLabel = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        return `
            <tr>
                <td><strong>${monthLabel}</strong></td>
                <td class="text-credit">${formatCurrency(h.income, curr)}</td>
                <td class="text-debit">${formatCurrency(h.expense, curr)}</td>
                <td style="font-weight: 600; color: ${h.saved >= 0 ? 'var(--credit)' : 'var(--debit)'}">
                    ${formatCurrency(h.saved, curr)}
                </td>
            </tr>
        `;
    }).join('');
};

// --- Expenses Explorer Tab ---
const renderExpensesTab = () => {
    const curr = state.settings.currency;
    
    // 1. Determine unique months
    const uniqueMonths = new Set();
    state.transactions.forEach(t => {
        if(t.date) uniqueMonths.add(monthKey(t.date));
    });

    let monthsArr = Array.from(uniqueMonths).sort((a, b) => b.localeCompare(a));

    // Fallback if empty
    if(monthsArr.length === 0) {
        monthsArr.push(monthKey(new Date()));
    }
    
    // Retain selection or pick latest
    if (!state.expenseTabSelectedMonth || !monthsArr.includes(state.expenseTabSelectedMonth)) {
        state.expenseTabSelectedMonth = monthsArr[0];
    }
    
    // Populate dropdown
    if (DOM.expMonthSelect) {
        DOM.expMonthSelect.innerHTML = monthsArr.map(m => {
            const [year, month] = m.split('-');
            const d = new Date(year, month - 1);
            const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
            return `<option value="${m}" ${m === state.expenseTabSelectedMonth ? 'selected' : ''}>${label}</option>`;
        }).join('');
    }
    
    // 2. Filter txns for this month
    let monthTxns = state.transactions.filter(t => t.date && monthKey(t.date) === state.expenseTabSelectedMonth);

    // We only want to show debits in the list as requested
    let expensesOnly = monthTxns.filter(isExpense);

    // Calculate totals for cards (Income, Expense, Saved)
    let mIncome = 0;
    let mExpense = 0;
    monthTxns.forEach(t => {
        if(isIncome(t)) mIncome = roundMoney(mIncome + parseFloat(t.amount));
        if(isExpense(t)) mExpense = roundMoney(mExpense + parseFloat(t.amount));
    });
    let mSaved = roundMoney(mIncome - mExpense);

    // Transactions are newest first, so the first one holds the month's closing balance
    const endBalance = monthTxns.length > 0 ? monthTxns[0].runningBalance : 0;

    if (DOM.expBalance) DOM.expBalance.textContent = formatCurrency(endBalance, curr);
    if (DOM.expIncome) DOM.expIncome.textContent = formatCurrency(mIncome, curr);
    if (DOM.expExpense) DOM.expExpense.textContent = formatCurrency(mExpense, curr);
    if (DOM.expSaved) DOM.expSaved.textContent = formatCurrency(mSaved, curr);
    
    // Update List Title
    if (DOM.expListTitle && state.expenseTabSelectedMonth) {
        const [y, mStr] = state.expenseTabSelectedMonth.split('-');
        const labelDate = new Date(y, mStr - 1);
        DOM.expListTitle.textContent = `${labelDate.toLocaleString('default', { month: 'long', year: 'numeric' })} Expenses`;
    }
    
    // Render list
    if (DOM.expTableBody) {
        if (expensesOnly.length === 0) {
            DOM.expTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 1rem; color: var(--text-muted);">No expenses recorded for this month.</td></tr>';
            return;
        }
        
        DOM.expTableBody.innerHTML = expensesOnly.map(t => {
            return `
                <tr>
                    <td>
                        <div style="font-weight: 500;">${formatDateOnly(t.date)}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${formatTimeOnly(t.date)}</div>
                    </td>
                    <td>
                        <div style="font-weight: 500;">${escapeHTML(t.description)}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHTML(t.category)} ${t.member ? '• ' + escapeHTML(t.member) : ''}</div>
                    </td>
                    <td class="text-debit">
                        -${formatCurrency(t.amount, curr)}
                    </td>
                </tr>
            `;
        }).join('');
    }
};

// --- Filters & Ledger Delegation ---
const applyFilters = () => {
    let filtered = [...state.transactions];
    const searchTerm = DOM.searchInput.value.toLowerCase();
    const typeF = DOM.filterType.value;

    // Dynamically build month options based on actual transactions
    const uniqueMonths = new Set();
    state.transactions.forEach(t => {
        if(t.date) uniqueMonths.add(monthKey(t.date));
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
        filtered = filtered.filter(t => monthKey(t.date) === dateF);
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
        setSetting('theme', newTheme);
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
    document.getElementById('btn-reset-form').addEventListener('click', () => {
        DOM.txnForm.reset();
        // reset() flips the type back to Debit without firing change, so refresh the category list
        populateCategories();
    });

    // Filter Listeners
    DOM.searchInput.addEventListener('input', () => { if(window.Ledger) Ledger.currentPage = 1; updateUI(); });
    DOM.filterType.addEventListener('change', () => { if(window.Ledger) Ledger.currentPage = 1; updateUI(); });
    DOM.filterDate.addEventListener('change', () => { if(window.Ledger) Ledger.currentPage = 1; updateUI(); });
    DOM.expMonthSelect.addEventListener('change', (e) => {
        state.expenseTabSelectedMonth = e.target.value;
        renderExpensesTab();
    });

    // Row action buttons (edit/delete transaction, remove member/budget). Values come from
    // data attributes instead of inline onclick strings, so names with quotes can't break them.
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit-txn') editTxn(id);
        else if (action === 'delete-txn') deleteTxn(id);
        else if (action === 'remove-member') window.removeMember(id);
        else if (action === 'remove-budget' && window.removeBudget) window.removeBudget(id);
    });

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
        DOM.txnMember.innerHTML = members.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
        // Editing an entry by a removed member: keep them selectable so the edit doesn't reassign it
        if (txn && txn.member && !members.includes(txn.member)) {
            DOM.txnMember.add(new Option(`${txn.member} (former)`, txn.member));
        }
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
        // Keep categories that aren't in the picker (e.g. transfers, older data) instead of silently replacing them
        if (![...DOM.txnCategory.options].some(o => o.value === txn.category)) {
            DOM.txnCategory.add(new Option(txn.category, txn.category));
        }
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
    
    // Shared wallet: deposits come from a member, expenses are paid out of the pool
    const memberLabel = document.getElementById('txn-member-label');
    if (memberLabel) memberLabel.textContent = isCredit ? 'Deposited by' : 'Paid from pool by';

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
        amount: roundMoney(document.getElementById('txn-amount').value),
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
                category: TRANSFER_CATEGORY,
                description: `Shared Wallet Deposit (${txnData.member})`,
                paymentMethod: txnData.paymentMethod,
                refNo: txnData.refNo,
                notes: 'Auto-deducted for shared wallet deposit.',
                isRecurring: false,
                isTransfer: true,
                linkedId: txnData.id,
                linkedAccount: 'shared'
            };
            addTransaction('personal', personalTxn);
            txnData.linkedId = personalTxn.id;
            txnData.linkedAccount = 'personal';
        }
    }

    if (id) {
        syncLinkedTransaction(state.transactions.find(t => t.id === id), txnData);
        updateTransaction(state.activeAccount, id, txnData);
        showToast('Transaction updated');
    } else {
        addTransaction(state.activeAccount, txnData);
        showToast('Transaction recorded');
    }

    DOM.txnModal.classList.remove('show');
    updateUI();
};

const editTxn = (id) => {
    const txn = state.transactions.find(t => t.id === id);
    if(txn) openTxnModal(txn);
};

// Keep the other half of a shared wallet deposit in step when one side is edited
const syncLinkedTransaction = (original, updated) => {
    if (!original || !original.linkedId) return;
    const { linkedId, linkedAccount } = original;

    // A deposit changed into an expense no longer moves money out of the personal wallet
    if (original.type === 'credit' && updated.type !== 'credit') {
        deleteTransaction(linkedAccount, linkedId);
        updated.linkedId = null;
        updated.linkedAccount = null;
        return;
    }

    const changes = { amount: updated.amount, date: updated.date };
    if (linkedAccount === 'personal') changes.description = `Shared Wallet Deposit (${updated.member})`;
    updateTransaction(linkedAccount, linkedId, changes);
};

const deleteTxn = (id) => {
    const txn = state.transactions.find(t => t.id === id);
    const linkedMsg = txn && txn.linkedId
        ? (txn.linkedAccount === 'personal'
            ? '\nThe matching deduction in your Personal account will also be removed.'
            : '\nThe matching deposit in the Shared account will also be removed.')
        : '';
    if(confirm('Delete this transaction?' + linkedMsg)) {
        if (txn && txn.linkedId) deleteTransaction(txn.linkedAccount, txn.linkedId);
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
        setSetting('currency', document.getElementById('currency-select').value);
        showToast('Preferences saved');
        updateUI();
    });

    document.getElementById('budget-allocation-mode').addEventListener('change', (e) => {
        setSetting('budgetMode', e.target.value);
        updateUI();
    });

    // Shared Members
    const renderMembers = () => {
        const mems = getSharedMembers();
        document.getElementById('shared-members-list').innerHTML = mems.map(m =>
            `<span class="badge" style="background:var(--border-color); color:var(--text-primary); margin-right:5px; padding: 5px 10px;">${escapeHTML(m)} <i class="fa-solid fa-times" style="cursor:pointer;" data-action="remove-member" data-id="${escapeHTML(m)}"></i></span>`
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
        if (!confirm(`Remove ${m} from the shared account?\nTheir past transactions stay in the settlement as a former member.`)) return;
        saveSharedMembers(getSharedMembers().filter(x => x !== m));
        renderMembers();
        updateUI();
    };

    // Automated Savings - No manual form required

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
        const amt = roundMoney(document.getElementById('budget-amount').value);
        const mode = state.settings.budgetMode || 'manual';
        const b = getBudgets();

        if (mode === 'percentage') {
            const otherPct = Object.entries(b)
                .filter(([c, x]) => c !== cat && x.mode === 'percentage')
                .reduce((sum, [, x]) => sum + x.value, 0);
            if (otherPct + amt > 100) {
                showToast(`Percentages would total ${roundMoney(otherPct + amt)}%. Only ${roundMoney(100 - otherPct)}% is left.`, 'error');
                return;
            }
        }

        b[cat] = { mode, value: amt };
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
            const error = importAllData(event.target.result);
            e.target.value = ''; // allow choosing the same file again after fixing it
            if(!error) {
                showToast('Data restored successfully!');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                showToast(`Backup not restored: ${error}`, 'error');
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
