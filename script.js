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
    if (window.Goals) Goals.init();
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
    // Goal auto-saves are triggered by new salaries, so check on every refresh
    // (each salary month / save day is only handled once)
    if (window.Goals) Goals.runAutoSave();

    state.transactions = getTransactions(state.activeAccount);
    
    // Calculate global running balances for the whole account before filtering
    state.transactions = calculateRunningBalances(state.transactions);

    // "This month" = current salary cycle on Personal (calendar month elsewhere)
    state.period = getCurrentPeriod(state.transactions, state.activeAccount);

    // Apply Ledger Filters
    applyFilters();

    // Render Sub-Modules
    renderDashboard();
    renderExpensesTab();
    if(window.Budget) window.Budget.render(state.transactions, state.activeAccount, state.settings);
    if(window.Goals && state.activeAccount === 'personal') window.Goals.render(state.transactions, state.settings);
    if(window.Charts && document.getElementById('analytics').classList.contains('active')) {
        window.Charts.render(state.transactions, state.period);
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

// Banner progress bar: how much of the money that came in has been spent
const setSpentBar = (barId, textId, spent, moneyIn) => {
    const bar = document.getElementById(barId);
    const text = document.getElementById(textId);
    if (!bar || !text) return;
    if (moneyIn <= 0) {
        bar.style.width = spent > 0 ? '100%' : '0%';
        bar.classList.toggle('over', spent > 0);
        text.textContent = spent > 0 ? 'Spending with no money in yet this month' : 'No money in yet this month';
        return;
    }
    const pct = (spent / moneyIn) * 100;
    bar.style.width = `${Math.min(100, pct)}%`;
    bar.classList.toggle('over', pct > 85);
    text.textContent = `${pct.toFixed(0)}% of this month's money spent`;
};

// Friendly placeholder for empty lists
const emptyState = (icon, title, text) => `
    <div class="empty-state">
        <span class="empty-icon"><i class="fa-solid ${icon}"></i></span>
        <strong>${title}</strong>
        <p>${text}</p>
    </div>`;

const formatShortDate =(d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

// Savings = leftover from previous salary cycles. Without any salary recorded,
// fall back to lifetime income minus expenses.
const getSavingsTotal = (history, balances) => state.period.isSalaryCycle
    ? balances.carriedOver
    : roundMoney(history.reduce((sum, h) => sum + h.income - h.expense, 0));

// Which month(s) the Savings total came from: the last finished month, plus earlier ones combined.
// Returns HTML (month names and formatted amounts only); amounts are kept on one line.
const getSavingsBreakdown = (history) => {
    if (!state.period.isSalaryCycle) return 'Lifetime income minus expenses';
    const finished = history.filter(h => !h.isCurrent); // newest first
    if (finished.length === 0) return 'Nothing carried over yet';

    const curr = state.settings.currency;
    const amount = (v) => `<span class="nowrap">${formatCurrency(v, curr)}</span>`;
    const [last, ...earlier] = finished;
    let html = `${cycleMonthName(last)}: ${amount(last.leftover)}`;
    if (earlier.length) {
        const earlierTotal = roundMoney(earlier.reduce((sum, h) => sum + h.leftover, 0));
        html += `<br>Earlier months: ${amount(earlierTotal)}`;
    }
    return html;
};

const renderDashboard = () => {
    const curr = state.settings.currency;
    const pastTxns = state.transactions.filter(t => !isFuture(t.date));
    const period = state.period;
    const balances = getCycleBalances(state.transactions, period);

    DOM.dashBalance.textContent = formatCurrency(balances.available, curr);

    // Card labels say exactly which period they cover
    const periodText = period.isSalaryCycle
        ? `Since salary on ${formatShortDate(period.start)}`
        : state.activeAccount === 'personal' ? 'Add a Salary entry to start a monthly cycle' : 'This calendar month';
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('dash-balance-sub', state.activeAccount === 'personal' ? periodText : 'All time');
    setText('dash-income-label', period.isSalaryCycle ? 'Money In' : 'Money In (this month)');
    setText('dash-expense-label', period.isSalaryCycle ? 'Spent' : 'Spent (this month)');
    setText('dash-savings-label', state.activeAccount === 'personal' ? 'Saved from Previous Months' : 'Savings');

    // Credit/debit for the current period
    let mCredit = 0, mDebit = 0;
    pastTxns.forEach(t => {
        if(isInPeriod(t, period)) {
            if(isIncome(t)) mCredit = roundMoney(mCredit + parseFloat(t.amount));
            else if(isExpense(t)) mDebit = roundMoney(mDebit + parseFloat(t.amount));
        }
    });

    DOM.dashIncome.textContent = formatCurrency(mCredit, curr);
    DOM.dashExpense.textContent = formatCurrency(mDebit, curr);
    setSpentBar('dash-spent-bar', 'dash-spent-text', mDebit, mCredit);
    setText('cashflow-net', formatCurrency(roundMoney(mCredit - mDebit), curr));

    // Savings logic (only for personal)
    if (state.activeAccount === 'personal') {
        const history = getPeriodHistory(state.transactions);
        DOM.dashSavings.textContent = formatCurrency(getSavingsTotal(history, balances), curr);
        document.getElementById('dash-savings-sub').innerHTML = getSavingsBreakdown(history);
        renderSavingsView(history, balances);
    } else {
        DOM.dashSavings.textContent = 'N/A';
        document.getElementById('dash-savings-sub').textContent = '';
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
        DOM.recentTxnList.innerHTML = emptyState('fa-receipt', 'No activity yet', 'Add your first transaction with "New Transaction".');
    } else {
        recent.forEach(t => {
            const isCredit = t.type === 'credit';
            const colorClass = isCredit ? 'text-credit' : 'text-debit';

            let descStr = `<h4>${escapeHTML(t.description)}</h4>`;
            if (state.activeAccount === 'shared' && t.member) descStr += `<p>By ${escapeHTML(t.member)}</p>`;

            const div = document.createElement('div');
            div.className = 'txn-item';
            div.innerHTML = `
                <div class="txn-item-left">
                    <div class="txn-icon ${isCredit ? 'credit-icon' : 'debit-icon'}"><i class="fa-solid ${categoryIcon(t.category)}"></i></div>
                    <div class="txn-details">
                        ${descStr}
                        <p>${formatDateOnly(t.date)} • ${escapeHTML(t.category)}</p>
                    </div>
                </div>
                <div class="txn-item-right">
                    <div class="txn-amount ${colorClass}">
                        ${isCredit ? '+' : '-'}${formatCurrency(t.amount, curr)}
                    </div>
                    <div class="action-btns">
                        <button class="action-btn" data-action="edit-txn" data-id="${escapeHTML(t.id)}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn delete" data-action="delete-txn" data-id="${escapeHTML(t.id)}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
            DOM.recentTxnList.appendChild(div);
        });
    }

    if(window.Charts) window.Charts.renderQuickCashFlow(state.transactions, state.period);
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

// Month name in bold, with the salary-to-salary dates underneath
const periodRange = (h) => {
    if (!h.byCycle || h.key === 'before') return '';
    return h.end
        ? `${formatShortDate(h.start)} – ${formatShortDate(new Date(h.end.getTime() - 86400000))}`
        : `Since ${formatShortDate(h.start)}`;
};

const periodLabel = (h) => {
    const range = periodRange(h);
    return `<strong>${cycleMonthName(h)}</strong>${range ? `<br><small class="text-muted">${range}</small>` : ''}`;
};

const renderSavingsView = (history, balances) => {
    const curr = state.settings.currency;
    const amountEl = document.getElementById('total-savings-amount');
    if(amountEl) {
        const total = getSavingsTotal(history, balances);
        amountEl.textContent = formatCurrency(total, curr);
        amountEl.classList.toggle('negative', total < 0);
    }
    const breakdownEl = document.getElementById('savings-breakdown');
    if (breakdownEl) breakdownEl.innerHTML = getSavingsBreakdown(history);

    const introEl = document.getElementById('savings-intro');
    if (introEl) {
        introEl.textContent = state.period.isSalaryCycle
            ? 'Whatever is left of each month\'s salary moves here when your next salary is entered. Your Available Balance then starts fresh.'
            : 'Add your salary as a Salary transaction to start monthly cycles. Until then this shows lifetime income minus expenses.';
    }

    const listEl = document.getElementById('savings-list');
    if (!listEl) return;

    if (history.length === 0) {
        listEl.innerHTML = `<tr><td colspan="5">${emptyState('fa-vault', 'No history yet', 'Your months will appear here once you add transactions.')}</td></tr>`;
        return;
    }

    const signed = (v) => v === 0 ? '-' : `${v > 0 ? '+' : ''}${formatCurrency(v, curr)}`;
    listEl.innerHTML = history.map(h => `
            <tr>
                <td>
                    ${periodLabel(h)}
                    ${h.isCurrent ? '<br><small class="text-muted"><i class="fa-regular fa-clock"></i> In progress</small>' : ''}
                </td>
                <td class="text-credit">${formatCurrency(h.income, curr)}</td>
                <td class="text-debit">${formatCurrency(h.expense, curr)}</td>
                <td class="text-muted">${signed(h.transfers)}</td>
                <td style="font-weight: 600; color: ${h.leftover >= 0 ? 'var(--credit)' : 'var(--debit)'}">
                    ${formatCurrency(h.leftover, curr)}${h.isCurrent && h.byCycle ? '<br><small class="text-muted" style="font-weight:400;">so far</small>' : ''}
                </td>
            </tr>
        `).join('');
};

// --- Expenses Explorer Tab ---
// Uses the same months as the Savings tab: salary months on Personal (once a salary is
// recorded), calendar months otherwise. Scheduled future entries are left out.
const renderExpensesTab = () => {
    const curr = state.settings.currency;
    const history = getPeriodHistory(state.transactions, state.activeAccount === 'personal');

    const categoriesEl = document.getElementById('exp-categories');

    if (history.length === 0) {
        DOM.expMonthSelect.innerHTML = '<option value="">No transactions yet</option>';
        [DOM.expBalance, DOM.expIncome, DOM.expExpense, DOM.expSaved].forEach(el => el.textContent = formatCurrency(0, curr));
        DOM.expListTitle.textContent = 'Expenses';
        document.getElementById('exp-period-sub').textContent = '';
        setSpentBar('exp-spent-bar', 'exp-spent-text', 0, 0);
        DOM.expTableBody.innerHTML = `<tr><td colspan="3">${emptyState('fa-receipt', 'No expenses yet', 'Expenses you record will be listed here month by month.')}</td></tr>`;
        categoriesEl.innerHTML = emptyState('fa-chart-simple', 'Nothing to show', 'Your spending by category will appear here.');
        return;
    }

    // Keep the chosen month, otherwise open on the current one
    let selected = history.find(h => h.key === state.expenseTabSelectedMonth);
    if (!selected) selected = history.find(h => h.isCurrent) || history[0];
    state.expenseTabSelectedMonth = selected.key;

    DOM.expMonthSelect.innerHTML = history.map(h => {
        const range = periodRange(h);
        const label = `${cycleMonthName(h)}${h.isCurrent ? ' (current)' : ''}${range ? ` · ${range}` : ''}`;
        return `<option value="${h.key}" ${h === selected ? 'selected' : ''}>${label}</option>`;
    }).join('');

    // Cards match the Savings tab for the same month
    DOM.expBalance.textContent = formatCurrency(selected.closingBalance, curr);
    DOM.expIncome.textContent = formatCurrency(selected.income, curr);
    DOM.expExpense.textContent = formatCurrency(selected.expense, curr);
    DOM.expSaved.textContent = formatCurrency(selected.leftover, curr);
    DOM.expListTitle.textContent = `${cycleMonthName(selected)} Expenses`;
    document.getElementById('exp-hero-label').textContent = selected.isCurrent ? 'Spent this month' : `Spent in ${cycleMonthName(selected)}`;
    document.getElementById('exp-period-sub').textContent = periodRange(selected) || (selected.byCycle ? '' : 'Calendar month');
    setSpentBar('exp-spent-bar', 'exp-spent-text', selected.expense, selected.income);

    const expensesOnly = state.transactions.filter(t =>
        !isFuture(t.date) && isExpense(t) && getPeriodKey(t.date, selected.starts, selected.byCycle) === selected.key);

    // Where it went: spending per category, largest first
    const byCategory = {};
    expensesOnly.forEach(t => { byCategory[t.category] = roundMoney((byCategory[t.category] || 0) + parseFloat(t.amount)); });
    const ranked = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    categoriesEl.innerHTML = ranked.length === 0
        ? emptyState('fa-face-smile', 'No spending', 'Nothing spent in this month.')
        : ranked.map(([cat, amt], i) => {
            const share = selected.expense > 0 ? (amt / selected.expense) * 100 : 0;
            const color = CHART_PALETTE[i % CHART_PALETTE.length];
            return `
                <div class="category-bar" style="--accent: ${color};">
                    <span class="category-bar-icon"><i class="fa-solid ${categoryIcon(cat)}"></i></span>
                    <div class="category-bar-body">
                        <div class="category-bar-label"><span>${escapeHTML(cat)}</span><strong>${formatCurrency(amt, curr)}</strong></div>
                        <div class="category-bar-track"><div style="width: ${(amt / ranked[0][1]) * 100}%"></div></div>
                    </div>
                    <span class="category-bar-pct">${share.toFixed(0)}%</span>
                </div>`;
        }).join('');

    // Render list
    if (expensesOnly.length === 0) {
        DOM.expTableBody.innerHTML = `<tr><td colspan="3">${emptyState('fa-face-smile', 'No expenses', 'Nothing was spent in this month.')}</td></tr>`;
        return;
    }

    DOM.expTableBody.innerHTML = expensesOnly.map(t => `
            <tr>
                <td>
                    <div style="font-weight: 500;">${formatDateOnly(t.date)}</div>
                    <div class="text-muted" style="font-size: 0.75rem;">${formatTimeOnly(t.date)}</div>
                </td>
                <td>
                    <div class="row-with-icon">
                        <span class="row-icon debit"><i class="fa-solid ${categoryIcon(t.category)}"></i></span>
                        <div>
                            <div style="font-weight: 500;">${escapeHTML(t.description)}</div>
                            <div class="text-muted" style="font-size: 0.75rem;">${escapeHTML(t.category)} ${t.member ? '• ' + escapeHTML(t.member) : ''}</div>
                        </div>
                    </div>
                </td>
                <td class="text-debit" style="font-weight: 600;">-${formatCurrency(t.amount, curr)}</td>
            </tr>
        `).join('');
};

// --- Filters & Ledger Delegation ---
const applyFilters = () => {
    let filtered = [...state.transactions];
    const searchTerm = DOM.searchInput.value.toLowerCase();
    const typeF = DOM.filterType.value;

    // Month options: salary months (Personal, once a salary exists) and calendar months.
    // Salary month values are prefixed "cycle:" so they can't clash with "YYYY-MM".
    const cycleHistory = state.activeAccount === 'personal'
        ? getPeriodHistory(state.transactions).filter(h => h.byCycle)
        : [];
    const starts = cycleHistory.length ? cycleHistory[0].starts : [];

    const uniqueMonths = new Set();
    state.transactions.forEach(t => {
        if(t.date) uniqueMonths.add(monthKey(t.date));
    });
    const sortedMonths = Array.from(uniqueMonths).sort().reverse();

    const currentMonthSelection = DOM.filterDate.value;
    const monthOption = (m) => {
        const [year, month] = m.split('-');
        return `<option value="${m}">${new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</option>`;
    };

    let optionsHtml = '<option value="all">All Time</option>';
    if (cycleHistory.length) {
        optionsHtml += `<optgroup label="Salary months">${cycleHistory.map(h =>
            `<option value="cycle:${h.key}">${cycleMonthName(h)}${h.isCurrent ? ' (current)' : ''}</option>`).join('')}</optgroup>`;
        optionsHtml += `<optgroup label="Calendar months">${sortedMonths.map(monthOption).join('')}</optgroup>`;
    } else {
        optionsHtml += sortedMonths.map(monthOption).join('');
    }
    DOM.filterDate.innerHTML = optionsHtml;

    // Restore selection
    const validValues = [...DOM.filterDate.options].map(o => o.value);
    DOM.filterDate.value = validValues.includes(currentMonthSelection) ? currentMonthSelection : 'all';

    const dateF = DOM.filterDate.value;

    if (searchTerm) {
        filtered = filtered.filter(t => 
            t.description.toLowerCase().includes(searchTerm) ||
            t.category.toLowerCase().includes(searchTerm) ||
            (t.id && t.id.toLowerCase().includes(searchTerm))
        );
    }
    if (typeF !== 'all') filtered = filtered.filter(t => t.type === typeF);
    
    if (dateF.startsWith('cycle:')) {
        const key = dateF.slice('cycle:'.length);
        filtered = filtered.filter(t => getPeriodKey(t.date, starts, true) === key);
    } else if (dateF !== 'all') {
        filtered = filtered.filter(t => monthKey(t.date) === dateF);
    }

    state.filteredTransactions = filtered;

    // Totals for what the filters currently show
    let totalIn = 0, totalOut = 0;
    filtered.forEach(t => {
        if (t.type === 'credit') totalIn = roundMoney(totalIn + parseFloat(t.amount));
        else totalOut = roundMoney(totalOut + parseFloat(t.amount));
    });
    document.getElementById('ledger-total-in').textContent = formatCurrency(totalIn, state.settings.currency);
    document.getElementById('ledger-total-out').textContent = formatCurrency(totalOut, state.settings.currency);
    document.getElementById('ledger-count').textContent = filtered.length;

    if(window.Ledger) window.Ledger.render(state.filteredTransactions, state.activeAccount, state.settings);
};

// --- Event Listeners Setup ---
// Mobile: the sidebar slides in from the left
const setSidebarOpen = (open) => {
    document.getElementById('sidebar').classList.toggle('open', open);
    document.getElementById('sidebar-backdrop').classList.toggle('show', open);
    document.getElementById('menu-toggle').setAttribute('aria-expanded', String(open));
};

const setupEventListeners = () => {
    document.getElementById('menu-toggle').addEventListener('click', () =>
        setSidebarOpen(!document.getElementById('sidebar').classList.contains('open')));
    document.getElementById('sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false));

    // Navigation
    DOM.navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if(link.style.display === 'none') return;
            setSidebarOpen(false);
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
    // Links that jump to another tab, e.g. "Full Statement"
    document.addEventListener('click', (e) => {
        const link = e.target.closest('[data-goto]');
        if (link) document.querySelector(`li[data-target="${link.dataset.goto}"]`).click();
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'edit-txn') editTxn(id);
        else if (action === 'delete-txn') deleteTxn(id);
        else if (action === 'remove-member') window.removeMember(id);
        else if (action === 'remove-budget' && window.removeBudget) window.removeBudget(id);
        else if (action === 'add-budget') document.getElementById('btn-add-budget').click();
    });

    // Analytics: period for the spending-by-category chart
    document.getElementById('category-range').addEventListener('change', (e) => {
        Charts.categoryRange = e.target.value;
        Charts.renderCategoryDistribution(state.transactions, state.period);
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
        // Transfers (savings, investments) aren't spending, so they can't have a budget
        select.innerHTML = CATEGORIES.personal.debit
            .filter(c => !TRANSFER_CATEGORIES.includes(c))
            .map(c => `<option value="${c}">${c}</option>`).join('');
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
        if(!confirm("DANGER! This permanently deletes ALL your data:\n• transactions in Personal, Shared and Company\n• savings goals and budgets\n• shared members and settings\n\nContinue?")) return;

        const wantsBackup = confirm("Download a backup first?\n\nOK = download a backup, then delete\nCancel = delete without a backup");
        if (wantsBackup) exportAllData();
        // Give the backup download a moment to start before the page reloads
        setTimeout(() => {
            resetAllData();
            window.location.reload();
        }, wantsBackup ? 1500 : 0);
    });
};

// --- Boot ---
document.addEventListener('DOMContentLoaded', initApp);
