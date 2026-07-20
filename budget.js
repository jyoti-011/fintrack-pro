/**
 * budget.js
 * Handles Budget allocations, progress bars, and limit warnings.
 */

const Budget = {
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

        const mode = settings.budgetMode || 'manual';
        const isPercentage = mode === 'percentage';
        
        // Calculate this month's income and expenses
        let monthlyIncome = 0;
        let expensesByCategory = {};
        let totalAllocated = 0;
        let totalSpent = 0;

        transactions.forEach(t => {
            if (isThisMonth(t.date)) {
                const amt = parseFloat(t.amount);
                if (t.type === 'credit') monthlyIncome += amt;
                if (t.type === 'debit') {
                    expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + amt;
                    totalSpent += amt;
                }
            }
        });

        if (Object.keys(budgets).length === 0) {
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No budgets set yet. Click "Set Budget" to start.</div>';
        }

        for (const [category, allocationRaw] of Object.entries(budgets)) {
            const allocation = parseFloat(allocationRaw);
            let limitAmt = 0;
            let displayAllocation = '';

            if (isPercentage) {
                limitAmt = (monthlyIncome * allocation) / 100;
                displayAllocation = `${allocation}% (≈ ${formatCurrency(limitAmt, settings.currency)})`;
            } else {
                limitAmt = allocation;
                displayAllocation = formatCurrency(limitAmt, settings.currency);
            }

            totalAllocated += limitAmt;
            const spent = expensesByCategory[category] || 0;
            const remaining = limitAmt - spent;
            const percentUsed = limitAmt > 0 ? (spent / limitAmt) * 100 : 0;
            
            let colorClass = 'good';
            if (percentUsed > 80) colorClass = 'warning';
            if (percentUsed > 100) colorClass = 'danger';

            const item = document.createElement('div');
            item.className = 'budget-item';
            item.innerHTML = `
                <div class="budget-item-header">
                    <div>
                        <strong>${category}</strong>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400; margin-top: 4px;">Limit: ${displayAllocation}</div>
                    </div>
                    <div style="text-align: right;">
                        <span class="${colorClass === 'danger' ? 'text-debit' : ''}">${formatCurrency(spent, settings.currency)}</span>
                        <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400; margin-top: 4px;">Remaining: ${formatCurrency(remaining, settings.currency)}</div>
                    </div>
                </div>
                <div class="progress-container">
                    <div class="progress-header">
                        <span>${percentUsed.toFixed(1)}% Used</span>
                        <button class="btn-icon" style="padding:0; font-size:0.8rem;" onclick="removeBudget('${category}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill ${colorClass}" style="width: ${Math.min(percentUsed, 100)}%;"></div>
                    </div>
                </div>
            `;
            container.appendChild(item);
            
            // Check for alert
            if (percentUsed > 100) {
                showToast(`Budget exceeded for ${category}!`, 'warning');
            }
        }

        // Update Summary
        document.getElementById('budget-allocated').textContent = formatCurrency(totalAllocated, settings.currency);
        document.getElementById('budget-spent').textContent = formatCurrency(totalSpent, settings.currency);
        document.getElementById('budget-remaining').textContent = formatCurrency(totalAllocated - totalSpent, settings.currency);
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
