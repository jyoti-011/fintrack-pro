/**
 * utils.js
 * Utility functions for FinTrack PRO
 */

const formatCurrency = (amount, currencyCode = 'INR') => {
    const formatter = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currencyCode,
        minimumFractionDigits: 2
    });
    return formatter.format(amount);
};

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

const generateID = (prefix = 'TXN') => {
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

    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
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

// Date comparisons for filters
const isToday = (dStr) => {
    const d = new Date(dStr), t = new Date();
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
};
const isThisWeek = (dStr) => {
    const d = new Date(dStr), t = new Date();
    const first = new Date(t.setDate(t.getDate() - t.getDay()));
    const last = new Date(first); last.setDate(last.getDate() + 6);
    return d >= first && d <= last;
};
const isThisMonth = (dStr) => {
    const d = new Date(dStr), t = new Date();
    return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
};
const isThisYear = (dStr) => {
    const d = new Date(dStr), t = new Date();
    return d.getFullYear() === t.getFullYear();
};

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
