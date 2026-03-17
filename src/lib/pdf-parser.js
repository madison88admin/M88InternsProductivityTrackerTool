/**
 * PDF Parser for Daily Activity Reports (DAR)
 * Extracts attendance data (dates, time in/out) from uploaded PDF files.
 */

/**
 * Extract text items with x/y positions from a PDF file.
 * Groups items into rows by Y coordinate, sorted left-to-right within each row.
 * @param {File} file - The PDF file to parse
 * @returns {Promise<Array<string[]>>} Array of rows, each being an array of cell strings
 */
export async function extractTextWithPositions(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allRows = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group text items by Y position (same Y = same row)
    const rowMap = {};
    for (const item of content.items) {
      if (!item.str || item.str.trim() === '') continue;
      // Round Y to nearest 2px to group items on the same line
      const y = Math.round(item.transform[5] / 2) * 2;
      const x = item.transform[4];
      if (!rowMap[y]) rowMap[y] = [];
      rowMap[y].push({ x, text: item.str.trim() });
    }

    // Sort rows by Y descending (PDF Y-axis goes bottom-to-top)
    const sortedYs = Object.keys(rowMap).map(Number).sort((a, b) => b - a);

    for (const y of sortedYs) {
      const row = rowMap[y].sort((a, b) => a.x - b.x).map(item => item.text);
      allRows.push(row);
    }
  }

  return allRows;
}

// --- Date parsing ---

const MONTH_NAMES = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Try to parse a date string into YYYY-MM-DD format.
 * Handles: MM/DD/YYYY, M/D/YY, YYYY-MM-DD, "March 1, 2026", "1-Mar-26", etc.
 * @param {string} str
 * @returns {string|null} YYYY-MM-DD or null
 */
function parseDate(str) {
  if (!str) return null;
  const s = str.trim();

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // MM/DD/YYYY or M/D/YYYY or MM-DD-YYYY
  const mdyFull = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdyFull) {
    const [, m, d, y] = mdyFull;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // MM/DD/YY or M/D/YY
  const mdyShort = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (mdyShort) {
    const [, m, d, yy] = mdyShort;
    const y = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // "March 1, 2026" or "Mar 1, 2026"
  const longDate = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (longDate) {
    const [, monthStr, d, y] = longDate;
    const m = MONTH_NAMES[monthStr.toLowerCase()];
    if (m !== undefined) {
      return `${y}-${String(m + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  // "1-Mar-2026" or "1-Mar-26"
  const dmyAlpha = s.match(/^(\d{1,2})[\/\-]([A-Za-z]+)[\/\-](\d{2,4})$/);
  if (dmyAlpha) {
    const [, d, monthStr, yRaw] = dmyAlpha;
    const m = MONTH_NAMES[monthStr.toLowerCase()];
    if (m !== undefined) {
      const y = yRaw.length === 2 ? (parseInt(yRaw) > 50 ? `19${yRaw}` : `20${yRaw}`) : yRaw;
      return `${y}-${String(m + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  return null;
}

// --- Time parsing ---

/**
 * Try to parse a time string into HH:MM (24-hour) format.
 * Handles: "8:00 AM", "08:00", "1:30 PM", "13:30", "8:00AM", etc.
 * @param {string} str
 * @returns {string|null} HH:MM or null
 */
function parseTime(str) {
  if (!str) return null;
  const s = str.trim().toUpperCase();

  // HH:MM AM/PM (with optional space)
  const ampm = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (ampm) {
    let [, h, m, period] = ampm;
    h = parseInt(h);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  // HH:MM (24-hour)
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const [, h, m] = hhmm;
    return `${h.padStart(2, '0')}:${m}`;
  }

  return null;
}

// --- Header detection ---

const DATE_KEYWORDS = ['date', 'day'];
const TIME_IN_KEYWORDS = ['time in', 'timein', 'time-in', 'morning in', 'am in', 'arrival', 'in'];
const TIME_OUT_KEYWORDS = ['time out', 'timeout', 'time-out', 'end of day', 'pm out', 'departure', 'out'];
const LUNCH_OUT_KEYWORDS = ['lunch out', 'lunchout', 'am out', 'morning out', 'break start'];
const AFTERNOON_IN_KEYWORDS = ['afternoon in', 'pm in', 'lunch in', 'break end'];

/**
 * Check if a cell text matches any of the given keywords.
 */
function matchesKeyword(text, keywords) {
  const t = text.toLowerCase().trim();
  return keywords.some(k => t === k || t.includes(k));
}

/**
 * Detect header row and determine column indices.
 * @param {Array<string[]>} rows
 * @returns {{ headerIndex: number, columns: object }|null}
 */
function detectHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (row.length < 2) continue;

    const joined = row.join(' ').toLowerCase();

    // Must have at least a date and a time reference
    const hasDate = row.some(c => matchesKeyword(c, DATE_KEYWORDS));
    const hasTime = joined.includes('time') || joined.includes('in') || joined.includes('morning') || joined.includes('arrival');

    if (!hasDate && !hasTime) continue;

    // Try to map columns
    const columns = { date: -1, timeIn1: -1, timeOut1: -1, timeIn2: -1, timeOut2: -1 };

    for (let j = 0; j < row.length; j++) {
      const cell = row[j];
      if (columns.date === -1 && matchesKeyword(cell, DATE_KEYWORDS)) {
        columns.date = j;
      }
    }

    // Find time columns - order matters: look for specific matches first
    const unmapped = [];
    for (let j = 0; j < row.length; j++) {
      if (j === columns.date) continue;
      const cell = row[j];

      if (columns.timeIn1 === -1 && matchesKeyword(cell, TIME_IN_KEYWORDS) && !matchesKeyword(cell, AFTERNOON_IN_KEYWORDS)) {
        columns.timeIn1 = j;
      } else if (columns.timeOut1 === -1 && matchesKeyword(cell, LUNCH_OUT_KEYWORDS)) {
        columns.timeOut1 = j;
      } else if (columns.timeIn2 === -1 && matchesKeyword(cell, AFTERNOON_IN_KEYWORDS)) {
        columns.timeIn2 = j;
      } else if (columns.timeOut2 === -1 && matchesKeyword(cell, TIME_OUT_KEYWORDS) && !matchesKeyword(cell, LUNCH_OUT_KEYWORDS)) {
        columns.timeOut2 = j;
      } else if (cell.toLowerCase().includes('time') || cell.toLowerCase().includes('in') || cell.toLowerCase().includes('out')) {
        unmapped.push(j);
      }
    }

    // If we only found generic "Time In" / "Time Out" (2-column format),
    // map them to timeIn1 and timeOut2
    if (columns.timeIn1 === -1 && columns.timeOut2 === -1 && unmapped.length >= 2) {
      columns.timeIn1 = unmapped[0];
      columns.timeOut2 = unmapped[1];
    }

    // Need at least date + one time column
    if (columns.date !== -1 && (columns.timeIn1 !== -1 || columns.timeOut2 !== -1)) {
      return { headerIndex: i, columns };
    }
  }

  return null;
}

/**
 * Parse a Daily Activity Report from extracted PDF rows.
 * @param {Array<string[]>} rows - Array of rows from extractTextWithPositions
 * @returns {Array<{ date: string, timeIn1: string, timeOut1: string, timeIn2: string, timeOut2: string, raw: string }>}
 */
export function parseDailyActivityReport(rows) {
  const header = detectHeader(rows);
  if (!header) {
    // Fallback: try to find rows with dates and times without a formal header
    return parseFallback(rows);
  }

  const { headerIndex, columns } = header;
  const entries = [];

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 2) continue;

    const dateStr = columns.date !== -1 && row[columns.date] ? parseDate(row[columns.date]) : null;
    if (!dateStr) continue; // Skip rows without a valid date

    const entry = {
      date: dateStr,
      timeIn1: columns.timeIn1 !== -1 && row[columns.timeIn1] ? parseTime(row[columns.timeIn1]) : '',
      timeOut1: columns.timeOut1 !== -1 && row[columns.timeOut1] ? parseTime(row[columns.timeOut1]) : '',
      timeIn2: columns.timeIn2 !== -1 && row[columns.timeIn2] ? parseTime(row[columns.timeIn2]) : '',
      timeOut2: columns.timeOut2 !== -1 && row[columns.timeOut2] ? parseTime(row[columns.timeOut2]) : '',
      raw: row.join(' | '),
    };

    entries.push(entry);
  }

  return entries;
}

/**
 * Fallback parser: scan all rows for lines that contain a date and time values.
 */
function parseFallback(rows) {
  const entries = [];

  for (const row of rows) {
    if (row.length < 2) continue;

    let dateStr = null;
    const times = [];

    for (const cell of row) {
      const d = parseDate(cell);
      if (d && !dateStr) {
        dateStr = d;
        continue;
      }
      const t = parseTime(cell);
      if (t) times.push(t);
    }

    if (dateStr && times.length >= 1) {
      entries.push({
        date: dateStr,
        timeIn1: times[0] || '',
        timeOut1: times[1] || '',
        timeIn2: times[2] || '',
        timeOut2: times[3] || '',
        raw: row.join(' | '),
      });
    }
  }

  return entries;
}
