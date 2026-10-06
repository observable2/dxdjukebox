
import {validTime, validEnd, validDuration, validYear, validMonthDay, normalizeMonthDay, currentYear, defaultDuration, findConflict, rotationSlots, validRotationMinutes, todayISO, DAYS} from "./lib.js";

const nul = (v) => (v === "" || v === undefined ? null : v);
const num = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
const toRow = {
  item: (i) => ({title: i.title, authorship: nul(i.authorship), url: i.url,
    year_created: num(i.yearCreated), month_day_created: nul(i.monthDayCreated),
    year_published: num(i.yearPublished), month_day_published: nul(i.monthDayPublished),
    where_created: nul(i.whereCreated),
    publisher: nul(i.publisher), media: nul(i.media), delivery: nul(i.delivery), duration: nul(i.duration), notes: nul(i.notes),
    course: nul(i.course), mentor: nul(i.mentor), license: nul(i.license), credits: nul(i.credits),
    rotation: !!i.rotation}),
  slot: (s) => ({item_id: s.itemId, days: s.days, start_time: s.start, end_time: s.end, weeks: s.weeks, from_date: s.from, rotation: !!s.rotation})
};
const fromRow = {
  item: (r) => ({id: r.id, title: r.title, authorship: r.authorship ?? "", url: r.url,
    yearCreated: r.year_created == null ? "" : String(r.year_created), monthDayCreated: r.month_day_created ?? "",
    yearPublished: r.year_published == null ? "" : String(r.year_published), monthDayPublished: r.month_day_published ?? "",
    whereCreated: r.where_created ?? "",
    publisher: r.publisher ?? "", media: r.media ?? "", delivery: r.delivery ?? "", duration: r.duration ?? "", notes: r.notes ?? "",
    course: r.course ?? "", mentor: r.mentor ?? "", license: r.license ?? "", credits: r.credits ?? "",
    rotation: !!r.rotation}),
  slot: (r) => ({id: r.id, itemId: r.item_id, days: r.days, start: r.start_time, end: r.end_time, weeks: r.weeks, from: r.from_date, rotation: !!r.rotation})
};

const filterOf = (where) => Object.entries(where).map(([k, v]) => k + "=eq." + v).join("&") || "id=not.is.null";

export function supabaseAdapter({url, anonKey}) {
  let token = null;
  const headers = (extra) => ({apikey: anonKey, Authorization: "Bearer " + (token ?? anonKey), "Content-Type": "application/json", ...extra});
  const call = async (path, opts = {}) => {
    const r = await fetch(url + "/rest/v1/" + path, {...opts, headers: headers(opts.headers)});
    if (!r.ok) throw new Error(r.status + " " + (await r.text()));
    // a successful POST/PATCH without Prefer: return=representation answers 201/200 with an empty body
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
  const tbl = (t) => "jukebox_" + t + "s";
  return {
    name: "supabase",
    needsSignIn: true,
    get canWrite() { return !!token; },
    async signIn(email, password) {
      const r = await fetch(url + "/auth/v1/token?grant_type=password", {method: "POST",
        headers: {apikey: anonKey, "Content-Type": "application/json"}, body: JSON.stringify({email, password})});
      if (!r.ok) throw new Error("Sign-in failed");
      token = (await r.json()).access_token;
    },
    list: (t) => call(tbl(t) + "?select=*&order=" + (t === "item" ? "title" : "start_time")),
    async insert(t, row) { return (await call(tbl(t), {method: "POST", headers: {Prefer: "return=representation"}, body: JSON.stringify(row)}))[0]; },
    async update(t, id, row) {
      const body = t === "item" ? {...row, updated_at: new Date().toISOString()} : row;
      return (await call(tbl(t) + "?id=eq." + id, {method: "PATCH", headers: {Prefer: "return=representation"}, body: JSON.stringify(body)}))[0];
    },
    async remove(t, id) { await call(tbl(t) + "?id=eq." + id, {method: "DELETE"}); },
    // Bulk operations. "where" is {column: value}; PostgREST refuses an unfiltered delete/patch, so "every row" is id-not-null.
    async insertMany(t, rows) { await call(tbl(t), {method: "POST", body: JSON.stringify(rows)}); },
    async removeAll(t, where = {}) { await call(tbl(t) + "?" + filterOf(where), {method: "DELETE"}); },
    async updateAll(t, row) { await call(tbl(t) + "?id=not.is.null", {method: "PATCH", body: JSON.stringify(row)}); }
  };
}

export function localAdapter(key = "dxd-jukebox-dev") {
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) ?? {item: [], slot: []}; } catch { return {item: [], slot: []}; } };
  const write = (d) => localStorage.setItem(key, JSON.stringify(d));
  return {
    name: "local", needsSignIn: false, canWrite: true, async signIn() {},
    async list(t) { return read()[t]; },
    async insert(t, row) { const d = read(), r = {id: crypto.randomUUID(), ...row}; d[t].push(r); write(d); return r; },
    async update(t, id, row) { const d = read(), i = d[t].findIndex((x) => x.id === id); d[t][i] = {...d[t][i], ...row}; write(d); return d[t][i]; },
    async insertMany(t, rows) { const d = read(); d[t].push(...rows.map((r) => ({id: crypto.randomUUID(), ...r}))); write(d); },
    async removeAll(t, where = {}) { const d = read(); d[t] = d[t].filter((x) => !Object.entries(where).every(([k, v]) => x[k] === v)); write(d); },
    async updateAll(t, row) { const d = read(); d[t] = d[t].map((x) => ({...x, ...row})); write(d); },
    async remove(t, id) { const d = read(); d[t] = d[t].filter((x) => x.id !== id); if (t === "item") d.slot = d.slot.filter((s) => s.item_id !== id); write(d); }
  };
}

const describe = (s) => s.days.map((d) => DAYS[d]).join("/") + " " + s.start + "-" + s.end;
const str = (v) => String(v ?? "").trim();

// Trim, apply the "year published defaults to the current year" rule, normalize Month/Day, and validate.
// Required: title, url, year created. Duration is optional: when blank it is stored empty and load() supplies the default.
function cleanItem(item) {
  const it = {...item};
  // An item that came back from load() carries the slot-derived duration in "duration". If that value is still
  // unchanged it must not be frozen into the record; a duration the user typed (different from it) is kept.
  if (it.durationIsDefault && it.duration === it.durationDefault) it.duration = "";
  for (const k of ["title", "url", "yearCreated", "monthDayCreated", "yearPublished", "monthDayPublished", "duration"]) it[k] = str(it[k]);
  it.rotation = !!it.rotation;
  if (!it.title) throw new Error("Title is required");
  if (!it.url) throw new Error("URL is required");
  if (!validYear(it.yearCreated)) throw new Error("Year created is required: a four-digit year, e.g. 2024");
  if (it.monthDayCreated && !validMonthDay(it.monthDayCreated)) throw new Error("Month/Day created must be a real date as M/D, e.g. 3/14");
  if (!it.yearPublished) it.yearPublished = currentYear();
  if (!validYear(it.yearPublished)) throw new Error("Year published must be a four-digit year, e.g. 2024 (or leave blank for the current year)");
  if (it.monthDayPublished && !validMonthDay(it.monthDayPublished)) throw new Error("Month/Day published must be a real date as M/D, e.g. 3/14");
  if (it.monthDayCreated) it.monthDayCreated = normalizeMonthDay(it.monthDayCreated);
  if (it.monthDayPublished) it.monthDayPublished = normalizeMonthDay(it.monthDayPublished);
  if (it.duration && !validDuration(it.duration)) throw new Error("Duration must be M:SS or H:MM:SS with no leading zero, e.g. 3:45 or 1:02:30 (or leave blank)");
  return it;
}

export function createRepo(adapter) {
  return {
    adapter,
    // Items come back with an effective duration: the entered one, else the length of the item's first slot.
    // When the slot supplied it, durationIsDefault is true and durationDefault holds the same value (nothing is stored on the item).
    async load() {
      const [i, s] = await Promise.all([adapter.list("item"), adapter.list("slot")]);
      const slots = s.map(fromRow.slot);
      const items = i.map(fromRow.item).map((it) => {
        if (it.duration) return it;
        const d = defaultDuration(slots, it.id);
        return d ? {...it, duration: d, durationIsDefault: true, durationDefault: d} : it;
      });
      return {items, slots};
    },
    async saveItem(item) {
      const it = cleanItem(item);
      const row = toRow.item(it);
      return fromRow.item(it.id ? await adapter.update("item", it.id, row) : await adapter.insert("item", row));
    },
    deleteItem: (id) => adapter.remove("item", id),
    async addSlot({itemId, days, start, end, weeks = 0, from}) {
      if (!validTime(start)) throw new Error("Start must be HH:MM in 5-minute steps");
      if (!validEnd(end)) throw new Error("End must be HH:MM in 5-minute steps (24:00 allowed)");
      if (!(start < end)) throw new Error("End must be later than start");
      if (!days?.length) throw new Error("Choose at least one day");
      const slot = {itemId, days, start, end, weeks, from};
      // generated rotation slots are ignored: a manual slot overrides them, so it may sit on top of a rotation
      const existing = (await adapter.list("slot")).map(fromRow.slot).filter((s) => !s.rotation);
      const clash = findConflict(existing, slot);
      if (clash) throw new Error("Overlaps an existing slot (" + describe(clash) + ")");
      return fromRow.slot(await adapter.insert("slot", toRow.slot(slot)));
    },
    deleteSlot: (id) => adapter.remove("slot", id),
    // Rotation: replaces any previous rotation with back-to-back slots cycling through the items flagged
    // rotation=true. Manual slots are kept and win over rotation slots where they overlap (see pickCurrent).
    // The old rotation slots are removed first, so a failed insert leaves no rotation.
    async generateRotation(minutes) {
      if (!validRotationMinutes(minutes)) throw new Error("Slot duration must be a whole number of minutes, a multiple of 5 (5-1440)");
      const ids = (await adapter.list("item")).filter((r) => r.rotation).map((r) => r.id);
      if (!ids.length) throw new Error("No items are flagged \"Included in Rotation\"");
      await adapter.removeAll("slot", {rotation: true});
      await adapter.insertMany("slot", rotationSlots(ids, minutes, todayISO()).map(toRow.slot));
    },
    clearRotation: () => adapter.removeAll("slot", {rotation: true}),
    // Un-flags every item. Slots (including a generated rotation) are not touched.
    resetRotationFlags: () => adapter.updateAll("item", {rotation: false})
  };
}
