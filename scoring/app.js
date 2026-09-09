(() => {
  'use strict';

  const STORAGE_KEY = 'psychomotorScoring.v1';

  let state = loadState();
  let currentClassId = state.classes[0]?.id ?? null;
  let searchQuery = '';

  // ---------- Storage ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { classes: [], scores: [] };
      const parsed = JSON.parse(raw);
      return {
        classes: Array.isArray(parsed.classes) ? parsed.classes : [],
        scores: Array.isArray(parsed.scores) ? parsed.scores : [],
      };
    } catch {
      return { classes: [], scores: [] };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  // ---------- DOM refs ----------
  const classTabsEl = document.getElementById('classTabs');
  const emptyStateEl = document.getElementById('emptyState');
  const classViewEl = document.getElementById('classView');
  const classNameEl = document.getElementById('className');
  const classMetaEl = document.getElementById('classMeta');
  const studentRowsEl = document.getElementById('studentRows');
  const noStudentsEl = document.getElementById('noStudents');
  const noResultsEl = document.getElementById('noResults');
  const searchInput = document.getElementById('searchInput');

  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalFooter = document.getElementById('modalFooter');
  const modalForm = document.getElementById('modalForm');

  const toastEl = document.getElementById('toast');

  // ---------- Helpers ----------
  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDateTh(dateStr) {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function getClass(classId) {
    return state.classes.find((c) => c.id === classId) || null;
  }

  function getStudent(classId, studentId) {
    const cls = getClass(classId);
    return cls ? cls.students.find((s) => s.id === studentId) || null : null;
  }

  function studentTotal(studentId) {
    return state.scores
      .filter((s) => s.studentId === studentId)
      .reduce((sum, s) => sum + s.points, 0);
  }

  function studentScores(studentId) {
    return state.scores
      .filter((s) => s.studentId === studentId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function sortStudents(students) {
    return [...students].sort((a, b) => {
      const na = parseFloat(a.number);
      const nb = parseFloat(b.number);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.number.localeCompare(b.number, 'th') || a.name.localeCompare(b.name, 'th');
    });
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.add('hidden'), 2200);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ---------- Rendering ----------
  function render() {
    renderClassTabs();
    if (!currentClassId || !getClass(currentClassId)) {
      currentClassId = state.classes[0]?.id ?? null;
    }
    if (!currentClassId) {
      emptyStateEl.classList.remove('hidden');
      classViewEl.classList.add('hidden');
      return;
    }
    emptyStateEl.classList.add('hidden');
    classViewEl.classList.remove('hidden');
    renderClassView();
  }

  function renderClassTabs() {
    classTabsEl.innerHTML = '';
    state.classes.forEach((cls) => {
      const btn = document.createElement('button');
      btn.className = 'class-tab' + (cls.id === currentClassId ? ' active' : '');
      btn.textContent = cls.name;
      btn.addEventListener('click', () => {
        currentClassId = cls.id;
        searchQuery = '';
        searchInput.value = '';
        render();
      });
      classTabsEl.appendChild(btn);
    });
  }

  function scorePillClass(total, max) {
    if (max <= 0) return '';
    const ratio = total / max;
    if (ratio < 0.4) return 'low';
    if (ratio < 0.8) return 'mid';
    return '';
  }

  function renderClassView() {
    const cls = getClass(currentClassId);
    if (!cls) return;
    classNameEl.textContent = cls.name;
    const teacherText = cls.teacher ? ` · ครูประจำชั้น ${cls.teacher}` : '';
    classMetaEl.textContent = `${cls.students.length} คน · คะแนนเต็ม ${cls.maxScore}${teacherText}`;

    const q = searchQuery.trim().toLowerCase();
    const filtered = cls.students.filter(
      (s) => !q || s.number.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
    const sorted = sortStudents(filtered);

    studentRowsEl.innerHTML = '';
    noStudentsEl.classList.toggle('hidden', cls.students.length !== 0);
    noResultsEl.classList.toggle('hidden', !(cls.students.length > 0 && sorted.length === 0));

    sorted.forEach((student) => {
      const total = studentTotal(student.id);
      const pct = cls.maxScore > 0 ? Math.max(0, Math.min(100, (total / cls.maxScore) * 100)) : 0;
      const pillClass = scorePillClass(total, cls.maxScore);
      const card = document.createElement('div');
      card.className = 'student-card';
      card.innerHTML = `
        <div class="card-top">
          <span class="card-number">${escapeHtml(student.number)}</span>
          <button type="button" class="card-more" title="รายละเอียด/ประวัติ/แก้ไข">⋯</button>
        </div>
        <div class="card-name">${escapeHtml(student.name)}</div>
        <div class="card-score-row">
          <button type="button" class="card-score-btn minus" data-delta="-1" aria-label="ลบ 1 คะแนน">−</button>
          <span class="card-score-value ${pillClass}">${total}</span>
          <button type="button" class="card-score-btn plus" data-delta="1" aria-label="เพิ่ม 1 คะแนน">+</button>
        </div>
        <div class="card-bar"><div class="card-bar-fill" style="width:${pct}%"></div></div>
        <div class="card-of">/ ${cls.maxScore}</div>
      `;
      card.addEventListener('click', () => openStudentScoreModal(cls.id, student.id));
      card.querySelector('.card-more').addEventListener('click', (e) => {
        e.stopPropagation();
        openStudentScoreModal(cls.id, student.id);
      });
      card.querySelectorAll('[data-delta]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          quickAdjust(cls.id, student.id, parseFloat(btn.dataset.delta));
        });
      });
      studentRowsEl.appendChild(card);
    });
  }

  function quickAdjust(classId, studentId, delta) {
    state.scores.push({
      id: uid(),
      classId,
      studentId,
      points: delta,
      reason: '',
      date: todayStr(),
      createdAt: Date.now(),
    });
    saveState();
    render();
    showToast(delta > 0 ? `+${delta} คะแนน` : `${delta} คะแนน`);
  }

  // ---------- Modal ----------
  function openModal(title) {
    modalTitle.textContent = title;
    if (!modal.open) modal.showModal();
  }
  function closeModal() {
    modal.close();
    modalBody.innerHTML = '';
    modalFooter.innerHTML = '';
    modalForm.onsubmit = null;
  }
  document.getElementById('modalClose').addEventListener('click', closeModal);
  modal.addEventListener('close', () => {
    modalBody.innerHTML = '';
    modalFooter.innerHTML = '';
    modalForm.onsubmit = null;
  });

  // ---------- Class actions ----------
  function openAddClassModal() {
    openModal('เพิ่มห้องเรียน');
    modalBody.innerHTML = `
      <label class="field">
        <span>ชื่อห้องเรียน</span>
        <input type="text" id="f-className" placeholder="เช่น ป.1/1" required autofocus>
      </label>
      <label class="field">
        <span>คะแนนเต็มจิตพิสัย</span>
        <input type="number" id="f-maxScore" value="10" min="0" step="1" required>
      </label>
    `;
    modalFooter.innerHTML = `
      <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
      <button type="submit" class="btn btn-primary">เพิ่มห้องเรียน</button>
    `;
    modalFooter.querySelector('[data-close]').addEventListener('click', closeModal);
    modalForm.onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById('f-className').value.trim();
      const maxScore = parseFloat(document.getElementById('f-maxScore').value) || 0;
      if (!name) return;
      const cls = { id: uid(), name, maxScore, students: [] };
      state.classes.push(cls);
      currentClassId = cls.id;
      saveState();
      closeModal();
      render();
      showToast('เพิ่มห้องเรียนแล้ว');
    };
  }

  function openEditClassModal(classId) {
    const cls = getClass(classId);
    if (!cls) return;
    openModal('แก้ไขห้องเรียน');
    modalBody.innerHTML = `
      <label class="field">
        <span>ชื่อห้องเรียน</span>
        <input type="text" id="f-className" value="${escapeHtml(cls.name)}" required autofocus>
      </label>
      <label class="field">
        <span>คะแนนเต็มจิตพิสัย</span>
        <input type="number" id="f-maxScore" value="${cls.maxScore}" min="0" step="1" required>
      </label>
      <hr>
      <p class="danger-zone-label">โซนอันตราย</p>
      <button type="button" id="f-deleteClass" class="btn btn-danger">ลบห้องเรียนนี้ (ลบนักเรียนและคะแนนทั้งหมด)</button>
    `;
    modalFooter.innerHTML = `
      <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
      <button type="submit" class="btn btn-primary">บันทึก</button>
    `;
    modalFooter.querySelector('[data-close]').addEventListener('click', closeModal);
    modalBody.querySelector('#f-deleteClass').addEventListener('click', () => {
      if (!confirm(`ยืนยันลบห้อง "${cls.name}" พร้อมนักเรียนและคะแนนทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้`)) return;
      state.classes = state.classes.filter((c) => c.id !== classId);
      state.scores = state.scores.filter((s) => s.classId !== classId);
      if (currentClassId === classId) currentClassId = state.classes[0]?.id ?? null;
      saveState();
      closeModal();
      render();
      showToast('ลบห้องเรียนแล้ว');
    });
    modalForm.onsubmit = (e) => {
      e.preventDefault();
      cls.name = document.getElementById('f-className').value.trim() || cls.name;
      cls.maxScore = parseFloat(document.getElementById('f-maxScore').value) || 0;
      saveState();
      closeModal();
      render();
      showToast('บันทึกการแก้ไขแล้ว');
    };
  }

  // ---------- Student actions ----------
  function openAddStudentModal(classId) {
    openModal('เพิ่มนักเรียน');
    modalBody.innerHTML = `
      <label class="field">
        <span>เลขที่</span>
        <input type="text" id="f-number" required autofocus>
      </label>
      <label class="field">
        <span>ชื่อ-สกุล</span>
        <input type="text" id="f-name" required>
      </label>
    `;
    modalFooter.innerHTML = `
      <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
      <button type="submit" class="btn btn-primary">เพิ่ม</button>
    `;
    modalFooter.querySelector('[data-close]').addEventListener('click', closeModal);
    modalForm.onsubmit = (e) => {
      e.preventDefault();
      const number = document.getElementById('f-number').value.trim();
      const name = document.getElementById('f-name').value.trim();
      if (!number || !name) return;
      const cls = getClass(classId);
      cls.students.push({ id: uid(), number, name });
      saveState();
      closeModal();
      render();
      showToast('เพิ่มนักเรียนแล้ว');
    };
  }

  function openEditStudentModal(classId, studentId) {
    const student = getStudent(classId, studentId);
    if (!student) return;
    openModal('แก้ไขข้อมูลนักเรียน');
    modalBody.innerHTML = `
      <label class="field">
        <span>เลขที่</span>
        <input type="text" id="f-number" value="${escapeHtml(student.number)}" required autofocus>
      </label>
      <label class="field">
        <span>ชื่อ-สกุล</span>
        <input type="text" id="f-name" value="${escapeHtml(student.name)}" required>
      </label>
    `;
    modalFooter.innerHTML = `
      <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
      <button type="submit" class="btn btn-primary">บันทึก</button>
    `;
    modalFooter.querySelector('[data-close]').addEventListener('click', closeModal);
    modalForm.onsubmit = (e) => {
      e.preventDefault();
      student.number = document.getElementById('f-number').value.trim() || student.number;
      student.name = document.getElementById('f-name').value.trim() || student.name;
      saveState();
      closeModal();
      render();
      showToast('บันทึกการแก้ไขแล้ว');
    };
  }

  function deleteStudent(classId, studentId) {
    const student = getStudent(classId, studentId);
    if (!student) return false;
    if (!confirm(`ยืนยันลบนักเรียน "${student.name}" พร้อมประวัติคะแนนทั้งหมด?`)) return false;
    const cls = getClass(classId);
    cls.students = cls.students.filter((s) => s.id !== studentId);
    state.scores = state.scores.filter((s) => s.studentId !== studentId);
    saveState();
    render();
    showToast('ลบนักเรียนแล้ว');
    return true;
  }

  function openImportStudentsModal(classId) {
    openModal('นำเข้ารายชื่อนักเรียน');
    modalBody.innerHTML = `
      <p class="hint">วางรายชื่อ 1 คนต่อบรรทัด รูปแบบ: <code>เลขที่, ชื่อ-สกุล</code> (คั่นด้วยคอมมา แท็บ หรือเว้นวรรค เช่น จากการคัดลอกจาก Excel)</p>
      <textarea id="f-importText" rows="10" placeholder="1, เด็กชายสมชาย ใจดี&#10;2, เด็กหญิงสมหญิง ดีใจ"></textarea>
      <label class="field-inline">
        <input type="checkbox" id="f-replace">
        <span>แทนที่รายชื่อเดิมทั้งหมดในห้องนี้ (จะลบประวัติคะแนนเดิมของห้องนี้ด้วย)</span>
      </label>
    `;
    modalFooter.innerHTML = `
      <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button>
      <button type="submit" class="btn btn-primary">นำเข้า</button>
    `;
    modalFooter.querySelector('[data-close]').addEventListener('click', closeModal);
    modalForm.onsubmit = (e) => {
      e.preventDefault();
      const text = document.getElementById('f-importText').value;
      const replace = document.getElementById('f-replace').checked;
      const { students, skipped } = parseStudentList(text);
      if (students.length === 0) {
        showToast('ไม่พบข้อมูลที่นำเข้าได้');
        return;
      }
      if (replace && !confirm('การแทนที่จะลบประวัติคะแนนเดิมทั้งหมดของห้องนี้ ยืนยันหรือไม่?')) return;
      const cls = getClass(classId);
      if (replace) {
        cls.students = students;
        state.scores = state.scores.filter((s) => s.classId !== classId);
      } else {
        const existingNumbers = new Set(cls.students.map((s) => s.number));
        const toAdd = students.filter((s) => !existingNumbers.has(s.number));
        cls.students.push(...toAdd);
      }
      saveState();
      closeModal();
      render();
      showToast(`นำเข้าสำเร็จ ${students.length} คน${skipped ? ` (ข้าม ${skipped} บรรทัดที่อ่านไม่ได้)` : ''}`);
    };
  }

  function parseStudentList(text) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const students = [];
    let skipped = 0;
    for (const line of lines) {
      let parts;
      if (line.includes('\t')) parts = line.split('\t');
      else if (line.includes(',')) parts = line.split(',');
      else {
        const m = line.match(/^(\S+)\s+(.+)$/);
        parts = m ? [m[1], m[2]] : null;
      }
      if (!parts) {
        skipped++;
        continue;
      }
      const number = (parts[0] || '').trim();
      const name = parts.slice(1).join(' ').replace(/\s+/g, ' ').trim();
      if (!number || !name) {
        skipped++;
        continue;
      }
      students.push({ id: uid(), number, name });
    }
    return { students, skipped };
  }

  // ---------- Score actions ----------
  function openStudentScoreModal(classId, studentId) {
    const student = getStudent(classId, studentId);
    const cls = getClass(classId);
    if (!student || !cls) return;
    openModal(`${student.name} (เลขที่ ${student.number})`);
    renderScoreModalBody(classId, studentId);
    modalFooter.innerHTML = `
      <div style="display:flex;gap:8px;margin-right:auto;">
        <button type="button" class="btn btn-ghost" data-edit>✏️ แก้ไขข้อมูล</button>
        <button type="button" class="btn btn-danger" data-delete-student>🗑️ ลบนักเรียน</button>
      </div>
      <button type="button" class="btn btn-ghost" data-close>ปิด</button>
    `;
    modalFooter.querySelector('[data-close]').addEventListener('click', closeModal);
    modalFooter.querySelector('[data-edit]').addEventListener('click', () => {
      openEditStudentModal(classId, studentId);
    });
    modalFooter.querySelector('[data-delete-student]').addEventListener('click', () => {
      const deleted = deleteStudent(classId, studentId);
      if (deleted) closeModal();
    });
    modalForm.onsubmit = (e) => {
      e.preventDefault();
      const pointsInput = document.getElementById('f-points');
      const reasonInput = document.getElementById('f-reason');
      const dateInput = document.getElementById('f-date');
      const points = parseFloat(pointsInput.value);
      if (Number.isNaN(points)) return;
      state.scores.push({
        id: uid(),
        classId,
        studentId,
        points,
        reason: reasonInput.value.trim(),
        date: dateInput.value || todayStr(),
        createdAt: Date.now(),
      });
      saveState();
      renderScoreModalBody(classId, studentId);
      render();
      showToast('บันทึกคะแนนแล้ว');
    };
  }

  function renderScoreModalBody(classId, studentId) {
    const cls = getClass(classId);
    const total = studentTotal(studentId);
    const history = studentScores(studentId);
    modalBody.innerHTML = `
      <div class="score-total-banner">คะแนนรวมปัจจุบัน: <strong class="${total < 0 ? 'negative' : ''}">${total}</strong> / ${cls.maxScore}</div>
      <div class="score-form">
        <label class="field">
          <span>คะแนน (ใส่ค่าลบเพื่อหักคะแนน)</span>
          <input type="number" id="f-points" step="any" value="1" required autofocus>
        </label>
        <div class="preset-buttons">
          ${[1, 2, 5, -1, -2, -5].map((v) => `<button type="button" class="btn-small" data-preset="${v}">${v > 0 ? '+' + v : v}</button>`).join('')}
        </div>
        <label class="field">
          <span>เหตุผล/หมายเหตุ</span>
          <input type="text" id="f-reason" placeholder="เช่น ช่วยเหลืองาน, มาสาย">
        </label>
        <label class="field">
          <span>วันที่</span>
          <input type="date" id="f-date" value="${todayStr()}">
        </label>
        <button type="submit" class="btn btn-primary">บันทึกคะแนน</button>
      </div>
      <h4 class="history-heading">ประวัติคะแนน (${history.length})</h4>
      <div class="history-list">
        ${
          history.length === 0
            ? '<p class="empty-hint">ยังไม่มีประวัติคะแนน</p>'
            : history
                .map(
                  (entry) => `
          <div class="history-row" data-id="${entry.id}">
            <div class="history-info">
              <span class="history-points ${entry.points < 0 ? 'negative' : ''}">${entry.points > 0 ? '+' : ''}${entry.points}</span>
              <span class="history-reason">${escapeHtml(entry.reason || '-')}</span>
              <span class="history-date">${formatDateTh(entry.date)}</span>
            </div>
            <button type="button" class="btn-icon" data-delete="${entry.id}" title="ลบรายการนี้">🗑️</button>
          </div>
        `
                )
                .join('')
        }
      </div>
    `;
    modalBody.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('f-points').value = btn.dataset.preset;
      });
    });
    modalBody.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!confirm('ยืนยันลบรายการคะแนนนี้?')) return;
        state.scores = state.scores.filter((s) => s.id !== btn.dataset.delete);
        saveState();
        renderScoreModalBody(classId, studentId);
        render();
        showToast('ลบรายการคะแนนแล้ว');
      });
    });
  }

  // ---------- Export / Import (full backup) ----------
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `psychomotor-scores-backup-${todayStr()}.json`);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed.classes) || !Array.isArray(parsed.scores)) throw new Error('invalid');
        if (!confirm('การกู้คืนจะแทนที่ข้อมูลปัจจุบันทั้งหมด ยืนยันหรือไม่?')) return;
        state = { classes: parsed.classes, scores: parsed.scores };
        currentClassId = state.classes[0]?.id ?? null;
        saveState();
        render();
        showToast('กู้คืนข้อมูลสำเร็จ');
      } catch {
        alert('ไฟล์ไม่ถูกต้อง ไม่สามารถกู้คืนข้อมูลได้');
      }
    };
    reader.readAsText(file);
  }

  function exportCsv(classId) {
    const cls = getClass(classId);
    if (!cls) return;
    const rows = [['เลขที่', 'ชื่อ-สกุล', 'คะแนนรวม', 'คะแนนเต็ม']];
    sortStudents(cls.students).forEach((s) => {
      rows.push([s.number, s.name, String(studentTotal(s.id)), String(cls.maxScore)]);
    });
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${cls.name}-คะแนนจิตพิสัย.csv`);
  }

  function printReport(classId) {
    const cls = getClass(classId);
    if (!cls) return;
    const printArea = document.createElement('div');
    printArea.id = 'printArea';
    printArea.innerHTML = `
      <h1>รายงานคะแนนจิตพิสัย: ${escapeHtml(cls.name)}</h1>
      <p>คะแนนเต็ม ${cls.maxScore} · วันที่พิมพ์ ${formatDateTh(todayStr())}</p>
      <table>
        <thead><tr><th>เลขที่</th><th>ชื่อ-สกุล</th><th>คะแนนรวม</th></tr></thead>
        <tbody>
          ${sortStudents(cls.students)
            .map((s) => `<tr><td>${escapeHtml(s.number)}</td><td>${escapeHtml(s.name)}</td><td>${studentTotal(s.id)}</td></tr>`)
            .join('')}
        </tbody>
      </table>
    `;
    document.body.appendChild(printArea);
    window.print();
    document.body.removeChild(printArea);
  }

  // ---------- Wire up global buttons ----------
  document.getElementById('btnAddClass').addEventListener('click', openAddClassModal);
  document.getElementById('btnEditClass').addEventListener('click', () => openEditClassModal(currentClassId));
  document.getElementById('btnAddStudent').addEventListener('click', () => openAddStudentModal(currentClassId));
  document.getElementById('btnImportStudents').addEventListener('click', () => openImportStudentsModal(currentClassId));
  document.getElementById('btnExportCsv').addEventListener('click', () => exportCsv(currentClassId));
  document.getElementById('btnPrint').addEventListener('click', () => printReport(currentClassId));
  document.getElementById('btnExport').addEventListener('click', exportBackup);
  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importBackup(file);
    e.target.value = '';
  });
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderClassView();
  });

  render();
})();
