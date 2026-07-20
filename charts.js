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
            palette: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']
        };
    },

    render: (transactions) => {
        Charts.initDefaults();
        Charts.renderQuickCashFlow(transactions);
        Charts.renderIncomeExpense(transactions);
        Charts.renderCategoryDistribution(transactions);
    },

    renderQuickCashFlow: (transactions) => {
        const ctx = document.getElementById('quick-cashflow-chart');
        if (!ctx) return;
        const colors = Charts.getColors();

        let credit = 0, debit = 0;
        transactions.forEach(t => {
            if (isThisMonth(t.date)) {
                if (t.type === 'credit') credit += parseFloat(t.amount);
                else debit += parseFloat(t.amount);
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

    renderIncomeExpense: (transactions) => {
        const ctx = document.getElementById('chart-income-expense');
        if (!ctx) return;
        const colors = Charts.getColors();

        const dataPoints = {};
        const today = new Date();
        for(let i=5; i>=0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const key = d.toLocaleDateString('en-US', { month: 'short' });
            dataPoints[key] = { credit: 0, debit: 0 };
        }

        transactions.forEach(t => {
            const d = new Date(t.date);
            const key = d.toLocaleDateString('en-US', { month: 'short' });
            if (dataPoints[key]) {
                if (t.type === 'credit') dataPoints[key].credit += parseFloat(t.amount);
                else dataPoints[key].debit += parseFloat(t.amount);
            }
        });

        if (incomeExpenseChart) incomeExpenseChart.destroy();

        incomeExpenseChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(dataPoints),
                datasets: [
                    {
                        label: 'Credit',
                        data: Object.values(dataPoints).map(d => d.credit),
                        backgroundColor: colors.credit,
                        borderRadius: 4
                    },
                    {
                        label: 'Debit',
                        data: Object.values(dataPoints).map(d => d.debit),
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

    renderCategoryDistribution: (transactions) => {
        const ctx = document.getElementById('chart-category');
        if (!ctx) return;
        const colors = Charts.getColors();

        const catData = {};
        transactions.forEach(t => {
            if (t.type === 'debit') {
                catData[t.category] = (catData[t.category] || 0) + parseFloat(t.amount);
            }
        });

        if (categoryChart) categoryChart.destroy();

        categoryChart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: Object.keys(catData),
                datasets: [{
                    data: Object.values(catData),
                    backgroundColor: colors.palette,
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
