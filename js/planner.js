// ============================================================
// StudyStudio — Schedule Planner
// A simple 3-column task board (To Do / In Progress / Done) for
// exams, homework, projects, and general to-dos. Each task has a
// type, an optional due date, and a status. Due-soon (within 3
// days) and overdue tasks are called out visually and summarized
// in a strip above the board, so upcoming deadlines don't need a
// separate glance at a calendar app.
//
// Due dates are picked via a small custom month-grid calendar
// popover (#plannerCalPopover) rather than the bare native
// <input type="date">, for a more visual/legible picker that's
// consistent across browsers. The popover only ever writes into
// the hidden native #plannerTaskDue input, so the add-task flow
// and stored task shape are completely unchanged.
//
// Depends on: config.js, utils.js (escapeHtml)
// ============================================================

    let plannerTasks = loadPlannerTasks();
    let plannerFilter = 'all'; // 'all' | 'exam' | 'homework' | 'project' | 'other'

    function loadPlannerTasks() {
      try { return JSON.parse(localStorage.getItem(LS_PLANNER_TASKS)) || []; }
      catch { return []; }
    }
    function savePlannerTasks() {
      try { localStorage.setItem(LS_PLANNER_TASKS, JSON.stringify(plannerTasks)); }
      catch (e) { console.error('Failed to save planner tasks:', e); }
    }

    const PLANNER_TYPE_ICONS = {
      exam: '📝',
      homework: '📚',
      project: '🛠️',
      other: '📌'
    };
    const PLANNER_TYPE_LABELS = {
      exam: 'Exam',
      homework: 'Homework',
      project: 'Project',
      other: 'Other'
    };

    function plannerTodayISO() {
      return new Date().toISOString().slice(0, 10);
    }

    // Returns 'overdue' | 'today' | 'soon' (within 3 days) | 'later' | null
    // (null = no due date set at all, e.g. a general to-do with no deadline).
    function plannerDueBucket(task) {
      if (!task.dueDate) return null;
      const today = plannerTodayISO();
      if (task.dueDate < today) return 'overdue';
      if (task.dueDate === today) return 'today';

      const due = new Date(task.dueDate + 'T00:00:00');
      const now = new Date(today + 'T00:00:00');
      const diffDays = Math.round((due - now) / 86400000);
      return diffDays <= 3 ? 'soon' : 'later';
    }

    function plannerFormatDate(dateStr) {
      if (!dateStr) return null;
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    }

    // Short "in 2 days" / "5 days overdue" style label shown under the
    // date badge on each card — the day/month badge alone answers "when"
    // but not "how urgent", which is the thing a student scanning the
    // board actually needs at a glance.
    function plannerRelativeDayLabel(dateStr) {
      const today = plannerTodayISO();
      const due = new Date(dateStr + 'T00:00:00');
      const now = new Date(today + 'T00:00:00');
      const diffDays = Math.round((due - now) / 86400000);

      if (diffDays === 0) return 'Due today';
      if (diffDays === 1) return 'Due tomorrow';
      if (diffDays === -1) return '1 day overdue';
      if (diffDays > 1) return `In ${diffDays} days`;
      return `${Math.abs(diffDays)} days overdue`;
    }

    // ---------- Rendering ----------
    function renderPlanner() {
      const emptyState = document.getElementById('plannerEmptyState');
      emptyState.style.display = plannerTasks.length === 0 ? 'block' : 'none';

      renderPlannerSummary();

      const hideDone = document.getElementById('plannerHideDoneToggle').checked;
      const visibleTasks = plannerTasks.filter(t =>
        (plannerFilter === 'all' || t.type === plannerFilter) &&
        !(hideDone && t.status === 'done')
      );

      const columns = {
        todo: document.getElementById('plannerColTodo'),
        doing: document.getElementById('plannerColDoing'),
        done: document.getElementById('plannerColDone')
      };
      Object.values(columns).forEach(col => col.innerHTML = '');

      const counts = {todo: 0, doing: 0, done: 0};

      // Sort so overdue/due-soon tasks float to the top of their column
      // instead of sitting wherever they happened to be added.
      const bucketOrder = {overdue: 0, today: 1, soon: 2, later: 3};
      const sorted = [...visibleTasks].sort((a, b) => {
        const ba = bucketOrder[plannerDueBucket(a)] ?? 4;
        const bb = bucketOrder[plannerDueBucket(b)] ?? 4;
        if (ba !== bb) return ba - bb;
        if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
        return 0;
      });

      sorted.forEach(task => {
        const status = columns[task.status] ? task.status : 'todo';
        counts[status]++;
        columns[status].appendChild(renderPlannerCard(task));
      });

      document.getElementById('plannerCountTodo').textContent = counts.todo;
      document.getElementById('plannerCountDoing').textContent = counts.doing;
      document.getElementById('plannerCountDone').textContent = counts.done;

      // Per-column empty hint so a filtered-down view doesn't just look broken
      Object.entries(columns).forEach(([status, col]) => {
        if (counts[status] === 0) {
          col.innerHTML = `<div class="planner-col-empty">Nothing here${plannerFilter !== 'all' ? ' for this filter' : ''}.</div>`;
        }
      });
    }

    function renderPlannerSummary() {
      const summaryEl = document.getElementById('plannerSummary');
      const active = plannerTasks.filter(t => t.status !== 'done');
      const overdue = active.filter(t => plannerDueBucket(t) === 'overdue').length;
      const dueSoon = active.filter(t => ['today', 'soon'].includes(plannerDueBucket(t))).length;

      if (overdue === 0 && dueSoon === 0) {
        summaryEl.style.display = 'none';
        return;
      }
      summaryEl.style.display = 'flex';
      summaryEl.innerHTML = `
        ${overdue > 0 ? `<span class="planner-summary-pill overdue">⚠ ${overdue} overdue</span>` : ''}
        ${dueSoon > 0 ? `<span class="planner-summary-pill soon">⏰ ${dueSoon} due within 3 days</span>` : ''}
      `;
    }

    function renderPlannerCard(task) {
      const card = document.createElement('div');
      const bucket = plannerDueBucket(task);
      card.className = 'planner-card' + (bucket && task.status !== 'done' ? ` due-${bucket}` : '');

      let dueLabel = '';
      if (task.dueDate) {
        const d = new Date(task.dueDate + 'T00:00:00');
        const badgeMonth = d.toLocaleDateString(undefined, {month: 'short'});
        const badgeDay = d.getDate();
        const relativeLabel = plannerRelativeDayLabel(task.dueDate);

        dueLabel = `
          <span class="planner-card-due">
            <span class="planner-card-due-badge">
              <span class="badge-month">${escapeHtml(badgeMonth)}</span>
              <span class="badge-day">${badgeDay}</span>
            </span>
            <span class="planner-card-due-text">
              <span>${escapeHtml(plannerFormatDate(task.dueDate))}</span>
              <span class="planner-card-due-relative">${escapeHtml(relativeLabel)}</span>
            </span>
          </span>
        `;
      }

      card.innerHTML = `
        <div class="planner-card-top">
          <span class="planner-card-type">${PLANNER_TYPE_ICONS[task.type] || '📌'} ${PLANNER_TYPE_LABELS[task.type] || 'Other'}</span>
          <button class="planner-card-del" title="Delete task">✕</button>
        </div>
        <div class="planner-card-title">${escapeHtml(task.title)}</div>
        ${dueLabel}
        <div class="planner-card-move">
          <select class="planner-status-select">
            <option value="todo"${task.status === 'todo' ? ' selected' : ''}>To Do</option>
            <option value="doing"${task.status === 'doing' ? ' selected' : ''}>In Progress</option>
            <option value="done"${task.status === 'done' ? ' selected' : ''}>Done</option>
          </select>
        </div>
      `;

      card.querySelector('.planner-card-del').addEventListener('click', () => {
        if (!confirm(`Delete "${task.title}"?`)) return;
        plannerTasks = plannerTasks.filter(t => t.id !== task.id);
        savePlannerTasks();
        renderPlanner();
      });

      card.querySelector('.planner-status-select').addEventListener('change', (e) => {
        task.status = e.target.value;
        savePlannerTasks();
        renderPlanner();
      });

      return card;
    }

    // ---------- Custom due-date calendar popover ----------
    // Drives #plannerCalPopover: a small month-grid picker that writes
    // into the hidden native #plannerTaskDue input (yyyy-mm-dd), so the
    // add-task flow below reads exactly the same value shape it always
    // has. plannerCalViewDate tracks which month is currently shown in
    // the popover — independent from what's actually selected, so
    // browsing to a future/past month to pick a date doesn't require
    // first selecting anything.
    let plannerCalViewDate = new Date();
    plannerCalViewDate.setDate(1);

    const plannerDueInput = document.getElementById('plannerTaskDue');
    const plannerDueTriggerBtn = document.getElementById('plannerDueTriggerBtn');
    const plannerDueTriggerLabel = document.getElementById('plannerDueTriggerLabel');
    const plannerCalPopover = document.getElementById('plannerCalPopover');

    function plannerUpdateDueTriggerLabel() {
      const val = plannerDueInput.value;
      if (!val) {
        plannerDueTriggerLabel.textContent = 'No date';
        plannerDueTriggerBtn.classList.remove('has-date');
        return;
      }
      const d = new Date(val + 'T00:00:00');
      plannerDueTriggerLabel.textContent = d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
      plannerDueTriggerBtn.classList.add('has-date');
    }

    function plannerRenderCalendar() {
      const year = plannerCalViewDate.getFullYear();
      const month = plannerCalViewDate.getMonth();

      document.getElementById('plannerCalMonthLabel').textContent =
        plannerCalViewDate.toLocaleDateString(undefined, {month: 'long', year: 'numeric'});

      const grid = document.getElementById('plannerCalGrid');
      grid.innerHTML = '';

      const firstOfMonth = new Date(year, month, 1);
      const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const daysInPrevMonth = new Date(year, month, 0).getDate();

      const todayISO = plannerTodayISO();
      const selectedISO = plannerDueInput.value;

      const totalCells = 42; // fixed 6-row grid so the popover height never jumps between months
      for (let i = 0; i < totalCells; i++) {
        const dayNum = i - startWeekday + 1;
        let cellDate, otherMonth = false;

        if (dayNum < 1) {
          cellDate = new Date(year, month - 1, daysInPrevMonth + dayNum);
          otherMonth = true;
        } else if (dayNum > daysInMonth) {
          cellDate = new Date(year, month + 1, dayNum - daysInMonth);
          otherMonth = true;
        } else {
          cellDate = new Date(year, month, dayNum);
        }

        const cellISO = cellDate.toISOString().slice(0, 10);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'planner-cal-day';
        btn.textContent = cellDate.getDate();

        if (otherMonth) btn.classList.add('other-month');
        if (cellISO === todayISO) btn.classList.add('is-today');
        if (cellISO === selectedISO) btn.classList.add('is-selected');
        // Past dates are still selectable (a task's due date could
        // legitimately be logged after the fact), just visually muted.
        if (cellISO < todayISO) btn.classList.add('is-past');

        btn.addEventListener('click', () => {
          plannerDueInput.value = cellISO;
          plannerUpdateDueTriggerLabel();
          plannerRenderCalendar();
          closePlannerCalendar();
        });

        grid.appendChild(btn);
      }
    }

    function openPlannerCalendar() {
      // Open on the month containing the current selection, if any,
      // otherwise the current month.
      const val = plannerDueInput.value;
      plannerCalViewDate = val ? new Date(val + 'T00:00:00') : new Date();
      plannerCalViewDate.setDate(1);
      plannerRenderCalendar();
      plannerCalPopover.classList.add('open');
    }

    function closePlannerCalendar() {
      plannerCalPopover.classList.remove('open');
    }

    plannerDueTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      plannerCalPopover.classList.contains('open') ? closePlannerCalendar() : openPlannerCalendar();
    });

    document.getElementById('plannerCalPrevBtn').addEventListener('click', () => {
      plannerCalViewDate.setMonth(plannerCalViewDate.getMonth() - 1);
      plannerRenderCalendar();
    });
    document.getElementById('plannerCalNextBtn').addEventListener('click', () => {
      plannerCalViewDate.setMonth(plannerCalViewDate.getMonth() + 1);
      plannerRenderCalendar();
    });
    document.getElementById('plannerCalTodayBtn').addEventListener('click', () => {
      const todayISO = plannerTodayISO();
      plannerDueInput.value = todayISO;
      plannerUpdateDueTriggerLabel();
      plannerCalViewDate = new Date();
      plannerCalViewDate.setDate(1);
      plannerRenderCalendar();
      closePlannerCalendar();
    });
    document.getElementById('plannerCalClearBtn').addEventListener('click', () => {
      plannerDueInput.value = '';
      plannerUpdateDueTriggerLabel();
      plannerRenderCalendar();
      closePlannerCalendar();
    });

    // Click-outside-to-close, without a full-screen scrim (the popover
    // is small and anchored right under its trigger, so a scrim would
    // feel heavier than this interaction needs).
    document.addEventListener('click', (e) => {
      if (!plannerCalPopover.classList.contains('open')) return;
      if (e.target.closest('#plannerCalPopover') || e.target.closest('#plannerDueTriggerBtn')) return;
      closePlannerCalendar();
    });

    plannerUpdateDueTriggerLabel();

    // ---------- Add task ----------
    document.getElementById('plannerAddTaskBtn').addEventListener('click', () => {
      const titleInput = document.getElementById('plannerTaskTitle');
      const typeInput = document.getElementById('plannerTaskType');
      const dueInput = document.getElementById('plannerTaskDue');

      const title = titleInput.value.trim();
      if (!title) {
        titleInput.focus();
        return;
      }

      plannerTasks.push({
        id: crypto.randomUUID(),
        title,
        type: typeInput.value,
        dueDate: dueInput.value || null, // yyyy-mm-dd or null (no deadline)
        status: 'todo',
        createdAt: new Date().toISOString()
      });
      savePlannerTasks();

      titleInput.value = '';
      dueInput.value = '';
      plannerUpdateDueTriggerLabel();
      titleInput.focus();

      renderPlanner();
    });

    document.getElementById('plannerTaskTitle').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('plannerAddTaskBtn').click();
    });

    // ---------- Filters ----------
    document.querySelectorAll('#plannerFilterGroup .pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#plannerFilterGroup .pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        plannerFilter = btn.dataset.filter;
        renderPlanner();
      });
    });

    document.getElementById('plannerHideDoneToggle').addEventListener('change', renderPlanner);

    // Initial paint so the board isn't empty before the Planner tab is
    // ever clicked (main.js also re-renders on every tab switch to keep
    // due/overdue buckets fresh against the current date).
    renderPlanner();
