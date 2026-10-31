/** Today's date (YYYY-MM-DD) in the browser's local timezone; the server re-checks against the business date. */
export const todayLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
