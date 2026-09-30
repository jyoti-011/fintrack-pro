/**
 * storage.js
 * Advanced LocalStorage wrapper for Multiple Accounts (Personal, Shared, Company).
 */

const STORAGE_KEYS = {
    SETTINGS: 'fintrack_pro_settings',
    PERSONAL: 'fintrack_pro_personal',
    SHARED: 'fintrack_pro_shared',
    COMPANY: 'fintrack_pro_company',
    SAVINGS: 'fintrack_pro_savings',
    BUDGETS: 'fintrack_pro_budgets',
    SHARED_MEMBERS: 'fintrack_pro_shared_members',
    GOALS: 'fintrack_pro_goals'
};

const DEFAULT_SETTINGS = {
    currency: 'INR',
    theme: 'light',
    budgetMode: 'manual' // 'manual' or 'percentage'
};

// --- Generic Storage Helpers ---
const getItem = (key, defaultVal) => {
    const data = localStorage.getItem(key);
    if (!data) return defaultVal;
    try {
        return JSON.parse(data);
    } catch (e) {
        // Don't let one corrupted key crash the whole app
        console.error(`Corrupted data in "${key}", using default.`, e);
        return defaultVal;
    }
};
const setItem = (key, data) => localStorage.setItem(key, JSON.stringify(data));

// --- Settings ---
const getSettings = () => ({ ...DEFAULT_SETTINGS, ...getItem(STORAGE_KEYS.SETTINGS, {}) });
const saveSettings = (settings) => setItem(STORAGE_KEYS.SETTINGS, settings);
const updateSetting = (key, val) => {
    const s = getSettings(); s[key] = val; saveSettings(s);
};

// --- Transactions Engine ---
// Account type can be: 'personal', 'shared', 'company'
const getTransactions = (accountType) => {
    const key = STORAGE_KEYS[accountType.toUpperCase()];
    return getItem(key, []);
};

const saveTransactions = (accountType, transactions) => {
    const key = STORAGE_KEYS[accountType.toUpperCase()];
    // Always keep sorted by Date descending (newest first)
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    setItem(key, transactions);
};

const addTransaction = (accountType, transaction) => {
    const txns = getTransactions(accountType);
    txns.push(transaction);
    saveTransactions(accountType, txns);
};

const updateTransaction = (accountType, id, updatedData) => {
    const txns = getTransactions(accountType);
    const index = txns.findIndex(t => t.id === id);
    if (index !== -1) {
        txns[index] = { ...txns[index], ...updatedData };
        saveTransactions(accountType, txns);
    }
};

const deleteTransaction = (accountType, id) => {
    let txns = getTransactions(accountType);
    txns = txns.filter(t => t.id !== id);
    saveTransactions(accountType, txns);
};

// Older versions recorded shared wallet deposits as a personal "Savings Transfer" expense.
// Mark those entries (IDs prefixed PTXN-) as transfers so they stop counting as spending.
const migrateData = () => {
    const txns = getTransactions('personal');
    let changed = false;
    txns.forEach(t => {
        if (t.id && t.id.startsWith('PTXN-') && !t.isTransfer) {
            t.isTransfer = true;
            t.category = TRANSFER_CATEGORY;
            changed = true;
        }
    });
    if (changed) saveTransactions('personal', txns);
};

// Calculate running balance for an account up to a specific transaction point
// Note: Since array is descending (newest first), iterating backwards calculates chronologically.
const calculateRunningBalances = (transactions) => {
    let balance = 0;
    // Work on a copy reversed to chronological order
    const chrono = [...transactions].reverse();
    chrono.forEach(t => {
        if (t.type === 'credit') balance = roundMoney(balance + parseFloat(t.amount));
        else if (t.type === 'debit') balance = roundMoney(balance - parseFloat(t.amount));
        t.runningBalance = balance;
    });
    // Reverse back to newest first
    return chrono.reverse();
};

// Balance as of now, ignoring future-dated entries. Expects newest-first transactions with running balances.
const getCurrentBalance = (transactions) => {
    const latestPast = transactions.find(t => !isFuture(t.date));
    return latestPast ? latestPast.runningBalance : 0;
};

// --- Shared Members ---
const getSharedMembers = () => {
    const members = getItem(STORAGE_KEYS.SHARED_MEMBERS, null);
    // Seed defaults on first run only; an empty list is a valid choice
    if (!Array.isArray(members)) {
        const defaultMembers = ['Ankita', 'Jyoti'];
        setItem(STORAGE_KEYS.SHARED_MEMBERS, defaultMembers);
        return defaultMembers;
    }
    return members;
};
const saveSharedMembers = (members) => setItem(STORAGE_KEYS.SHARED_MEMBERS, members);

// --- Budgets ---
// budgets: { category: { mode: 'manual' | 'percentage', value } }
// Each budget remembers its own mode, so switching the mode never reinterprets saved limits.
// Older data stored plain numbers, which were read using the global mode at the time.
const getBudgets = () => {
    const raw = getItem(STORAGE_KEYS.BUDGETS, {});
    const legacyMode = getSettings().budgetMode;
    const budgets = {};
    for (const [cat, b] of Object.entries(raw)) {
        budgets[cat] = typeof b === 'object' && b !== null
            ? b
            : { mode: legacyMode, value: parseFloat(b) };
    }
    return budgets;
};
const saveBudgets = (budgets) => setItem(STORAGE_KEYS.BUDGETS, budgets);

// --- Goals ---
// Goal definitions only. Money saved lives in the personal ledger as transfers tagged with goalId.
const getGoals = () => {
    const goals = getItem(STORAGE_KEYS.GOALS, []);
    return Array.isArray(goals) ? goals : [];
};
const saveGoals = (goals) => setItem(STORAGE_KEYS.GOALS, goals);


// --- Global Data Actions ---
const exportAllData = () => {
    const data = {
        settings: getSettings(),
        personal: getTransactions('personal'),
        shared: getTransactions('shared'),
        company: getTransactions('company'),
        members: getSharedMembers(),
        budgets: getBudgets(),
        goals: getGoals()
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `FinTrack_PRO_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

const isValidTransaction = (t) =>
    t && typeof t === 'object' &&
    typeof t.id === 'string' && t.id !== '' &&
    (t.type === 'credit' || t.type === 'debit') &&
    Number.isFinite(parseFloat(t.amount)) && parseFloat(t.amount) > 0 &&
    !isNaN(new Date(t.date).getTime()) &&
    typeof t.category === 'string' &&
    typeof t.description === 'string';

// Checks the whole backup before writing anything, so a bad file can't leave data half-restored.
// Returns null on success, or an error message.
const importAllData = (jsonData) => {
    let data;
    try {
        data = JSON.parse(jsonData);
    } catch (e) {
        return 'File is not valid JSON.';
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Unrecognised backup format.';

    const accounts = ['personal', 'shared', 'company'];
    if (!accounts.some(acc => Array.isArray(data[acc]))) return 'Backup contains no transactions.';

    for (const acc of accounts) {
        if (data[acc] === undefined) continue;
        if (!Array.isArray(data[acc])) return `"${acc}" is not a list of transactions.`;
        const bad = data[acc].findIndex(t => !isValidTransaction(t));
        if (bad !== -1) return `Invalid transaction #${bad + 1} in "${acc}".`;
    }
    if (data.members !== undefined && !(Array.isArray(data.members) && data.members.every(m => typeof m === 'string'))) {
        return 'Invalid shared members list.';
    }
    if (data.budgets !== undefined && (typeof data.budgets !== 'object' || data.budgets === null || Array.isArray(data.budgets))) {
        return 'Invalid budgets.';
    }
    if (data.settings !== undefined && (typeof data.settings !== 'object' || data.settings === null)) {
        return 'Invalid settings.';
    }
    if (data.goals !== undefined && !(Array.isArray(data.goals) && data.goals.every(g =>
        g && typeof g.id === 'string' && typeof g.name === 'string' && Number.isFinite(parseFloat(g.target))))) {
        return 'Invalid goals.';
    }

    if (data.settings) {
        // Only keep known settings keys
        const settings = { ...DEFAULT_SETTINGS };
        Object.keys(DEFAULT_SETTINGS).forEach(k => { if (data.settings[k] !== undefined) settings[k] = data.settings[k]; });
        saveSettings(settings);
    }
    accounts.forEach(acc => {
        if (data[acc]) saveTransactions(acc, data[acc].map(t => ({ ...t, amount: roundMoney(t.amount) })));
    });
    if (data.members) saveSharedMembers(data.members);
    if (data.budgets) saveBudgets(data.budgets);
    if (data.goals) saveGoals(data.goals);
    return null;
};

const resetAllData = () => {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
};
