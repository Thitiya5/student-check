/**
 * Search and filter component for finding attendance records
 */

/**
 * Render search interface for finding records by teacher or classroom
 * @param {HTMLElement} container 
 * @param {Object} props
 * @param {Object} props.attendanceRecords - All attendance records by date
 * @param {string} props.currentDate - Current selected date
 * @param {Array} props.students - Student roster
 * @param {Function} props.onResultSelect - Callback when a result is selected (dateKey, level, room, teacherName)
 */
export function renderRecordSearchInterface(container, { attendanceRecords, currentDate, students, onResultSelect }) {
  const classes = getUniqueClassesFromRecords(attendanceRecords, students);
  const teachers = getUniqueTeachersFromRecords(attendanceRecords);

  container.innerHTML = `
    <div class="search-filter-container">
      <div style="display: grid; gap: 1rem; grid-template-columns: 1fr 1fr;">
        <div>
          <label for="teacherFilter">ค้นหาจากชื่อครู</label>
          <select id="teacherFilter" class="select-field">
            <option value="">-- ทั้งหมด --</option>
            ${teachers.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="classFilter">ค้นหาจากห้องเรียน</label>
          <select id="classFilter" class="select-field">
            <option value="">-- ทั้งหมด --</option>
            ${classes.map(c => `<option value="${c.key}">${c.level}/${c.room}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="searchResults" style="margin-top: 1.5rem;"></div>
    </div>
  `;

  const teacherFilter = container.querySelector('#teacherFilter');
  const classFilter = container.querySelector('#classFilter');
  const resultsContainer = container.querySelector('#searchResults');

  const updateResults = () => {
    const selectedTeacher = teacherFilter.value;
    const selectedClass = classFilter.value;
    
    const results = searchRecords(attendanceRecords, {
      teacher: selectedTeacher || null,
      classKey: selectedClass || null
    });

    if (results.length === 0) {
      resultsContainer.innerHTML = '<p class="empty-state">ไม่พบข้อมูล</p>';
      return;
    }

    let html = '<div style="display: grid; gap: 0.8rem;">';
    results.forEach(result => {
      html += `
        <div class="check-card-modern result-card" style="cursor: pointer;" data-date="${result.dateKey}" data-class="${result.classKey}" data-teacher="${result.teacherName}">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div>
              <h4 style="margin: 0; font-size: 1rem;">${formatDateThai(result.dateKey)}</h4>
              <p style="margin: 0.5rem 0 0; font-size: 0.9rem; color: var(--text-secondary);">
                ชั้น ${result.level} ห้อง ${result.room}
              </p>
              <p style="margin: 0.25rem 0 0; font-size: 0.9rem; color: var(--text-secondary);">
                ครู: ${result.teacherName}
              </p>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 0.85rem; color: var(--text-secondary);">
                ${result.summary ? `
                  มา: ${result.summary.present || 0}<br/>
                  ขาด: ${result.summary.absent || 0}
                ` : 'ไม่มีข้อมูล'}
              </div>
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    resultsContainer.innerHTML = html;

    // Add click handlers
    resultsContainer.querySelectorAll('.result-card').forEach(card => {
      card.addEventListener('click', () => {
        const dateKey = card.dataset.date;
        const classKey = card.dataset.class;
        const teacherName = card.dataset.teacher;
        const [level, room] = classKey.split('/');
        onResultSelect?.(dateKey, level, room, teacherName);
      });
    });
  };

  teacherFilter.addEventListener('change', updateResults);
  classFilter.addEventListener('change', updateResults);
  
  // Initial load
  updateResults();
}

/**
 * Get unique classes (level/room) from all records
 * @param {Object} attendanceRecords
 * @param {Array} students - For reference
 * @returns {Array<{level: string, room: string, key: string}>}
 */
export function getUniqueClassesFromRecords(attendanceRecords, students = []) {
  const classSet = new Set();
  
  Object.values(attendanceRecords).forEach(dateRecords => {
    Object.keys(dateRecords || {}).forEach(classKey => {
      classSet.add(classKey);
    });
  });

  return Array.from(classSet).map(key => {
    const [level, room] = key.split('/');
    return { level, room, key };
  }).sort((a, b) => {
    const levelCmp = a.level.localeCompare(b.level, undefined, { numeric: true });
    if (levelCmp !== 0) return levelCmp;
    return a.room.localeCompare(b.room, undefined, { numeric: true });
  });
}

/**
 * Get unique teachers from all records
 * @param {Object} attendanceRecords
 * @returns {string[]}
 */
export function getUniqueTeachersFromRecords(attendanceRecords) {
  const teacherSet = new Set();
  
  Object.values(attendanceRecords).forEach(dateRecords => {
    Object.values(dateRecords || {}).forEach(classRecords => {
      Object.keys(classRecords || {}).forEach(teacherName => {
        teacherSet.add(teacherName);
      });
    });
  });

  return Array.from(teacherSet).sort();
}

/**
 * Search records by teacher and/or class
 * @param {Object} attendanceRecords
 * @param {Object} filters - { teacher?: string, classKey?: string }
 * @returns {Array} - Array of matching records with metadata
 */
export function searchRecords(attendanceRecords, filters = {}) {
  const results = [];
  const { teacher, classKey } = filters;

  Object.entries(attendanceRecords).forEach(([dateKey, dateRecords]) => {
    Object.entries(dateRecords || {}).forEach(([key, classRecords]) => {
      // Filter by class if specified
      if (classKey && key !== classKey) return;

      Object.entries(classRecords || {}).forEach(([teacherName, attendance]) => {
        // Filter by teacher if specified
        if (teacher && teacherName !== teacher) return;

        const [level, room] = key.split('/');
        const summary = calculateSummary(attendance);
        
        results.push({
          dateKey,
          classKey: key,
          level,
          room,
          teacherName,
          attendance,
          summary
        });
      });
    });
  });

  // Sort by date (newest first)
  return results.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

/**
 * Calculate attendance summary
 * @param {Record<string, string>} attendance - status by student_id
 * @returns {Object}
 */
export function calculateSummary(attendance) {
  const summary = { present: 0, late: 0, absent: 0, leave: 0, sick: 0, total: 0 };
  
  Object.values(attendance).forEach(status => {
    if (status in summary) {
      summary[status] += 1;
    }
    summary.total += 1;
  });

  return summary;
}

/**
 * Format date for display (Thai)
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @returns {string}
 */
export function formatDateThai(dateKey) {
  if (!dateKey || dateKey.length !== 10) return dateKey;
  
  const [year, month, day] = dateKey.split('-');
  const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  
  const monthIndex = parseInt(month) - 1;
  const monthName = monthNames[monthIndex] || month;
  const thaiYear = (parseInt(year) + 543);
  
  return `${day} ${monthName} ${thaiYear}`;
}
