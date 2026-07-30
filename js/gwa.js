// ============================================================
// StudyStudio — GWA Calculator
// Philippine 1.00–5.00 GWA scale calculator. Row state now
// persists to localStorage (LS_GWA_STATE) so a sheet survives
// reloads/tab switches.
// Depends on: config.js, utils.js (escapeHtml)
// ============================================================

    // ---------- GWA CALCULATOR (Philippine 1.00–5.00 scale) ----------
    // Standard PH grade values — a select/dropdown per subject rather than
    // free-text, since these are the only values that exist on this scale
    // (there's no such thing as a 1.10 or 2.60 at most PH universities).
    const GWA_GRADE_OPTIONS = [
      {value: '1.00', label: '1.00 — Excellent'},
      {value: '1.25', label: '1.25 — Outstanding'},
      {value: '1.50', label: '1.50 — Superior'},
      {value: '1.75', label: '1.75 — Very Good'},
      {value: '2.00', label: '2.00 — Good'},
      {value: '2.25', label: '2.25 — Satisfactory'},
      {value: '2.50', label: '2.50 — Fairly Satisfactory'},
      {value: '2.75', label: '2.75 — Fair'},
      {value: '3.00', label: '3.00 — Passing'},
      {value: '5.00', label: '5.00 — Failed'}
    ];

    let gwaRowCount = 0;
    const gwaRowsEl = document.getElementById('gwaRows');

    function addGwaRow(prefill) {
      gwaRowCount++;
      const rowId = 'gwaRow' + gwaRowCount;
      const row = document.createElement('div');
      row.className = 'maker-row gwa-row';
      row.id = rowId;

      const gradeOptionsHtml = GWA_GRADE_OPTIONS.map(g =>
        `<option value="${g.value}"${prefill && prefill.grade === g.value ? ' selected' : ''}>${g.label}</option>`
      ).join('');

      row.innerHTML = `
        <div class="maker-field" style="margin:0;">
          <label>Subject (optional)</label>
          <input type="text" class="gwa-subject-input" placeholder="e.g. Mathematics" value="${prefill ? escapeHtml(prefill.subject || '') : ''}">
        </div>
        <div class="maker-field" style="margin:0;">
          <label>Grade</label>
          <select class="gwa-grade-select">${gradeOptionsHtml}</select>
        </div>
        <div class="maker-field" style="margin:0;">
          <label>Units</label>
          <input type="number" class="gwa-units-input" min="0" step="0.5" value="${prefill ? prefill.units : 3}">
        </div>
        <div class="maker-field" style="margin:0;">
          <label style="font-size:11px;">Exclude?</label>
          <input type="checkbox" class="gwa-exclude-checkbox" style="width:20px; height:20px; margin-top:4px;">
        </div>
        <button type="button" class="icon-btn gwa-remove-row-btn" title="Remove subject" style="margin-bottom:2px;">✕</button>
      `;

      if (prefill && prefill.excluded) {
        row.querySelector('.gwa-exclude-checkbox').checked = true;
      }

      row.querySelector('.gwa-remove-row-btn').addEventListener('click', () => {
        row.remove();
        saveGwaState();
      });

      // Persist on every edit so a reload doesn't lose a partially-filled
      // sheet — GWA computations are usually done mid-semester, over
      // several sittings, not in one pass.
      row.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', saveGwaState);
        el.addEventListener('change', saveGwaState);
      });

      gwaRowsEl.appendChild(row);
    }

    document.getElementById('gwaAddRowBtn').addEventListener('click', () => {
      addGwaRow();
      saveGwaState();
    });

    // ---------- Persistence ----------
    // Saves every row's subject/grade/units/exclude state plus the
    // exclude-toggle, so refreshing the page or switching tabs doesn't
    // wipe a GWA sheet that's still being filled in.
    function saveGwaState() {
      const rows = [...gwaRowsEl.querySelectorAll('.maker-row')].map(row => ({
        subject: row.querySelector('.gwa-subject-input').value,
        grade: row.querySelector('.gwa-grade-select').value,
        units: row.querySelector('.gwa-units-input').value,
        excluded: row.querySelector('.gwa-exclude-checkbox').checked
      }));
      const state = {
        rows,
        excludeToggle: document.getElementById('gwaExcludeToggle').checked
      };
      safeSetItem(LS_GWA_STATE, JSON.stringify(state));
    }

    function loadGwaState() {
      try {
        return JSON.parse(localStorage.getItem(LS_GWA_STATE)) || null;
      } catch {
        return null;
      }
    }

    function calculateGwa() {
      const rows = [...gwaRowsEl.querySelectorAll('.maker-row')];
      const excludeChecked = document.getElementById('gwaExcludeToggle').checked;

      let totalGradeUnits = 0;
      let totalUnits = 0;
      let anyRow = false;
      let anyExcluded = false;

      rows.forEach(row => {
        const grade = parseFloat(row.querySelector('.gwa-grade-select').value);
        const units = parseFloat(row.querySelector('.gwa-units-input').value);
        const isExcluded = row.querySelector('.gwa-exclude-checkbox').checked;

        if (isNaN(grade) || isNaN(units) || units <= 0) return;
        anyRow = true;

        if (excludeChecked && isExcluded) {
          anyExcluded = true;
          return;
        }

        totalGradeUnits += grade * units;
        totalUnits += units;
      });

      const resultBox = document.getElementById('gwaResultBox');
      const banner = document.getElementById('gwaResultBanner');
      const detail = document.getElementById('gwaResultDetail');

      if (!anyRow || totalUnits === 0) {
        resultBox.style.display = 'block';
        banner.textContent = 'Add at least one subject with valid units to calculate.';
        detail.textContent = '';
        return;
      }

      const gwa = totalGradeUnits / totalUnits;
      // Standard rounding to 2 decimal places, matching how GWA is normally
      // reported on a Transcript of Records. Some registrars round
      // differently (e.g. truncation, or rounding to the nearest official
      // grade value) — this is the common convention, not a universal rule.
      const gwaRounded = Math.round(gwa * 100) / 100;

      let remark;
      if (gwaRounded <= 1.00) remark = 'Excellent';
      else if (gwaRounded <= 1.45) remark = 'Outstanding';
      else if (gwaRounded <= 1.70) remark = 'Superior';
      else if (gwaRounded <= 1.95) remark = 'Very Good';
      else if (gwaRounded <= 2.20) remark = 'Good';
      else if (gwaRounded <= 2.45) remark = 'Satisfactory';
      else if (gwaRounded <= 2.70) remark = 'Fairly Satisfactory';
      else if (gwaRounded <= 2.95) remark = 'Fair';
      else if (gwaRounded <= 3.00) remark = 'Passing';
      else remark = 'Failed';

      resultBox.style.display = 'block';
      banner.textContent = `GWA: ${gwaRounded.toFixed(2)} (${remark})`;
      detail.textContent = `Based on ${totalUnits} total unit(s) across ${rows.filter(r => !isNaN(parseFloat(r.querySelector('.gwa-units-input').value))).length} subject(s).` +
        (anyExcluded ? ' Some subjects were excluded per your settings above.' : '') +
        ' Rounding and exclusion policies (e.g. for PE/NSTP) vary by school — check your registrar for your institution\'s exact rule.';
    }

    document.getElementById('gwaCalculateBtn').addEventListener('click', calculateGwa);

    document.getElementById('gwaExcludeToggle').addEventListener('change', saveGwaState);

    document.getElementById('gwaResetBtn').addEventListener('click', () => {
      if (gwaRowsEl.children.length && !confirm('Clear all subjects and start over?')) return;
      gwaRowsEl.innerHTML = '';
      document.getElementById('gwaExcludeToggle').checked = false;
      document.getElementById('gwaResultBox').style.display = 'none';
      addGwaRow();
      addGwaRow();
      saveGwaState();
    });

    // Restore a saved sheet if one exists; otherwise seed with two blank
    // starter rows so the calculator isn't empty on first open.
    (function initGwaRows() {
      const saved = loadGwaState();
      if (saved && Array.isArray(saved.rows) && saved.rows.length) {
        saved.rows.forEach(r => addGwaRow(r));
        document.getElementById('gwaExcludeToggle').checked = !!saved.excludeToggle;
      } else {
        addGwaRow();
        addGwaRow();
      }
    })();