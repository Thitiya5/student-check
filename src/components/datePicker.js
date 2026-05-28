/**
 * Date picker component for selecting attendance date
 */

/**
 * Render a date picker control
 * @param {HTMLElement} container 
 * @param {Object} props
 * @param {string} props.currentDate - Current date in YYYY-MM-DD format
 * @param {Function} props.onDateChange - Callback when date changes
 */
export function renderDatePicker(container, { currentDate, onDateChange }) {
  const dateParts = currentDate.split('-');
  const year = dateParts[0] || new Date().getFullYear();
  const month = dateParts[1] || String(new Date().getMonth() + 1).padStart(2, '0');
  const day = dateParts[2] || String(new Date().getDate()).padStart(2, '0');

  container.innerHTML = `
    <div class="date-picker-group">
      <label for="attendanceDatePicker">เลือกวันที่เช็คชื่อ</label>
      <input 
        id="attendanceDatePicker" 
        type="date" 
        class="input-field"
        value="${year}-${month}-${day}"
        aria-label="เลือกวันที่"
      />
    </div>
  `;

  const datePicker = container.querySelector('#attendanceDatePicker');
  datePicker?.addEventListener('change', (e) => {
    const newDate = e.target.value;
    if (newDate && onDateChange) {
      onDateChange(newDate);
    }
  });
}

/**
 * Get date range for the last N days
 * @param {number} days - Number of days to go back (default: 7)
 * @returns {Array<string>} - Array of dates in YYYY-MM-DD format
 */
export function getRecentDates(days = 7) {
  const dates = [];
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  
  return dates;
}

/**
 * Format date for display (Thai)
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @returns {string} - Formatted date string
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

/**
 * Get day name from date (Thai)
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @returns {string} - Day name in Thai
 */
export function getDayNameThai(dateKey) {
  if (!dateKey) return '';
  const date = new Date(`${dateKey}T12:00:00+07:00`);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'long'
  }).format(date);
}

/**
 * Format date with day name (Thai)
 * @param {string} dateKey - Date in YYYY-MM-DD format
 * @returns {string} - Formatted date with day name
 */
export function formatDateWithDayThai(dateKey) {
  const formatted = formatDateThai(dateKey);
  const day = getDayNameThai(dateKey);
  return `${day} ${formatted}`;
}
