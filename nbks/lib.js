
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

// Years: four digits (1000-9999). Month/Day: "M/D" (e.g. 3/14), or just "M" (e.g. 3) when the day is not known;
// a leading zero is tolerated (03/14, 03) and normalized away.
export const YEAR_PATTERN = "[1-9][0-9]{3}";
export const MONTHDAY_PATTERN = "(0?[1-9]|1[0-2])(/(0?[1-9]|[12][0-9]|3[01]))?";
export const currentYear = () => String(new Date().getFullYear());
export const validYear = (t) => new RegExp("^" + YEAR_PATTERN + "$").test(t ?? "");
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];   // Feb 29 allowed: the year may be unknown/leap
export const validMonthDay = (t) => {
  if (!new RegExp("^" + MONTHDAY_PATTERN + "$").test(t ?? "")) return false;
  const [m, d] = t.split("/").map(Number);
  return d === undefined || d <= DAYS_IN_MONTH[m - 1];
};
export const normalizeMonthDay = (t) => t.split("/").map(Number).join("/");

export const DURATION_TYPES = ["work", "loop", "ambient", "ambient loop"];

// Only Title, URL and Year created are required. Everything else is optional
// (Duration defaults to the length of the item's first slot).
export const FIELDS = [
  {key:"title",label:"Title",required:true},{key:"authorship",label:"Authorship"},
  {key:"url",label:"URL",type:"url",required:true},{key:"hideURL",label:"Hide URL",type:"checkbox"},
  {key:"yearCreated",label:"Year created",required:true,pattern:YEAR_PATTERN,placeholder:"e.g. 2024"},
  {key:"monthDayCreated",label:"Month/Day created",pattern:MONTHDAY_PATTERN,placeholder:"optional, e.g. 3/14, or 3 for a month only"},
  {key:"dateRelatedNotes",label:"Date related notes",type:"markdown",rows:2},
  {key:"whereCreated",label:"Where created"},
  {key:"publisher",label:"Publisher"},{key:"media",label:"Constituent media"},
  {key:"delivery",label:"Delivery medium"},
  {key:"duration",label:"Duration",pattern:DURATION_PATTERN,placeholder:"e.g. 3:45 or 1:02:30; blank = length of first slot"},
  {key:"durationType",label:"Duration type",type:"select",options:DURATION_TYPES,default:DURATION_TYPES[0]},
  {key:"notes",label:"Notes",type:"markdown",rows:8},{key:"furtherInfoURL",label:"Further info URL",type:"url"},
  {key:"course",label:"Course"},{key:"mentor",label:"Mentor"},{key:"license",label:"License"},
  {key:"credits",label:"Credits",type:"markdown",rows:2},
  {key:"rotation",label:"Included in Rotation",type:"checkbox"},
  {key:"screens",label:"Screens",placeholder:"rotation only; all = every screen, blank = none; e.g. 2, 7-10, lobby"}];

// Markdown (the Notes, Date related notes and Credits fields) to a DOM fragment. "marked" is the parser, passed in by the page (it comes from an npm: import,
// which only a notebook cell can do). Single newlines stay line breaks, so notes typed as plain text still look the same.
// Raw HTML in the text is shown as text, and only http(s)/mailto links survive, opening in a new tab.
export function markdownFragment(marked, text) {
  const tpl = document.createElement("template");
  tpl.innerHTML = marked.parse(String(text ?? ""), {breaks: true, gfm: true, renderer: new marked.Renderer()});
  for (const el of tpl.content.querySelectorAll("script,style,iframe,object,embed,form,link,meta")) el.remove();
  for (const el of tpl.content.querySelectorAll("*")) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (["href", "src"].includes(a.name) && !/^(https?:|mailto:|#)/i.test(a.value.trim()))) el.removeAttribute(a.name);
    }
    if (el.tagName === "A") { el.target = "_blank"; el.rel = "noopener"; }
  }
  return tpl.content;
}

// Screens: each has a number (1, 2, 3...) and a slug (lowercase, starts with a letter, e.g. "lobby"), so a slug can never be
// mistaken for a number or a range. A screen is named in a URL (?s=2 or ?s=lobby) and in an item's Screens text.
export const SLUG_PATTERN = "[a-z][a-z0-9-]*";
export const validSlug = (t) => new RegExp("^" + SLUG_PATTERN + "$").test(t ?? "");
export const screenRefFromURL = (search = location.search) => new URLSearchParams(search).get("s") || undefined;
// The URL query that names a screen: none for screen 1 (what a page with no query shows), else ?s=slug.
export const screenQuery = (screen) => (screen.number === 1 ? "" : "?s=" + encodeURIComponent(screen.slug));
// The screen a reference ("2", "lobby", or none = the lowest-numbered screen) names, or undefined.
export function findScreen(screens, ref) {
  const sorted = [...screens].sort((a, b) => a.number - b.number);
  const r = String(ref ?? "").trim().toLowerCase();
  if (!r) return sorted[0];
  return /^\d+$/.test(r) ? sorted.find((s) => s.number === +r) : sorted.find((s) => s.slug === r);
}
// An item's Screens text, e.g. "2, 7-10, lobby" -> [[2,2],[7,10],[lobby's number, same]]. "all" -> null, meaning every screen.
// Blank -> [], meaning no screen. ("all" is reserved, so no screen can have it as its slug.)
// slugs maps slug -> number. An unknown slug is an error unless strict is false (then it is ignored).
export function parseScreens(text, slugs = {}, strict = true) {
  const ranges = [];
  let all = false;
  for (const raw of String(text ?? "").split(",")) {
    const tok = raw.trim().toLowerCase();
    if (!tok) continue;
    let m;
    if (tok === "all") all = true;
    else if ((m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(tok))) {
      const lo = +m[1], hi = m[2] === undefined ? lo : +m[2];
      if (lo < 1 || hi < lo) throw new Error('Screens: "' + raw.trim() + '" is not a valid number or range (screens start at 1; a range runs low-high)');
      ranges.push([lo, hi]);
    } else if (validSlug(tok)) {
      if (tok in slugs) ranges.push([slugs[tok], slugs[tok]]);
      else if (strict) throw new Error('Screens: there is no screen with the slug "' + tok + '"');
    } else throw new Error('Screens: cannot read "' + raw.trim() + '"; use screen numbers, ranges like 7-10, or slugs, separated by commas');
  }
  return all ? null : ranges;
}
// Does an item's Screens text include this screen number? ("all" = yes, blank = no)
export const onScreen = (text, number, slugs) => {
  const ranges = parseScreens(text, slugs, false);
  return !ranges || ranges.some(([lo, hi]) => lo <= number && number <= hi);
};

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
// currentInfo also says why: {item, pinned, endsAt, length, screen} where, for a slot, endsAt is a Date and length is the
// slot's length in seconds; a pinned item has neither (it stays until unpinned). {item: null} = nothing scheduled.
export function currentInfo(data, now = new Date()) {
  return {...currentShowing(data, now), screen: data.screen};   // screen: the screen it is for, so a page can use its settings
}
function currentShowing(data, now) {
  const pinned = data.items.find((i) => i.id === data.pinnedItemId);
  if (pinned) return {item: pinned, pinned: true};
  const hm = hhmm(now);
  const covers = (s) => slotAppliesOn(s, now) && s.start <= hm && hm < (s.end ?? "24:00");
  // a manual slot overrides a generated rotation slot covering the same time
  const s = data.slots.find((s) => !s.rotation && covers(s)) ?? data.slots.find(covers);
  const item = s ? data.items.find((i) => i.id === s.itemId) ?? null : null;
  if (!item) return {item: null};
  const end = minutes(s.end ?? "24:00");
  return {item, pinned: false, endsAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, end), length: (end - minutes(s.start)) * 60};
}
// The generated rotation's cycle: each item once, in the order the rotation shows them (by start time of day).
export const rotationOrder = (slots) =>
  [...new Set(slots.filter((s) => s.rotation).sort((a, b) => a.start.localeCompare(b.start)).map((s) => s.itemId))];
// The item one step (+1 next, -1 previous) around the rotation from what is showing now (the pinned item if there is
// one, else the scheduled item). If that item is not in the rotation, +1 gives its first item and -1 its last.
// null if there is no rotation.
export function stepRotation(data, dir, now = new Date()) {
  const order = rotationOrder(data.slots);
  if (!order.length) return null;
  const shown = currentInfo(data, now).item;
  const i = shown ? order.indexOf(shown.id) : -1;
  const k = i < 0 ? (dir > 0 ? 0 : order.length - 1) : (i + dir + order.length) % order.length;
  return order[k];
}
export const pickCurrent = (data, now = new Date()) => currentInfo(data, now).item;
// Polls; calls onChange(item|null) only when the current item changes; onError(message) on failure.
// screenRef names the screen (number or slug; undefined = the lowest-numbered screen).
// onInfo(currentInfo) is called on every poll (for what can change while the item stays the same, like time left).
export function watchCurrent(repo, onChange, onError = () => {}, ms = 20000, onInfo = () => {}, screenRef) {
  let last, stopped = false;
  const tick = async () => {
    try {
      const info = currentInfo(await repo.load(screenRef), new Date());
      const k = JSON.stringify(info.item);
      if (stopped) return;
      onInfo(info);
      if (k !== last) { last = k; onChange(info.item); }
    } catch (e) { if (!stopped) onError(e.message); }
  };
  tick(); const t = setInterval(tick, ms);
  return () => { stopped = true; clearInterval(t); };
}
