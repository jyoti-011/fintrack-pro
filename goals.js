/**
 * goals.js
 * Savings goals: targets you save towards from your salary.
 * Money added to a goal is recorded in the Personal ledger as a transfer (debit) tagged with
 * goalId, and withdrawals as a transfer back (credit). Transfers reduce the available balance
 * but never count as income or spending.
 */

const GOAL_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6'];
const GOAL_ICONS = ['fa-house', 'fa-car', 'fa-plane', 'fa-graduation-cap', 'fa-ring', 'fa-laptop',
    'fa-umbrella-beach', 'fa-shield-heart', 'fa-baby', 'fa-mobile-screen', 'fa-heart-pulse', 'fa-piggy-bank'];

// Next occurrence of a day-of-month (at 9 AM) strictly after now
const nextSaveDate = (day) => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const d = new Date(now.getFullYear(), now.getMonth(), Math.min(day, lastDay), 9, 0, 0);
    return d > now ? d : addMonthsClamped(d.toISOString(), 1, day);
};

// Whole months from now until a YYYY-MM-DD date (at least 1 while the date is in the future)
const monthsUntil = (dateStr) => {
    const end = new Date(dateStr + 'T23:59:59');
    const now = new Date();
    if (end < now) return 0;
    const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
    return Math.max(1, months);
};

const monthLabel = (date) => date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const Goals = {
    editingId: null,
    moneyGoalId: null,
    moneyMode: 'add',

    // Money in the goal: starting amount + ledger contributions - withdrawals
    getSaved: (goal, txns) => {
        let saved = parseFloat(goal.startingAmount) || 0;
        txns.forEach(t => {
            if (t.goalId !== goal.id || isFuture(t.date)) return;
            if (t.type === 'debit') saved += parseFloat(t.amount);
            else if (t.type === 'credit') saved -= parseFloat(t.amount);
        });
        return roundMoney(saved);
    },

    // Net amount moved into the goal during the current salary cycle
    getSavedThisMonth: (goalId, txns, period) => roundMoney(txns.reduce((sum, t) => {
        if (t.goalId !== goalId || !isInPeriod(t, period)) return sum;
        return sum + (t.type === 'debit' ? 1 : -1) * parseFloat(t.amount);
    }, 0)),

    // This salary cycle's available balance (money left from the latest salary)
    getAvailable: () => {
        const personal = calculateRunningBalances(getTransactions('personal'));
        return getCycleBalances(personal, getCurrentPeriod(personal, 'personal')).available;
    },

    // Where the goal stands: reached, on track, behind, overdue, or an ETA from the monthly plan
    getStatus: (goal, saved, curr) => {
        const target = parseFloat(goal.target);
        const remaining = roundMoney(target - saved);
        const monthly = parseFloat(goal.monthlyAmount) || 0;

        if (remaining <= 0) return { kind: 'complete', icon: 'fa-trophy', text: 'Goal reached!' };

        if (goal.targetDate) {
            const months = monthsUntil(goal.targetDate);
            if (months === 0) return { kind: 'behind', icon: 'fa-circle-exclamation', text: `Past target date · ${formatCurrency(remaining, curr)} to go` };
            const needed = roundMoney(remaining / months);
            if (monthly >= needed) return { kind: 'on-track', icon: 'fa-circle-check', text: `On track · needs ${formatCurrency(needed, curr)}/month` };
            return { kind: 'behind', icon: 'fa-triangle-exclamation', text: `Save ${formatCurrency(needed, curr)}/month to make it` };
        }

        if (monthly > 0) {
            const months = Math.ceil(remaining / monthly);
            const eta = new Date();
            eta.setMonth(eta.getMonth() + months);
            return { kind: 'eta', icon: 'fa-flag-checkered', text: `Reach it by ${monthLabel(eta)} at this pace` };
        }
        return { kind: 'idle', icon: 'fa-circle-info', text: 'Set a monthly amount to see when you\'ll get there' };
    },

    // The cycle that counts as "already handled" when salary-triggered auto-save is switched on:
    // the current salary month (so it starts with the next salary), or the creation time if no salary yet
    currentCycleMarker: (fallbackISO) => {
        const starts = getSalaryCycleStarts(getTransactions('personal'));
        return starts.length ? starts[starts.length - 1].toISOString() : fallbackISO;
    },

    // Auto-save each goal's monthly amount, either when a new salary is entered (default) or on a
    // fixed day of the month. Catches up on missed months and stops once the goal is reached.
    // Safe to call repeatedly: each salary month / save day is handled once.
    runAutoSave: () => {
        const goals = getGoals();
        const now = new Date();
        const starts = getSalaryCycleStarts(getTransactions('personal'));
        let count = 0;
        let changed = false;

        goals.forEach(goal => {
            const monthly = parseFloat(goal.monthlyAmount) || 0;
            if (!goal.autoSave || monthly <= 0) return;
            let saved = Goals.getSaved(goal, getTransactions('personal'));
            const save = (date) => {
                const amount = roundMoney(Math.min(monthly, goal.target - saved));
                addTransaction('personal', Goals.buildTxn(goal, 'add', amount, date, 'Auto-saved from salary'));
                saved = roundMoney(saved + amount);
                count++;
                changed = true;
            };

            if ((goal.autoSaveTrigger || 'salary') === 'salary') {
                // Goals set up before salary-triggered saving existed: start from the next salary
                if (!goal.lastAutoCycleStart) {
                    goal.lastAutoCycleStart = Goals.currentCycleMarker(goal.createdAt || now.toISOString());
                    changed = true;
                }
                const last = new Date(goal.lastAutoCycleStart);
                starts.filter(s => s > last).forEach(s => {
                    if (saved < goal.target) save(new Date(s.getTime() + 1000).toISOString()); // just after the salary
                    goal.lastAutoCycleStart = s.toISOString();
                    changed = true;
                });
            } else if (goal.nextAutoDate) {
                while (new Date(goal.nextAutoDate) <= now && saved < goal.target) {
                    save(goal.nextAutoDate);
                    goal.nextAutoDate = addMonthsClamped(goal.nextAutoDate, 1, goal.saveDay).toISOString();
                }
            }
        });

        if (changed) saveGoals(goals);
        if (count > 0) showToast(`Auto-saved ${count} goal contribution(s).`, 'info');
    },

    buildTxn: (goal, mode, amount, date, notes = '') => ({
        id: generateID('GOAL'),
        type: mode === 'add' ? 'debit' : 'credit',
        amount,
        date,
        category: GOAL_CATEGORY,
        description: mode === 'add' ? `Saved for ${goal.name}` : `Withdrawn from ${goal.name}`,
        paymentMethod: 'Net Banking',
        refNo: '',
        notes,
        isRecurring: false,
        isTransfer: true,
        goalId: goal.id
    }),

    render: (transactions, settings) => {
        const grid = document.getElementById('goals-grid');
        if (!grid) return;
        const curr = settings.currency;
        const goals = getGoals();
        const period = getCurrentPeriod(transactions, 'personal');

        // Summary banner
        let totalSaved = 0, totalTarget = 0, monthly = 0, thisMonth = 0, completed = 0;
        const rows = goals.map(goal => {
            const saved = Goals.getSaved(goal, transactions);
            const done = saved >= goal.target;
            totalSaved += Math.min(saved, goal.target);
            totalTarget += parseFloat(goal.target);
            if (!done) monthly += parseFloat(goal.monthlyAmount) || 0;
            thisMonth += Goals.getSavedThisMonth(goal.id, transactions, period);
            if (done) completed++;
            return { goal, saved };
        });

        const income = transactions.filter(t => isIncome(t) && isInPeriod(t, period))
            .reduce((s, t) => s + parseFloat(t.amount), 0);
        const overallPct = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0;

        document.getElementById('goals-total-saved').textContent = formatCurrency(totalSaved, curr);
        document.getElementById('goals-total-sub').textContent = goals.length
            ? `of ${formatCurrency(totalTarget, curr)} across ${goals.length} goal${goals.length > 1 ? 's' : ''} · ${overallPct.toFixed(0)}% there`
            : 'Create a goal to start saving towards it';
        document.getElementById('goals-total-bar').style.width = `${overallPct}%`;
        document.getElementById('goals-monthly').textContent = formatCurrency(monthly, curr);
        document.getElementById('goals-monthly-pct').textContent = income > 0
            ? `${((monthly / income) * 100).toFixed(0)}% of this month's income`
            : 'No income recorded this month';
        document.getElementById('goals-this-month').textContent = formatCurrency(thisMonth, curr);
        document.getElementById('goals-completed').textContent = `${completed} / ${goals.length}`;

        if (goals.length === 0) {
            grid.innerHTML = `
                <div class="goals-empty card">
                    <div class="goals-empty-icon"><i class="fa-solid fa-mountain-sun"></i></div>
                    <h3>Dream it. Plan it. Save for it.</h3>
                    <p>A new phone, a trip, an emergency fund: set a target, choose how much of your salary goes towards it each month, and watch it grow.</p>
                    <button class="btn btn-primary" data-action="goal-new"><i class="fa-solid fa-plus"></i> Create your first goal</button>
                </div>`;
            return;
        }

        // Unfinished goals first, then by nearest deadline
        rows.sort((a, b) => {
            const aDone = a.saved >= a.goal.target, bDone = b.saved >= b.goal.target;
            if (aDone !== bDone) return aDone ? 1 : -1;
            return (a.goal.targetDate || '9999').localeCompare(b.goal.targetDate || '9999');
        });

        grid.innerHTML = rows.map(({ goal, saved }) => Goals.cardHTML(goal, saved, transactions, curr, period)).join('');
    },

    cardHTML: (goal, saved, transactions, curr, period) => {
        const color = GOAL_COLORS.includes(goal.color) ? goal.color : GOAL_COLORS[0];
        const icon = GOAL_ICONS.includes(goal.icon) ? goal.icon : 'fa-piggy-bank';
        const pct = Math.min(100, Math.max(0, (saved / goal.target) * 100));
        const remaining = Math.max(0, roundMoney(goal.target - saved));
        const status = Goals.getStatus(goal, saved, curr);
        const done = status.kind === 'complete';
        const monthly = parseFloat(goal.monthlyAmount) || 0;
        const thisMonth = Goals.getSavedThisMonth(goal.id, transactions, period);
        const id = escapeHTML(goal.id);

        const deadline = goal.targetDate
            ? `<i class="fa-regular fa-calendar"></i> By ${formatDateOnly(goal.targetDate + 'T00:00:00')}`
            : '<i class="fa-solid fa-infinity"></i> No deadline';

        let plan = monthly > 0
            ? `<span><i class="fa-solid fa-wallet"></i> ${formatCurrency(monthly, curr)}/month from salary</span>`
            : '<span><i class="fa-solid fa-wallet"></i> No monthly amount set</span>';
        if (goal.autoSave && monthly > 0 && !done) {
            const when = (goal.autoSaveTrigger || 'salary') === 'salary' ? 'when salary arrives' : `on the ${ordinal(goal.saveDay)}`;
            plan += `<span class="goal-chip"><i class="fa-solid fa-bolt"></i> Auto-save ${when}</span>`;
        }
        if (monthly > 0 && !done) {
            const monthPct = Math.min(100, Math.max(0, (thisMonth / monthly) * 100));
            plan += `<div class="goal-month">
                        <div class="goal-month-label"><span>This month</span><span>${formatCurrency(thisMonth, curr)} / ${formatCurrency(monthly, curr)}</span></div>
                        <div class="goal-month-bar"><div style="width:${monthPct}%"></div></div>
                     </div>`;
        }

        return `
            <div class="goal-card${done ? ' complete' : ''}" style="--goal-color: ${color};">
                <div class="goal-card-top">
                    <div class="goal-icon"><i class="fa-solid ${icon}"></i></div>
                    <div class="goal-title">
                        <h4>${escapeHTML(goal.name)}</h4>
                        <span>${deadline}</span>
                    </div>
                    <div class="goal-menu">
                        <button class="btn-icon" title="Edit goal" data-action="goal-edit" data-id="${id}"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-icon" title="Delete goal" data-action="goal-delete" data-id="${id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>

                <div class="goal-body">
                    ${progressRing(pct, done ? '<i class="fa-solid fa-trophy"></i>' : `<strong>${pct.toFixed(0)}%</strong><span>saved</span>`)}
                    <div class="goal-figures">
                        <div><span>Saved</span><strong>${formatCurrency(saved, curr)}</strong></div>
                        <div><span>Target</span><strong>${formatCurrency(goal.target, curr)}</strong></div>
                        <div><span>Remaining</span><strong>${formatCurrency(remaining, curr)}</strong></div>
                    </div>
                </div>

                <div class="goal-status status-${status.kind}"><i class="fa-solid ${status.icon}"></i> ${escapeHTML(status.text)}</div>
                ${done ? '' : `<div class="goal-plan">${plan}</div>`}

                <div class="goal-actions">
                    ${done ? '' : `<button class="btn btn-sm goal-btn-add" data-action="goal-add" data-id="${id}"><i class="fa-solid fa-plus"></i> Add money</button>`}
                    <button class="btn btn-sm btn-secondary" data-action="goal-withdraw" data-id="${id}" ${saved <= 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-right-from-bracket"></i> Withdraw</button>
                </div>
            </div>`;
    },

    // --- Goal create/edit modal ---
    openGoalModal: (goal = null) => {
        Goals.editingId = goal ? goal.id : null;
        const form = document.getElementById('goal-form');
        form.reset();
        document.getElementById('goal-modal-title').textContent = goal ? 'Edit Goal' : 'New Savings Goal';

        const icon = goal && GOAL_ICONS.includes(goal.icon) ? goal.icon : GOAL_ICONS[0];
        const color = goal && GOAL_COLORS.includes(goal.color) ? goal.color : GOAL_COLORS[0];
        form.querySelector(`input[name="goal-icon"][value="${icon}"]`).checked = true;
        form.querySelector(`input[name="goal-color"][value="${color}"]`).checked = true;

        document.getElementById('goal-name').value = goal ? goal.name : '';
        document.getElementById('goal-target').value = goal ? goal.target : '';
        document.getElementById('goal-starting').value = goal && goal.startingAmount ? goal.startingAmount : '';
        document.getElementById('goal-date').value = goal ? (goal.targetDate || '') : '';
        document.getElementById('goal-monthly').value = goal && goal.monthlyAmount ? goal.monthlyAmount : '';
        document.getElementById('goal-autosave').checked = goal ? !!goal.autoSave : false;
        document.getElementById('goal-saveday').value = goal ? (goal.saveDay || 1) : 1;
        const trigger = (goal && goal.autoSaveTrigger) || 'salary';
        form.querySelector(`input[name="goal-trigger"][value="${trigger}"]`).checked = true;

        Goals.updateFormPreview();
        document.getElementById('goal-modal').classList.add('show');
        document.getElementById('goal-name').focus();
    },

    // Live hint: how much per month the target date needs, and the auto-save day row
    updateFormPreview: () => {
        const target = parseFloat(document.getElementById('goal-target').value) || 0;
        const starting = parseFloat(document.getElementById('goal-starting').value) || 0;
        const date = document.getElementById('goal-date').value;
        const hint = document.getElementById('goal-suggestion');
        const curr = getSettings().currency;

        // When editing, count what's already been saved through the ledger too
        let alreadySaved = starting;
        if (Goals.editingId) {
            const goal = getGoals().find(g => g.id === Goals.editingId);
            if (goal) alreadySaved = Goals.getSaved({ ...goal, startingAmount: starting }, getTransactions('personal'));
        }

        const remaining = target - alreadySaved;
        if (target > 0 && date && remaining > 0) {
            const months = monthsUntil(date);
            hint.innerHTML = months > 0
                ? `<i class="fa-solid fa-lightbulb"></i> Save <strong>${formatCurrency(remaining / months, curr)}</strong> a month for ${months} month${months > 1 ? 's' : ''} to reach this on time.
                   <button type="button" class="btn-text" data-action="goal-use-suggestion" data-amount="${roundMoney(remaining / months)}">Use this</button>`
                : '<i class="fa-solid fa-circle-exclamation"></i> The target date has already passed.';
            hint.classList.remove('hidden');
        } else {
            hint.classList.add('hidden');
        }

        document.getElementById('goal-saveday-group').classList.toggle('hidden', !document.getElementById('goal-autosave').checked);
        const byDay = document.querySelector('input[name="goal-trigger"]:checked')?.value === 'day';
        document.getElementById('goal-saveday').disabled = !byDay;
    },

    submitGoal: (e) => {
        e.preventDefault();
        const form = e.target;
        const goals = getGoals();
        const existing = goals.find(g => g.id === Goals.editingId);

        const data = {
            name: document.getElementById('goal-name').value.trim(),
            icon: form.querySelector('input[name="goal-icon"]:checked').value,
            color: form.querySelector('input[name="goal-color"]:checked').value,
            target: roundMoney(document.getElementById('goal-target').value),
            startingAmount: roundMoney(document.getElementById('goal-starting').value || 0),
            targetDate: document.getElementById('goal-date').value,
            monthlyAmount: roundMoney(document.getElementById('goal-monthly').value || 0),
            autoSave: document.getElementById('goal-autosave').checked,
            autoSaveTrigger: form.querySelector('input[name="goal-trigger"]:checked').value,
            saveDay: Math.min(28, Math.max(1, parseInt(document.getElementById('goal-saveday').value, 10) || 1))
        };

        if (!data.name) return showToast('Give your goal a name.', 'error');
        if (!(data.target > 0)) return showToast('Enter a target amount.', 'error');
        if (data.autoSave && !(data.monthlyAmount > 0)) return showToast('Set a monthly amount to use auto-save.', 'error');

        // Schedule auto-save, keeping the current schedule if nothing about it changed
        const wasSame = existing && existing.autoSave && (existing.autoSaveTrigger || 'salary') === data.autoSaveTrigger;
        const byDay = data.autoSave && data.autoSaveTrigger === 'day';
        const keepDay = wasSame && existing.saveDay === data.saveDay && existing.nextAutoDate;
        data.nextAutoDate = byDay ? (keepDay ? existing.nextAutoDate : nextSaveDate(data.saveDay).toISOString()) : null;
        // Salary-triggered: start with the next salary (the current month counts as handled)
        data.lastAutoCycleStart = data.autoSave && !byDay
            ? (wasSame && existing.lastAutoCycleStart ? existing.lastAutoCycleStart : Goals.currentCycleMarker(new Date().toISOString()))
            : null;

        if (existing) {
            Object.assign(existing, data);
            // Keep ledger descriptions in step with a renamed goal
            const txns = getTransactions('personal');
            let renamed = false;
            txns.forEach(t => {
                if (t.goalId !== existing.id) return;
                const desc = t.type === 'debit' ? `Saved for ${data.name}` : `Withdrawn from ${data.name}`;
                if (t.description !== desc && /^(Saved for|Withdrawn from) /.test(t.description)) { t.description = desc; renamed = true; }
            });
            if (renamed) saveTransactions('personal', txns);
            showToast('Goal updated');
        } else {
            goals.push({ id: generateID('GL'), createdAt: new Date().toISOString(), ...data });
            showToast('Goal created. Time to start saving!');
        }

        saveGoals(goals);
        document.getElementById('goal-modal').classList.remove('show');
        window.updateUI();
    },

    // --- Add money / withdraw modal ---
    openMoneyModal: (goalId, mode) => {
        const goal = getGoals().find(g => g.id === goalId);
        if (!goal) return;
        Goals.moneyGoalId = goalId;
        Goals.moneyMode = mode;

        const curr = getSettings().currency;
        const personal = calculateRunningBalances(getTransactions('personal'));
        const saved = Goals.getSaved(goal, personal);
        const remaining = Math.max(0, roundMoney(goal.target - saved));
        const monthly = parseFloat(goal.monthlyAmount) || 0;

        document.getElementById('goal-money-form').reset();
        document.getElementById('goal-money-title').textContent = mode === 'add' ? `Add to ${goal.name}` : `Withdraw from ${goal.name}`;
        document.getElementById('goal-money-submit').innerHTML = mode === 'add'
            ? '<i class="fa-solid fa-plus"></i> Add money'
            : '<i class="fa-solid fa-arrow-right-from-bracket"></i> Withdraw';
        document.getElementById('goal-money-info').innerHTML = mode === 'add'
            ? `Available balance: <strong>${formatCurrency(Goals.getAvailable(), curr)}</strong> · ${formatCurrency(remaining, curr)} left to reach this goal`
            : `In this goal: <strong>${formatCurrency(saved, curr)}</strong>. Withdrawn money goes back to your available balance.`;

        // Quick-pick amounts
        const picks = mode === 'add'
            ? [['Monthly amount', Math.min(monthly, remaining)], ['Complete goal', remaining]]
            : [['Withdraw all', saved]];
        document.getElementById('goal-money-picks').innerHTML = picks
            .filter(([, v], i) => v > 0 && !(i === 1 && v === picks[0][1])) // skip "Complete goal" when it equals the monthly pick
            .map(([label, v]) => `<button type="button" class="goal-pick" data-action="goal-pick" data-amount="${v}">${label} · ${formatCurrency(v, curr)}</button>`)
            .join('');

        const now = new Date();
        document.getElementById('goal-money-date').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        document.getElementById('goal-money-modal').classList.add('show');
        document.getElementById('goal-money-amount').focus();
    },

    submitMoney: (e) => {
        e.preventDefault();
        const goal = getGoals().find(g => g.id === Goals.moneyGoalId);
        if (!goal) return;
        const amount = roundMoney(document.getElementById('goal-money-amount').value);
        const date = new Date(document.getElementById('goal-money-date').value).toISOString();
        const note = document.getElementById('goal-money-note').value.trim();
        const curr = getSettings().currency;
        if (!(amount > 0)) return showToast('Enter an amount.', 'error');

        const personal = calculateRunningBalances(getTransactions('personal'));
        if (Goals.moneyMode === 'add') {
            const available = Goals.getAvailable();
            if (amount > available && !confirm(`This is more than this month's available balance (${formatCurrency(available, curr)}). Add it anyway? The extra will come out of your savings.`)) return;
        } else {
            const saved = Goals.getSaved(goal, personal);
            if (amount > saved) return showToast(`You can withdraw at most ${formatCurrency(saved, curr)}.`, 'error');
        }

        addTransaction('personal', Goals.buildTxn(goal, Goals.moneyMode, amount, date, note));
        document.getElementById('goal-money-modal').classList.remove('show');

        const savedAfter = Goals.getSaved(goal, getTransactions('personal'));
        if (Goals.moneyMode === 'add' && savedAfter >= goal.target) showToast(`🎉 You reached your "${goal.name}" goal!`);
        else showToast(Goals.moneyMode === 'add' ? `${formatCurrency(amount, curr)} added to ${goal.name}` : `${formatCurrency(amount, curr)} withdrawn from ${goal.name}`);
        window.updateUI();
    },

    deleteGoal: (goalId) => {
        const goals = getGoals();
        const goal = goals.find(g => g.id === goalId);
        if (!goal) return;
        const curr = getSettings().currency;

        // Money moved in through the ledger is returned so the available balance stays correct
        const inLedger = roundMoney(Goals.getSaved(goal, getTransactions('personal')) - (parseFloat(goal.startingAmount) || 0));
        const msg = inLedger > 0
            ? `Delete "${goal.name}"?\n${formatCurrency(inLedger, curr)} saved in it will go back to your available balance.`
            : `Delete "${goal.name}"?`;
        if (!confirm(msg)) return;

        if (inLedger > 0) {
            addTransaction('personal', { ...Goals.buildTxn(goal, 'withdraw', inLedger, new Date().toISOString(), 'Goal deleted, savings returned'), description: `Goal closed: ${goal.name}` });
        }
        saveGoals(goals.filter(g => g.id !== goalId));
        showToast('Goal deleted', 'warning');
        window.updateUI();
    },

    init: () => {
        // Icon and colour pickers
        document.getElementById('goal-icon-picker').innerHTML = GOAL_ICONS.map(icon => `
            <label class="goal-icon-option"><input type="radio" name="goal-icon" value="${icon}"><span><i class="fa-solid ${icon}"></i></span></label>`).join('');
        document.getElementById('goal-color-picker').innerHTML = GOAL_COLORS.map(color => `
            <label class="goal-color-option"><input type="radio" name="goal-color" value="${color}"><span style="background:${color}"></span></label>`).join('');

        document.getElementById('goal-form').addEventListener('submit', Goals.submitGoal);
        document.getElementById('goal-money-form').addEventListener('submit', Goals.submitMoney);
        ['goal-target', 'goal-starting', 'goal-date', 'goal-autosave'].forEach(id =>
            document.getElementById(id).addEventListener('input', Goals.updateFormPreview));
        document.getElementById('goal-autosave').addEventListener('change', Goals.updateFormPreview);
        document.getElementById('goal-form').addEventListener('change', (e) => {
            if (e.target.name === 'goal-trigger') Goals.updateFormPreview();
        });

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action^="goal-"]');
            if (!btn) return;
            const { action, id, amount } = btn.dataset;
            if (action === 'goal-new') Goals.openGoalModal();
            else if (action === 'goal-edit') Goals.openGoalModal(getGoals().find(g => g.id === id));
            else if (action === 'goal-delete') Goals.deleteGoal(id);
            else if (action === 'goal-add') Goals.openMoneyModal(id, 'add');
            else if (action === 'goal-withdraw') Goals.openMoneyModal(id, 'withdraw');
            else if (action === 'goal-pick') document.getElementById('goal-money-amount').value = amount;
            else if (action === 'goal-use-suggestion') document.getElementById('goal-monthly').value = amount;
            else if (action === 'goal-close') btn.closest('.modal').classList.remove('show');
        });
    }
};

window.Goals = Goals;
