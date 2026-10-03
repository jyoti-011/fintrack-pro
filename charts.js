/**
 * charts.js
 * Advanced Analytics for FinTrack PRO
 */

let quickCashFlowChart = null;
let incomeExpenseChart = null;
let categoryChart = null;

const Charts = {
    initDefaults: () => {
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
    },

    getColors: () => {
        const isDark = document.body.classList.contains('dark-theme');
        return {
            credit: '#10b981',
            debit: '#ef4444',
            gridLines: isDark ? '#334155' : '#e2e8f0',
            palette: CHART_PALETTE
        };
    },

    render: (transactions, period) => {
        Charts.initDefaults();
        Charts.renderQuickCashFlow(transactions, period);
        Charts.renderIncomeExpense(transactions, period);
        Charts.renderCategoryDistribution(transactions, period);
    },

    // Cash flow for the current period (salary cycle on Personal, else calendar month)
    renderQuickCashFlow: (transactions, period) => {
        const ctx = document.getElementById('quick-cashflow-chart');
        if (!ctx) return;
        const colors = Charts.getColors();

        let credit = 0, debit = 0;
        transactions.forEach(t => {
            if (period ? isInPeriod(t, period) : (isThisMonth(t.date) && !isFuture(t.date))) {
                if (isIncome(t)) credit += parseFloat(t.amount);
                else if (isExpense(t)) debit += parseFloat(t.amount);
            }
        });

        if (quickCashFlowChart) quickCashFlowChart.destroy();

        quickCashFlowChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Credit (In)', 'Debit (Out)'],
                datasets: [{
                    data: [credit, debit],
                    backgroundColor: [colors.credit, colors.debit],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '75%',
                plugins: { legend: { position: 'bottom' } }
            }
        });
    },

    // Money in vs spent for the last 6 salary months (Personal with a salary) or calendar months
    renderIncomeExpense: (transactions, period) => {
        const ctx = document.getElementById('chart-income-expense');
        if (!ctx) return;
        const colors = Charts.getColors();
        let labels = [], credit = [], debit = [];

        if (period && period.isSalaryCycle) {
            const cycles = getPeriodHistory(transactions).filter(h => h.byCycle && h.key !== 'before').slice(0, 6).reverse();
            labels = cycles.map(h => cycleMonthName(h));
            credit = cycles.map(h => h.income);
            debit = cycles.map(h => h.expense);
        } else {
            // Key by YYYY-MM so the same month from a previous year isn't merged in
            const dataPoints = {};
            const today = new Date();
            for(let i=5; i>=0; i--) {
                const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
                dataPoints[monthKey(d)] = { credit: 0, debit: 0 };
                labels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
            }
            transactions.forEach(t => {
                const point = dataPoints[monthKey(t.date)];
                if (point && !isFuture(t.date)) {
                    if (isIncome(t)) point.credit += parseFloat(t.amount);
                    else if (isExpense(t)) point.debit += parseFloat(t.amount);
                }
            });
            credit = Object.values(dataPoints).map(d => d.credit);
            debit = Object.values(dataPoints).map(d => d.debit);
        }

        const title = document.getElementById('chart-income-expense-title');
        if (title) title.textContent = period && period.isSalaryCycle ? 'Money In vs Spent (Last 6 Salary Months)' : 'Money In vs Spent (Last 6 Months)';

        if (incomeExpenseChart) incomeExpenseChart.destroy();

        incomeExpenseChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Money In',
                        data: credit,
                        backgroundColor: colors.credit,
                        borderRadius: 4
                    },
                    {
                        label: 'Spent',
                        data: debit,
                        backgroundColor: colors.debit,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: colors.gridLines } },
                    x: { grid: { display: false } }
                }
            }
        });
    },

    // Spending by category for the chosen range: this month, last 6 months, or all time
    categoryRange: 'current',

    // Earliest date included in the chosen range (null = all time)
    getRangeStart: (transactions, period) => {
        if (Charts.categoryRange === 'current') return period ? period.start : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        if (Charts.categoryRange === '6') {
            if (period && period.isSalaryCycle) {
                const starts = getSalaryCycleStarts(transactions);
                return starts[Math.max(0, starts.length - 6)];
            }
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth() - 5, 1);
        }
        return null;
    },

    renderCategoryDistribution: (transactions, period) => {
        const ctx = document.getElementById('chart-category');
        if (!ctx) return;
        const colors = Charts.getColors();
        const rangeStart = Charts.getRangeStart(transactions, period);

        const catData = {};
        transactions.forEach(t => {
            if (isExpense(t) && !isFuture(t.date) && (!rangeStart || new Date(t.date) >= rangeStart)) {
                catData[t.category] = roundMoney((catData[t.category] || 0) + parseFloat(t.amount));
            }
        });

        if (categoryChart) categoryChart.destroy();

        const labels = Object.keys(catData);
        const empty = labels.length === 0;
        categoryChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: empty ? ['No spending in this period'] : labels,
                datasets: [{
                    data: empty ? [1] : Object.values(catData),
                    backgroundColor: empty ? ['#cbd5e1'] : labels.map((_, i) => colors.palette[i % colors.palette.length]),
                    borderWidth: 1,
                    borderColor: colors.gridLines
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } }
            }
        });
    }
};

window.Charts = Charts;
