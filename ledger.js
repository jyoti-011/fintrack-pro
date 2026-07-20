/**
 * ledger.js
 * Handles rendering the Bank Statement style transaction ledger.
 */

const Ledger = {
    itemsPerPage: 15,
    currentPage: 1,

    render: (transactions, accountType, settings) => {
        const tbody = document.getElementById('ledger-table-body');
        const pagination = document.getElementById('pagination-controls');
        tbody.innerHTML = '';
        
        if (transactions.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 3rem; color: var(--text-muted);">No transactions found for this account.</td></tr>`;
            pagination.innerHTML = '';
            return;
        }

        // Running balances are now pre-calculated globally in script.js
        // so we just use the transactions array directly
        const totalPages = Math.ceil(transactions.length / Ledger.itemsPerPage);
        if (Ledger.currentPage > totalPages) Ledger.currentPage = Math.max(1, totalPages);
        
        const startIdx = (Ledger.currentPage - 1) * Ledger.itemsPerPage;
        const pageData = transactions.slice(startIdx, startIdx + Ledger.itemsPerPage);
        const curr = settings.currency;

        pageData.forEach(t => {
            const tr = document.createElement('tr');
            const isCredit = t.type === 'credit';
            const isDebit = t.type === 'debit';
            
            let creditHtml = isCredit ? `<span class="text-credit">+${formatCurrency(t.amount, curr)}</span>` : '-';
            let debitHtml = isDebit ? `<span class="text-debit">-${formatCurrency(t.amount, curr)}</span>` : '-';
            
            // Build Description String
            let descStr = `<strong>${t.description}</strong>`;
            if (accountType === 'shared' && t.member) descStr += `<br><small class="text-muted">By: ${t.member}</small>`;
            if (t.notes) descStr += `<br><small class="text-muted">${t.notes}</small>`;

            tr.innerHTML = `
                <td>${formatDateTime(t.date)}</td>
                <td><span style="font-family: monospace; color: var(--text-muted);">${t.id}<br>${t.refNo || ''}</span></td>
                <td>
                    ${descStr}
                    <div class="mt-2"><span class="badge ${isCredit ? 'credit' : 'debit'}">${t.category}</span></div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">Via ${t.paymentMethod}</div>
                </td>
                <td style="font-weight: 500;">${creditHtml}</td>
                <td style="font-weight: 500;">${debitHtml}</td>
                <td style="font-weight: 600;">${formatCurrency(t.runningBalance, curr)}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="editTxn('${t.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn delete" onclick="deleteTxn('${t.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        Ledger.renderPagination(totalPages, pagination);
    },

    renderPagination: (totalPages, container) => {
        container.innerHTML = '';
        if (totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        prevBtn.disabled = Ledger.currentPage === 1;
        prevBtn.onclick = () => { Ledger.currentPage--; window.updateUI(); };
        container.appendChild(prevBtn);

        // Show max 5 page buttons to prevent overflow
        let startPage = Math.max(1, Ledger.currentPage - 2);
        let endPage = Math.min(totalPages, startPage + 4);
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === Ledger.currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.onclick = () => { Ledger.currentPage = i; window.updateUI(); };
            container.appendChild(btn);
        }

        const nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        nextBtn.disabled = Ledger.currentPage === totalPages;
        nextBtn.onclick = () => { Ledger.currentPage++; window.updateUI(); };
        container.appendChild(nextBtn);
    }
};

window.Ledger = Ledger;
