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
    SHARED_MEMBERS: 'fintrack_pro_shared_members'
};

const DEFAULT_SETTINGS = {
    currency: 'INR',
    theme: 'light',
    budgetMode: 'manual', // 'manual' or 'percentage'
    lastRecurringCheck: new Date().toISOString()
};

// --- Generic Storage Helpers ---
const getItem = (key, defaultVal) => {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultVal;
};
const setItem = (key, data) => localStorage.setItem(key, JSON.stringify(data));

// --- Settings ---
const getSettings = () => getItem(STORAGE_KEYS.SETTINGS, { ...DEFAULT_SETTINGS });
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

// Calculate running balance for an account up to a specific transaction point
// Note: Since array is descending (newest first), iterating backwards calculates chronologically.
const calculateRunningBalances = (transactions) => {
    let balance = 0;
    // Work on a copy reversed to chronological order
    const chrono = [...transactions].reverse();
    chrono.forEach(t => {
        if (t.type === 'credit') balance += parseFloat(t.amount);
        else if (t.type === 'debit') balance -= parseFloat(t.amount);
        t.runningBalance = balance;
    });
    // Reverse back to newest first
    return chrono.reverse();
};

const getAccountTotals = (accountType) => {
    const txns = getTransactions(accountType);
    let credit = 0, debit = 0;
    txns.forEach(t => {
        if(t.type === 'credit') credit += parseFloat(t.amount);
        if(t.type === 'debit') debit += parseFloat(t.amount);
    });
    return { credit, debit, balance: credit - debit };
};

// --- Shared Members ---
const getSharedMembers = () => getItem(STORAGE_KEYS.SHARED_MEMBERS, []);
const saveSharedMembers = (members) => setItem(STORAGE_KEYS.SHARED_MEMBERS, members);

// --- Budgets ---
// budgets: { category: amount_or_percentage }
const getBudgets = () => getItem(STORAGE_KEYS.BUDGETS, {});
const saveBudgets = (budgets) => setItem(STORAGE_KEYS.BUDGETS, budgets);

// --- Savings ---
const getSavingsData = () => getItem(STORAGE_KEYS.SAVINGS, { balance: 0, goal: 0 });
const saveSavingsData = (data) => setItem(STORAGE_KEYS.SAVINGS, data);

// --- Global Data Actions ---
const exportAllData = () => {
    const data = {
        settings: getSettings(),
        personal: getTransactions('personal'),
        shared: getTransactions('shared'),
        company: getTransactions('company'),
        members: getSharedMembers(),
        budgets: getBudgets(),
        savings: getSavingsData()
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `FinTrack_PRO_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

const importAllData = (jsonData) => {
    try {
        const data = JSON.parse(jsonData);
        if(data.settings) saveSettings(data.settings);
        if(data.personal) saveTransactions('personal', data.personal);
        if(data.shared) saveTransactions('shared', data.shared);
        if(data.company) saveTransactions('company', data.company);
        if(data.members) saveSharedMembers(data.members);
        if(data.budgets) saveBudgets(data.budgets);
        if(data.savings) saveSavingsData(data.savings);
        return true;
    } catch(e) {
        console.error("Import failed:", e);
        return false;
    }
};

const resetAllData = () => {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
};
