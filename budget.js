/**
 * budget.js
 * Handles Budget allocations, progress bars, and limit warnings.
 */

const Budget = {
    // Categories already warned about ("YYYY-MM|category"), so the toast shows once rather than on every re-render
    alerted: new Set(),

    render: (transactions, accountType, settings) => {
        const budgets = getBudgets();
        const container = document.getElementById('budget-list');
        const modeSelect = document.getElementById('budget-allocation-mode');
        
        modeSelect.value = settings.budgetMode || 'manual';
        
        container.innerHTML = '';
        
        if (accountType !== 'personal') {
            container.innerHTML = '<div class="alert-box info">Budgeting is currently only available for the Personal account.</div>';
            return;
        }

        // Calculate this month's income and expenses (scheduled future entries excluded)
        let monthlyIncome = 0;
        let expensesByCategory = {};
        let totalAllocated = 0;
        let totalSpent = 0;

        transactions.forEach(t => {
            if (isThisMonth(t.date) && !isFuture(t.date)) {
                const amt = parseFloat(t.amount);
                if (isIncome(t)) monthlyIncome = roundMoney(monthlyIncome + amt);
                if (isExpense(t)) {
                    expensesByCategory[t.category] = roundMoney((expensesByCategory[t.category] || 0) + amt);
                }
            }
        });

        if (Object.keys(budgets).length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No budgets set yet. Click "Set Budget" to start.</div>';
        }

        // Each budget uses the mode it was created with
        for (const [category, { mode, value }] of Object.entries(budgets)) {
            let limitAmt = 0;
            let displayAllocation = '';

            if (mode === 'percentage') {
                limitAmt = roundMoney((monthlyIncome * value) / 100);
                displayAllocation = `${value}% of income (≈ ${formatCurrency(limitAmt, settings.currency)})`;
            } else {
                limitAmt = value;
                displayAllocation = formatCurrency(limitAmt, settings.currency);
            }

            // Summary totals only cover budgeted categories, so Remaining compares like with like
            const spent = expensesByCategory[category] || 0;
            totalAllocated = roundMoney(totalAllocated + limitAmt);
            totalSpent = roundMoney(totalSpent + spent);
            const remaining = roundMoney(limitAmt - spent);
            // A zero limit (e.g. percentage mode before any income this month) is exceeded by any spending
            const percentUsed = limitAmt > 0 ? (spent / limitAmt) * 100 : (spent > 0 ? Infinity : 0);
            const usedLabel = Number.isFinite(percentUsed) ? `${percentUsed.toFixed(1)}% Used` : 'Over limit (no allocation yet)';

            let colorClass = 'good';
            if (percentUsed > 80) colorClass = 'warning';
            if (percentUsed > 100) colorClass = 'danger';

            const item = document.createElement('div');
            item.className = 'budget-item';
            item.innerHTML = `
                <div class="budget-item-header">
                    <div>
                        <strong>${escapeHTML(category)}</strong>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400; margin-top: 4px;">Limit: ${displayAllocation}</div>
                    </div>
                    <div style="text-align: right;">
                        <span class="${colorClass === 'danger' ? 'text-debit' : ''}">${formatCurrency(spent, settings.currency)}</span>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400; margin-top: 4px;">Remaining: ${formatCurrency(remaining, settings.currency)}</div>
                    </div>
                </div>
                <div class="progress-container">
                    <div class="progress-header">
                        <span>${usedLabel}</span>
                        <button class="btn-icon" style="padding:0; font-size:0.8rem;" data-action="remove-budget" data-id="${escapeHTML(category)}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill ${colorClass}" style="width: ${Math.min(percentUsed, 100)}%;"></div>
                    </div>
                </div>
            `;
            container.appendChild(item);
            
            // Check for alert
            const alertKey = `${monthKey(new Date())}|${category}`;
            if (percentUsed > 100 && !Budget.alerted.has(alertKey)) {
                Budget.alerted.add(alertKey);
                showToast(`Budget exceeded for ${category}!`, 'warning');
            }
        }

        // Update Summary
        document.getElementById('budget-allocated').textContent = formatCurrency(totalAllocated, settings.currency);
        document.getElementById('budget-spent').textContent = formatCurrency(totalSpent, settings.currency);
        document.getElementById('budget-remaining').textContent = formatCurrency(roundMoney(totalAllocated - totalSpent), settings.currency);
    }
};

window.Budget = Budget;
window.removeBudget = (category) => {
    const b = getBudgets();
    delete b[category];
    saveBudgets(b);
    showToast(`Budget for ${category} removed.`);
    window.updateUI();
};
