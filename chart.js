/**
 * chart.js
 * Handles initialization and updating of Chart.js instances.
 */

let quickPieChartInstance = null;
let barChartInstance = null;
let lineChartInstance = null;

const initCharts = () => {
    // Chart defaults
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim();
};

const updateCharts = (transactions) => {
    initCharts();
    
    updateQuickPieChart(transactions);
    updateBarChart(transactions);
    updateLineChart(transactions);
};

const getChartColors = () => {
    const isDark = document.body.classList.contains('dark-theme');
    return {
        income: '#10b981',
        expense: '#ef4444',
        gridLines: isDark ? '#334155' : '#e2e8f0',
        text: isDark ? '#94a3b8' : '#64748b'
    };
};

const updateQuickPieChart = (transactions) => {
    const ctx = document.getElementById('quick-pie-chart');
    if (!ctx) return;

    // Filter to expenses only for category breakdown
    const expenses = transactions.filter(t => t.type === 'expense');
    
    const categoryTotals = {};
    expenses.forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + parseFloat(t.amount);
    });

    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);

    // Pre-defined color palette for categories
    const colors = [
        '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
        '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4',
        '#84cc16', '#d946ef', '#64748b'
    ];

    if (quickPieChartInstance) {
        quickPieChartInstance.destroy();
    }

    if (data.length === 0) {
        // Render empty chart
        quickPieChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No Data'],
                datasets: [{ data: [1], backgroundColor: ['#cbd5e1'] }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
        return;
    }

    quickPieChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { boxWidth: 12, usePointStyle: true }
                }
            },
            cutout: '70%'
        }
    });
};

const updateBarChart = (transactions) => {
    const ctx = document.getElementById('bar-chart');
    if (!ctx) return;

    const colors = getChartColors();
    
    // Group expenses by month (last 6 months)
    const monthlyData = {};
    const today = new Date();
    
    // Initialize last 6 months with 0
    for(let i=5; i>=0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthYear = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthlyData[monthYear] = 0;
    }

    transactions.forEach(t => {
        if (t.type === 'expense') {
            const date = new Date(t.date);
            const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            if (monthlyData.hasOwnProperty(monthYear)) {
                monthlyData[monthYear] += parseFloat(t.amount);
            }
        }
    });

    if (barChartInstance) {
        barChartInstance.destroy();
    }

    barChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(monthlyData),
            datasets: [{
                label: 'Expenses',
                data: Object.values(monthlyData),
                backgroundColor: colors.expense,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: colors.gridLines }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
};

const updateLineChart = (transactions) => {
    const ctx = document.getElementById('line-chart');
    if (!ctx) return;

    const colors = getChartColors();
    
    // Group by month
    const monthlyIncome = {};
    const monthlyExpense = {};
    const today = new Date();
    
    for(let i=5; i>=0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthYear = d.toLocaleDateString('en-US', { month: 'short' });
        monthlyIncome[monthYear] = 0;
        monthlyExpense[monthYear] = 0;
    }

    transactions.forEach(t => {
        const date = new Date(t.date);
        const monthYear = date.toLocaleDateString('en-US', { month: 'short' });
        
        if (monthlyIncome.hasOwnProperty(monthYear)) {
            if (t.type === 'income') {
                monthlyIncome[monthYear] += parseFloat(t.amount);
            } else {
                monthlyExpense[monthYear] += parseFloat(t.amount);
            }
        }
    });

    if (lineChartInstance) {
        lineChartInstance.destroy();
    }

    lineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(monthlyIncome),
            datasets: [
                {
                    label: 'Income',
                    data: Object.values(monthlyIncome),
                    borderColor: colors.income,
                    backgroundColor: colors.income + '33',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Expense',
                    data: Object.values(monthlyExpense),
                    borderColor: colors.expense,
                    backgroundColor: colors.expense + '33',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: colors.gridLines }
                },
                x: {
                    grid: { display: false }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            }
        }
    });
};

// Export to be accessible
window.updateCharts = updateCharts;
