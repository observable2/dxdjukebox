
export const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Duration: colon separated, first number unpadded. "M:SS" (e.g. 3:45, 90:00) or "H:MM:SS" (e.g. 1:02:30).
// Numbers after a colon are two digits and below 60 (so 3:05, not 3:5 or 3:65).
export const DURATION_PATTERN = "(0|[1-9][0-9]*):[0-5][0-9](:[0-5][0-9])?";
export const validDuration = (t) => new RegExp("^" + DURATION_PATTERN + "$").test(t ?? "");
export const durationSeconds = (t) => t.split(":").map(Number).reduce((acc, n) => acc * 60 + n, 0);
// Seconds -> duration text: M:SS under an hour, H:MM:SS from an hour (e.g. 300 -> "5:00", 3600 -> "1:00:00", 5400 -> "1:30:00")
export const formatDuration = (sec) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? h + ":" + p(m) + ":" + p(s) : m + ":" + p(s);
};

// Years: four digits (1000-9999). Month/Day: "M/D" (e.g. 3/14); a leading zero is tolerated (03/14) and normalized away.
export const YEAR_PATTERN = "[1-9][0-9]{3}";
export const MONTHDAY_PATTERN = "(0?[1-9]|1[0-2])/(0?[1-9]|[12][0-9]|3[01])";
export const currentYear = () => String(new Date().getFullYear());
export const validYear = (t) => new RegExp("^" + YEAR_PATTERN + "$").test(t ?? "");
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];   // Feb 29 allowed: the year may be unknown/leap
export const validMonthDay = (t) => {
  if (!new RegExp("^" + MONTHDAY_PATTERN + "$").test(t ?? "")) return false;
  const [m, d] = t.split("/").map(Number);
  return d <= DAYS_IN_MONTH[m - 1];
};
export const normalizeMonthDay = (t) => t.split("/").map(Number).join("/");

// Only Title, URL and Year created are required. Everything else is optional
// (Year published defaults to the current year; Duration defaults to the length of the item's first slot).
export const FIELDS = [
  {key:"title",label:"Title",required:true},{key:"authorship",label:"Authorship"},
  {key:"url",label:"URL",type:"url",required:true},{key:"hideURL",label:"Hide URL",type:"checkbox"},
  {key:"yearCreated",label:"Year created",required:true,pattern:YEAR_PATTERN,placeholder:"e.g. 2024"},
  {key:"monthDayCreated",label:"Month/Day created",pattern:MONTHDAY_PATTERN,placeholder:"optional, e.g. 3/14"},
  {key:"yearPublished",label:"Year published",pattern:YEAR_PATTERN,placeholder:"defaults to " + currentYear()},
  {key:"monthDayPublished",label:"Month/Day published",pattern:MONTHDAY_PATTERN,placeholder:"optional, e.g. 3/14"},
  {key:"whereCreated",label:"Where created"},
  {key:"publisher",label:"Publisher"},{key:"media",label:"Constituent media"},
  {key:"delivery",label:"Delivery medium"},
  {key:"duration",label:"Duration",pattern:DURATION_PATTERN,placeholder:"e.g. 3:45 or 1:02:30; blank = length of first slot"},
  {key:"notes",label:"Notes",type:"textarea"},{key:"furtherInfoURL",label:"Further info URL",type:"url"},
  {key:"course",label:"Course"},{key:"mentor",label:"Mentor"},{key:"license",label:"License"},
  {key:"credits",label:"Credits",type:"textarea"},
  {key:"rotation",label:"Included in Rotation",type:"checkbox"}];

// Start times: 00:00-23:55 in 5-minute steps. End times: 00:05-24:00 (24:00 = midnight at end of day).
export const validTime = (t) => /^([01][0-9]|2[0-3]):[0-5][05]$/.test(t);
export const validEnd = (t) => t === "24:00" || validTime(t);
export const todayISO = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
const hhmm = (d) => String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const weekStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Length of a slot as duration text ("1:00:00" for 09:00-10:00, "30:00" for 09:00-09:30); "" if the slot has no end.
const minutes = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const slotDuration = (s) => (s?.start && s?.end ? formatDuration((minutes(s.end) - minutes(s.start)) * 60) : "");
// An item's "first slot": the earliest by start date, then by time of day. null if the item has no slots.
export function firstSlot(slots, itemId) {
  const mine = slots.filter((s) => s.itemId === itemId);
  mine.sort((a, b) => (a.from + a.start + (a.end ?? "")).localeCompare(b.from + b.start + (b.end ?? "")));
  return mine[0] ?? null;
}
// Duration an item falls back to when none is entered: the length of its first slot, or "".
export const defaultDuration = (slots, itemId) => slotDuration(firstSlot(slots, itemId));

// Rotation: fills every day, 00:00 to 24:00, with back-to-back slots of `minutes` each, cycling through itemIds
// in order (the cycle restarts at midnight; a final slot is shortened if `minutes` does not divide the day).
// The slots repeat every week indefinitely from the given date and are marked rotation:true.
export const validRotationMinutes = (m) => Number.isInteger(m) && m >= 5 && m <= 1440 && m % 5 === 0;
export function rotationSlots(itemIds, minutes, from) {
  const hm = (n) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  const out = [];
  for (let m = 0, k = 0; m < 1440; m += minutes, k++)
    out.push({itemId: itemIds[k % itemIds.length], days: [0,1,2,3,4,5,6], start: hm(m), end: hm(Math.min(m + minutes, 1440)), weeks: 0, from, rotation: true});
  return out;
}

// Does the slot's day/week pattern include this calendar date? (time of day is not considered)
export function slotAppliesOn(s, date) {
  if (!s.days.includes(date.getDay())) return false;
  const from = new Date(s.from + "T00:00");
  if (dayStart(date) < dayStart(from)) return false;
  if (s.weeks === 0) return true;
  const idx = Math.round((weekStart(date) - weekStart(from)) / (7 * 864e5));
  return idx < s.weeks;
}

// Slots are half-open [start, end): a slot ending at 10:00 and another starting at 10:00 do NOT overlap.
export function slotsOverlap(a, b) {
  if (!(a.start < b.end && b.start < a.end)) return false;       // no shared time of day
  const fa = new Date(a.from + "T00:00"), fb = new Date(b.from + "T00:00");
  const first = fa > fb ? fa : fb;
  const endOf = (s, f) => s.weeks === 0 ? null : addDays(weekStart(f), s.weeks * 7);
  const ends = [endOf(a, fa), endOf(b, fb)].filter(Boolean);
  // both repeat forever: the weekly pattern repeats, so one week is enough to check
  const limit = ends.length ? new Date(Math.min(...ends)) : addDays(first, 7);
  for (let d = first; d < limit; d = addDays(d, 1))
    if (slotAppliesOn(a, d) && slotAppliesOn(b, d)) return true;
  return false;
}
export const findConflict = (slots, s, ignoreId) =>
  slots.find((o) => o.id !== ignoreId && slotsOverlap(o, s)) ?? null;

// Current item: the pinned item if there is one (it beats every slot, manual or generated, until unpinned);
// otherwise the slot covering now (start <= now < end), or null when nothing is scheduled.
export function pickCurrent(data, now = new Date()) {
  const pinned = data.items.find((i) => i.pinned);
  if (pinned) return pinned;
  const hm = hhmm(now);
  const covers = (s) => slotAppliesOn(s, now) && s.start <= hm && hm < (s.end ?? "24:00");
  // a manual slot overrides a generated rotation slot covering the same time
  const s = data.slots.find((s) => !s.rotation && covers(s)) ?? data.slots.find(covers);
  return s ? data.items.find((i) => i.id === s.itemId) ?? null : null;
}
// Polls; calls onChange(item|null) only when the current item changes; onError(message) on failure.
export function watchCurrent(repo, onChange, onError = () => {}, ms = 20000) {
  let last, stopped = false;
  const tick = async () => {
    try {
      const it = pickCurrent(await repo.load(), new Date());
      const k = JSON.stringify(it);
      if (!stopped && k !== last) { last = k; onChange(it); }
    } catch (e) { if (!stopped) onError(e.message); }
  };
  tick(); const t = setInterval(tick, ms);
  return () => { stopped = true; clearInterval(t); };
}
