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

// Transfers between accounts move money but are not income or spending
const isIncome = (t) => t.type === 'credit' && !t.isTransfer;
const isExpense = (t) => t.type === 'debit' && !t.isTransfer;

const TRANSFER_CATEGORY = 'Shared Wallet Transfer';
const GOAL_CATEGORY = 'Goal Savings';

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
