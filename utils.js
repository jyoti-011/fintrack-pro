/**
 * utils.js
 * Utility functions for FinTrack PRO
 */

const CURRENCY_LOCALES = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB' };

// Round to 2 decimals so float sums like 0.1 + 0.2 don't leak into totals and comparisons
const roundMoney = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const formatCurrency = (amount, currencyCode = 'INR') => {
    const formatter = new Intl.NumberFormat(CURRENCY_LOCALES[currencyCode] || 'en-IN', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2
    });
    return formatter.format(roundMoney(amount) + 0); // + 0 turns -0 into 0 (avoids "-₹0.00")
};

// Escape user-entered text before putting it into innerHTML
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', { 
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
};

const formatDateOnly = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
};

const formatTimeOnly = (dateString) => {
    return new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

const generateID =(prefix = 'TXN') => {
    return prefix + '-' + Math.random().toString(36).substring(2, 8).toUpperCase() + Date.now().toString().slice(-4);
};

const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-xmark';
    if (type === 'warning') icon = 'fa-triangle-exclamation';
    if (type === 'info') icon = 'fa-circle-info';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`;
    toast.querySelector('span').textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
            if(container.contains(toast)) container.removeChild(toast);
        }, 300);
    }, 4000);
};

const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};

// Date comparisons
const isThisMonth = (dStr) => {
    const d = new Date(dStr), t = new Date();
    return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
};

// Future-dated (scheduled) entries haven't happened yet
const isFuture = (dStr) => new Date(dStr) > new Date();

// YYYY-MM in the device's local timezone (dates are stored as UTC ISO strings,
// so slicing the string would put early-morning entries in the previous month)
const monthKey = (dStr) => {
    const d = new Date(dStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Transfers move money around (to/from savings, investments, goals, the shared wallet)
// but are not income or spending. These categories always count as transfers.
const TRANSFER_CATEGORIES = ['Savings Transfer', 'Investment'];
const isTransferTxn = (t) => !!t.isTransfer || TRANSFER_CATEGORIES.includes(t.category);
const isIncome = (t) => t.type === 'credit' && !isTransferTxn(t);
const isExpense = (t) => t.type === 'debit' && !isTransferTxn(t);

const TRANSFER_CATEGORY = 'Shared Wallet Transfer';
const GOAL_CATEGORY = 'Goal Savings';

// Icon for each category (Font Awesome), used on transaction rows, budgets and charts
const CATEGORY_ICONS = {
    'Salary': 'fa-money-bill-wave', 'Freelancing': 'fa-laptop-code', 'Business': 'fa-briefcase', 'Refund': 'fa-rotate-left',
    'Bonus': 'fa-gift', 'Cashback': 'fa-coins', 'Interest': 'fa-percent', 'Gift': 'fa-gift',
    'Savings Transfer': 'fa-piggy-bank', 'Investment': 'fa-chart-line', 'Goal Savings': 'fa-flag-checkered',
    'Shared Wallet Transfer': 'fa-people-arrows', 'Member Deposit': 'fa-hand-holding-dollar',
    'Rent': 'fa-house', 'Electricity Bill': 'fa-bolt', 'Electricity': 'fa-bolt', 'Water Bill': 'fa-droplet',
    'Gas': 'fa-fire-flame-simple', 'Internet': 'fa-wifi', 'Mobile Recharge': 'fa-mobile-screen',
    'Groceries': 'fa-basket-shopping', 'Medical': 'fa-kit-medical', 'Shopping': 'fa-bag-shopping',
    'Transportation': 'fa-bus', 'Fuel': 'fa-gas-pump', 'Restaurant': 'fa-utensils', 'Dining': 'fa-utensils',
    'Entertainment': 'fa-film', 'Personal Care': 'fa-spa', 'Gym': 'fa-dumbbell', 'Education': 'fa-graduation-cap',
    'Emergency': 'fa-truck-medical', 'Cleaning': 'fa-broom', 'Furniture': 'fa-couch', 'Kitchen': 'fa-kitchen-set',
    'Maintenance': 'fa-screwdriver-wrench', 'Travel': 'fa-plane', 'Company Fund': 'fa-building',
    'Client Payment': 'fa-handshake', 'Hosting': 'fa-server', 'Domain': 'fa-globe', 'Cloud Server': 'fa-cloud',
    'Software': 'fa-code', 'API Subscription': 'fa-plug', 'AI Tools': 'fa-robot', 'SSL': 'fa-lock',
    'Office Supplies': 'fa-paperclip', 'Advertising': 'fa-bullhorn', 'Marketing': 'fa-bullhorn',
    'Development': 'fa-code-branch', 'Testing': 'fa-vial', 'Hardware': 'fa-microchip'
};
const categoryIcon = (category) => CATEGORY_ICONS[category] || 'fa-tag';

// Circular progress ring used on goal and budget cards. Colour comes from the card's --goal-color.
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const progressRing = (pct, labelHTML) => `
    <div class="goal-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle class="goal-ring-track" cx="50" cy="50" r="${RING_RADIUS}"></circle>
            <circle class="goal-ring-fill" cx="50" cy="50" r="${RING_RADIUS}"
                stroke-dasharray="${RING_CIRCUMFERENCE}"
                stroke-dashoffset="${RING_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, pct)) / 100)}"></circle>
        </svg>
        <div class="goal-ring-label">${labelHTML}</div>
    </div>`;

// Colours for category breakdowns (charts and "Where it went")
const CHART_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6', '#0ea5e9', '#84cc16', '#f97316'];

// Category Mappings per Account Type
const CATEGORIES = {
    personal: {
        credit: ['Salary', 'Freelancing', 'Business', 'Refund', 'Bonus', 'Cashback', 'Interest', 'Gift', 'Savings Transfer', 'Others'],
        debit: ['Rent', 'Electricity Bill', 'Water Bill', 'Gas', 'Internet', 'Mobile Recharge', 'Groceries', 'Medical', 'Shopping', 'Transportation', 'Fuel', 'Restaurant', 'Entertainment', 'Personal Care', 'Gym', 'Education', 'Investment', 'Emergency', 'Savings Transfer', 'Others']
    },
    shared: {
        credit: ['Member Deposit', 'Refund', 'Others'],
        debit: ['Rent', 'Electricity', 'Groceries', 'Cleaning', 'Internet', 'Furniture', 'Kitchen', 'Maintenance', 'Travel', 'Dining', 'Others']
    },
    company: {
        credit: ['Company Fund', 'Client Payment', 'Refund', 'Interest', 'Others'],
        debit: ['Hosting', 'Domain', 'Cloud Server', 'Software', 'API Subscription', 'AI Tools', 'SSL', 'Office Supplies', 'Advertising', 'Marketing', 'Development', 'Testing', 'Hardware', 'Miscellaneous']
    }
};
