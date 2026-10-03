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
            container.innerHTML = emptyState('fa-bullseye', 'Personal account only', 'Budgeting is available on the Personal account.');
            return;
        }

        // Income and expenses for the current salary cycle (calendar month until a salary is recorded)
        const period = getCurrentPeriod(transactions, accountType);
        let monthlyIncome = 0;
        let expensesByCategory = {};
        let totalAllocated = 0;
        let totalSpent = 0;

        transactions.forEach(t => {
            if (isInPeriod(t, period)) {
                const amt = parseFloat(t.amount);
                if (isIncome(t)) monthlyIncome = roundMoney(monthlyIncome + amt);
                if (isExpense(t)) {
                    expensesByCategory[t.category] = roundMoney((expensesByCategory[t.category] || 0) + amt);
                }
            }
        });

        if (Object.keys(budgets).length === 0) {
            container.innerHTML = `
                <div class="goals-empty card">
                    <div class="goals-empty-icon budget"><i class="fa-solid fa-bullseye"></i></div>
                    <h3>Give every rupee a job</h3>
                    <p>Set a monthly limit for categories like Rent, Groceries or Restaurants and see at a glance how much is left.</p>
                    <button class="btn btn-primary" data-action="add-budget"><i class="fa-solid fa-plus"></i> Set your first budget</button>
                </div>`;
        }

        const curr = settings.currency;
        // Status colours: green while under 80%, amber up to the limit, red once over
        const STATUS = {
            good: { color: '#10b981', kind: 'on-track', icon: 'fa-circle-check' },
            warning: { color: '#f59e0b', kind: 'behind', icon: 'fa-triangle-exclamation' },
            danger: { color: '#f43f5e', kind: 'over', icon: 'fa-circle-exclamation' }
        };

        // Each budget uses the mode it was created with
        for (const [category, { mode, value }] of Object.entries(budgets)) {
            let limitAmt = 0;
            let displayAllocation = '';

            if (mode === 'percentage') {
                limitAmt = roundMoney((monthlyIncome * value) / 100);
                displayAllocation = `${value}% of income`;
            } else {
                limitAmt = value;
                displayAllocation = 'Fixed monthly limit';
            }

            // Summary totals only cover budgeted categories, so Remaining compares like with like
            const spent = expensesByCategory[category] || 0;
            totalAllocated = roundMoney(totalAllocated + limitAmt);
            totalSpent = roundMoney(totalSpent + spent);
            const remaining = roundMoney(limitAmt - spent);
            // A zero limit (e.g. percentage mode before any income this month) is exceeded by any spending
            const percentUsed = limitAmt > 0 ? (spent / limitAmt) * 100 : (spent > 0 ? Infinity : 0);

            let colorClass = 'good';
            if (percentUsed > 80) colorClass = 'warning';
            if (percentUsed > 100) colorClass = 'danger';
            const status = STATUS[colorClass];

            let statusText;
            if (!Number.isFinite(percentUsed)) statusText = 'Over limit · no income yet for this % budget';
            else if (percentUsed > 100) statusText = `Over by ${formatCurrency(-remaining, curr)}`;
            else if (percentUsed > 80) statusText = `Nearly there · ${formatCurrency(remaining, curr)} left`;
            else statusText = `On track · ${formatCurrency(remaining, curr)} left`;

            const ringLabel = Number.isFinite(percentUsed)
                ? `<strong>${percentUsed.toFixed(0)}%</strong><span>used</span>`
                : '<strong>!</strong><span>over</span>';

            const item = document.createElement('div');
            item.className = 'goal-card budget-card';
            item.style.setProperty('--goal-color', status.color);
            item.innerHTML = `
                <div class="goal-card-top">
                    <div class="goal-icon"><i class="fa-solid ${categoryIcon(category)}"></i></div>
                    <div class="goal-title">
                        <h4>${escapeHTML(category)}</h4>
                        <span>${displayAllocation}</span>
                    </div>
                    <div class="goal-menu">
                        <button class="btn-icon" title="Remove budget" data-action="remove-budget" data-id="${escapeHTML(category)}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="goal-body">
                    ${progressRing(Number.isFinite(percentUsed) ? percentUsed : 100, ringLabel)}
                    <div class="goal-figures">
                        <div><span>Spent</span><strong>${formatCurrency(spent, curr)}</strong></div>
                        <div><span>Limit</span><strong>${formatCurrency(limitAmt, curr)}</strong></div>
                        <div><span>${remaining < 0 ? 'Over by' : 'Left'}</span><strong>${formatCurrency(Math.abs(remaining), curr)}</strong></div>
                    </div>
                </div>
                <div class="goal-status status-${status.kind}"><i class="fa-solid ${status.icon}"></i> ${statusText}</div>
            `;
            container.appendChild(item);
            
            // Check for alert
            const alertKey = `${period.start.toISOString()}|${category}`;
            if (percentUsed > 100 && !Budget.alerted.has(alertKey)) {
                Budget.alerted.add(alertKey);
                showToast(`Budget exceeded for ${category}!`, 'warning');
            }
        }

        // Update Summary
        document.getElementById('budget-allocated').textContent = formatCurrency(totalAllocated, curr);
        document.getElementById('budget-spent').textContent = formatCurrency(totalSpent, curr);
        document.getElementById('budget-remaining').textContent = formatCurrency(roundMoney(totalAllocated - totalSpent), curr);
        document.getElementById('budget-sub').textContent = totalAllocated > 0
            ? `of ${formatCurrency(totalAllocated, curr)} across ${Object.keys(budgets).length} budget${Object.keys(budgets).length > 1 ? 's' : ''}`
            : 'No budgets set yet';

        const pct = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;
        const bar = document.getElementById('budget-bar');
        bar.style.width = `${Math.min(100, pct)}%`;
        bar.classList.toggle('over', pct > 85);
        document.getElementById('budget-bar-text').textContent = totalAllocated > 0
            ? `${pct.toFixed(0)}% of your budgets used this month`
            : 'Set budgets to track your spending limits';
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
