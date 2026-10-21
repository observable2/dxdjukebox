
import {DURATION_TYPES, validSlug, findScreen, parseScreens, onScreen, validTime, validEnd, validDuration, validYear, validMonthDay, normalizeMonthDay, defaultDuration, findConflict, rotationSlots, validRotationMinutes, todayISO, DAYS} from "./lib.js";

const nul = (v) => (v === "" || v === undefined ? null : v);
const num = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
const toRow = {
  item: (i) => ({title: i.title, authorship: nul(i.authorship), url: i.url,
    year_created: num(i.yearCreated), month_day_created: nul(i.monthDayCreated),
    date_related_notes: nul(i.dateRelatedNotes),
    where_created: nul(i.whereCreated),
    publisher: nul(i.publisher), media: nul(i.media), delivery: nul(i.delivery), duration: nul(i.duration), duration_type: i.durationType, notes: nul(i.notes),
    course: nul(i.course), mentor: nul(i.mentor), license: nul(i.license), credits: nul(i.credits),
    rotation: !!i.rotation, screens: nul(i.screens),
    hide_url: !!i.hideURL, further_info_url: nul(i.furtherInfoURL)}),
  screen: (s) => ({number: s.number, slug: s.slug, name: nul(s.name), show_titles_link: s.showTitlesLink}),
  slot: (s) => ({screen_id: s.screenId, item_id: s.itemId, days: s.days, start_time: s.start, end_time: s.end, weeks: s.weeks, from_date: s.from, rotation: !!s.rotation})
};
const fromRow = {
  item: (r) => ({id: r.id, title: r.title, authorship: r.authorship ?? "", url: r.url,
    yearCreated: r.year_created == null ? "" : String(r.year_created), monthDayCreated: r.month_day_created ?? "",
    dateRelatedNotes: r.date_related_notes ?? "",
    whereCreated: r.where_created ?? "",
    publisher: r.publisher ?? "", media: r.media ?? "", delivery: r.delivery ?? "", duration: r.duration ?? "", durationType: r.duration_type ?? "work", notes: r.notes ?? "",
    course: r.course ?? "", mentor: r.mentor ?? "", license: r.license ?? "", credits: r.credits ?? "",
    rotation: !!r.rotation, screens: r.screens ?? "",
    hideURL: !!r.hide_url, furtherInfoURL: r.further_info_url ?? ""}),
  // pinnedItemId is read-only here: toRow.screen leaves it alone, so saving a screen never changes what is pinned
  screen: (r) => ({id: r.id, number: r.number, slug: r.slug, name: r.name ?? "", showTitlesLink: r.show_titles_link !== false, pinnedItemId: r.pinned_item_id ?? null}),
  slot: (r) => ({id: r.id, screenId: r.screen_id, itemId: r.item_id, days: r.days, start: r.start_time, end: r.end_time, weeks: r.weeks, from: r.from_date, rotation: !!r.rotation})
};

const filterOf = (where) => Object.entries(where).map(([k, v]) => k + "=eq." + v).join("&") || "id=not.is.null";

export function supabaseAdapter({url, anonKey}) {
  let token = null;
  const headers = (extra) => ({apikey: anonKey, Authorization: "Bearer " + (token ?? anonKey), "Content-Type": "application/json", ...extra});
  const call = async (path, opts = {}) => {
    const r = await fetch(url + "/rest/v1/" + path, {cache: "no-store", ...opts, headers: headers(opts.headers)});
    if (r.status === 401) {
      // The sign-in has expired (or was never made). Forget the dead token so the Admin page offers its sign-in form again;
      // the page keeps the record being edited, so signing in and repeating the action loses nothing.
      token = null;
      throw new Error("Your sign-in has expired. Sign in again at the top of the page, then repeat what you were doing; anything you had typed is kept.");
    }
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
    list: (t) => call(tbl(t) + "?select=*&order=" + (t === "item" ? "title" : t === "screen" ? "number" : "start_time")),
    async insert(t, row) { return (await call(tbl(t), {method: "POST", headers: {Prefer: "return=representation"}, body: JSON.stringify(row)}))[0]; },
    async update(t, id, row) {
      const body = t === "item" ? {...row, updated_at: new Date().toISOString()} : row;
      return (await call(tbl(t) + "?id=eq." + id, {method: "PATCH", headers: {Prefer: "return=representation"}, body: JSON.stringify(body)}))[0];
    },
    async remove(t, id) { await call(tbl(t) + "?id=eq." + id, {method: "DELETE"}); },
    // Bulk operations. "where" is {column: value}; PostgREST refuses an unfiltered delete/patch, so "every row" is id-not-null.
    async insertMany(t, rows) { await call(tbl(t), {method: "POST", body: JSON.stringify(rows)}); },
    async removeAll(t, where = {}) { await call(tbl(t) + "?" + filterOf(where), {method: "DELETE"}); },
    async updateAll(t, row) { await call(tbl(t) + "?id=not.is.null", {method: "PATCH", body: JSON.stringify(row)}); },
    // A database function (see schema.sql) that anyone may call, signed in or not
    async rpc(name, args) { await call("rpc/" + name, {method: "POST", body: JSON.stringify(args)}); }
  };
}

export function localAdapter(key = "dxd-jukebox-dev") {
  const write = (d) => localStorage.setItem(key, JSON.stringify(d));
  const read = () => {
    let d; try { d = JSON.parse(localStorage.getItem(key)); } catch { d = null; }
    d = {item: [], slot: [], screen: [], ...d};
    if (!d.screen.length) {   // first run, or data saved before screens existed: one default screen takes every existing slot
      const s = {id: crypto.randomUUID(), number: 1, slug: "main", name: "Main", show_titles_link: true, pinned_item_id: null};
      d.screen.push(s);
      d.slot = d.slot.map((x) => ({screen_id: s.id, ...x}));
      write(d);
    }
    return d;
  };
  return {
    name: "local", needsSignIn: false, canWrite: true, async signIn() {},
    async list(t) { return read()[t]; },
    async insert(t, row) { const d = read(), r = {id: crypto.randomUUID(), ...row}; d[t].push(r); write(d); return r; },
    async update(t, id, row) { const d = read(), i = d[t].findIndex((x) => x.id === id); d[t][i] = {...d[t][i], ...row}; write(d); return d[t][i]; },
    async insertMany(t, rows) { const d = read(); d[t].push(...rows.map((r) => ({id: crypto.randomUUID(), ...r}))); write(d); },
    async removeAll(t, where = {}) { const d = read(); d[t] = d[t].filter((x) => !Object.entries(where).every(([k, v]) => x[k] === v)); write(d); },
    async updateAll(t, row) { const d = read(); d[t] = d[t].map((x) => ({...x, ...row})); write(d); },
    async rpc(name, {p_item}) {   // only studio_pin exists: pins an item of screen 2's rotation, as the database function does
      const d = read(), s = d.screen.find((x) => x.number === 2);
      if (!s) throw new Error("There is no screen 2");
      if (p_item && !d.slot.some((x) => x.screen_id === s.id && x.rotation && x.item_id === p_item)) throw new Error("That item is not in the studio rotation");
      s.pinned_item_id = p_item ?? null; write(d);
    },
    async remove(t, id) {
      const d = read(); d[t] = d[t].filter((x) => x.id !== id);
      if (t === "item") { d.slot = d.slot.filter((s) => s.item_id !== id); d.screen = d.screen.map((s) => s.pinned_item_id === id ? {...s, pinned_item_id: null} : s); }
      if (t === "screen") d.slot = d.slot.filter((s) => s.screen_id !== id);
      write(d);
    }
  };
}

const describe = (s) => s.days.map((d) => DAYS[d]).join("/") + " " + s.start + "-" + s.end;
const str = (v) => String(v ?? "").trim();

// Trim, normalize Month/Day, and validate. slugs maps each screen's slug to its number (for checking the Screens text).
// Required: title, url, year created. Duration is optional: when blank it is stored empty and load() supplies the default.
function cleanItem(item, slugs) {
  const it = {...item};
  // An item that came back from load() carries the slot-derived duration in "duration". If that value is still
  // unchanged it must not be frozen into the record; a duration the user typed (different from it) is kept.
  if (it.durationIsDefault && it.duration === it.durationDefault) it.duration = "";
  for (const k of ["title", "url", "yearCreated", "monthDayCreated", "duration", "durationType", "furtherInfoURL", "screens"]) it[k] = str(it[k]);
  it.rotation = !!it.rotation;
  it.hideURL = !!it.hideURL;
  if (!it.title) throw new Error("Title is required");
  if (!it.url) throw new Error("URL is required");
  if (!validYear(it.yearCreated)) throw new Error("Year created is required: a four-digit year, e.g. 2024");
  if (it.monthDayCreated && !validMonthDay(it.monthDayCreated)) throw new Error("Month/Day created must be a real date as M/D, e.g. 3/14");
  if (it.monthDayCreated) it.monthDayCreated = normalizeMonthDay(it.monthDayCreated);
  if (!it.durationType) it.durationType = "work";
  if (!DURATION_TYPES.includes(it.durationType)) throw new Error("Duration type must be one of: " + DURATION_TYPES.join(", "));
  parseScreens(it.screens, slugs);   // throws on text it cannot read or an unknown slug
  if (it.duration && !validDuration(it.duration)) throw new Error("Duration must be M:SS or H:MM:SS with no leading zero, e.g. 3:45 or 1:02:30 (or leave blank)");
  return it;
}

const slugMap = (screens) => Object.fromEntries(screens.map((s) => [s.slug, s.number]));
const noScreen = (ref) => Object.assign(new Error(ref ? 'There is no screen "' + ref + '"' : "No screens are set up"), {code: "no-screen"});

export function createRepo(adapter) {
  const screensOf = async () => (await adapter.list("screen")).map(fromRow.screen);
  return {
    adapter,
    // screenRef names the screen: its number, its slug, or nothing for the lowest-numbered screen. Returns
    // {items, slots, screens, screen, pinnedItemId}: every item, but only that screen's slots and pinned item.
    // Items come back with an effective duration: the entered one, else the length of the item's first slot on this
    // screen (or, failing that, on any screen). When the slot supplied it, durationIsDefault is true and
    // durationDefault holds the same value (nothing is stored on the item).
    async load(screenRef) {
      const [i, s, sc] = await Promise.all([adapter.list("item"), adapter.list("slot"), adapter.list("screen")]);
      const screens = sc.map(fromRow.screen).sort((a, b) => a.number - b.number);
      const screen = findScreen(screens, screenRef);
      if (!screen) throw noScreen(screenRef);
      const all = s.map(fromRow.slot);
      const slots = all.filter((x) => x.screenId === screen.id);
      const items = i.map(fromRow.item).map((it) => {
        if (it.duration) return it;
        const d = defaultDuration(slots, it.id) || defaultDuration(all, it.id);
        return d ? {...it, duration: d, durationIsDefault: true, durationDefault: d} : it;
      });
      return {items, slots, screens, screen, pinnedItemId: screen.pinnedItemId};
    },
    async saveItem(item) {
      const it = cleanItem(item, slugMap(await screensOf()));
      const row = toRow.item(it);
      return fromRow.item(it.id ? await adapter.update("item", it.id, row) : await adapter.insert("item", row));
    },
    deleteItem: (id) => adapter.remove("item", id),
    // Screens: a number and a slug, each unique. Deleting a screen deletes its slots; the last screen cannot be deleted.
    async saveScreen(screen) {
      const s = {id: screen.id, number: Number(screen.number), slug: str(screen.slug).toLowerCase(), name: str(screen.name), showTitlesLink: screen.showTitlesLink !== false};
      if (!Number.isInteger(s.number) || s.number < 1) throw new Error("Screen number must be a whole number, 1 or more");
      if (s.slug === "all") throw new Error('Screen slug "all" is reserved (in an item\'s Screens text it means every screen)');
      if (!validSlug(s.slug)) throw new Error("Screen slug must be lowercase letters, digits and hyphens, starting with a letter, e.g. lobby");
      const others = (await screensOf()).filter((o) => o.id !== s.id);
      if (others.some((o) => o.number === s.number)) throw new Error("Screen number " + s.number + " is already used");
      if (others.some((o) => o.slug === s.slug)) throw new Error('Screen slug "' + s.slug + '" is already used');
      const row = toRow.screen(s);
      return fromRow.screen(s.id ? await adapter.update("screen", s.id, row) : await adapter.insert("screen", row));
    },
    async deleteScreen(id) {
      if ((await screensOf()).length < 2) throw new Error("The last screen cannot be deleted");
      await adapter.remove("screen", id);
    },
    async addSlot({screenId, itemId, days, start, end, weeks = 0, from}) {
      if (!screenId) throw new Error("Choose a screen");
      if (!validTime(start)) throw new Error("Start must be HH:MM in 5-minute steps");
      if (!validEnd(end)) throw new Error("End must be HH:MM in 5-minute steps (24:00 allowed)");
      if (!(start < end)) throw new Error("End must be later than start");
      if (!days?.length) throw new Error("Choose at least one day");
      const slot = {screenId, itemId, days, start, end, weeks, from};
      // only this screen's slots count: screens are independent. Generated rotation slots are ignored: a manual slot
      // overrides them, so it may sit on top of a rotation
      const existing = (await adapter.list("slot")).map(fromRow.slot).filter((s) => s.screenId === screenId && !s.rotation);
      const clash = findConflict(existing, slot);
      if (clash) throw new Error("Overlaps an existing slot (" + describe(clash) + ")");
      return fromRow.slot(await adapter.insert("slot", toRow.slot(slot)));
    },
    deleteSlot: (id) => adapter.remove("slot", id),
    // Rotation, for one screen: replaces that screen's previous rotation with back-to-back slots cycling through the items
    // flagged rotation=true whose Screens text includes the screen ("all" = every screen, blank = none). Manual slots are kept and win
    // over rotation slots where they overlap (see currentInfo). The old rotation slots are removed first, so a failed
    // insert leaves no rotation.
    async generateRotation(minutes, screenId) {
      if (!validRotationMinutes(minutes)) throw new Error("Slot duration must be a whole number of minutes, a multiple of 5 (5-1440)");
      const [items, screens] = await Promise.all([adapter.list("item"), screensOf()]);
      const screen = screens.find((s) => s.id === screenId);
      if (!screen) throw noScreen();
      const slugs = slugMap(screens);
      const ids = items.filter((r) => r.rotation && onScreen(r.screens, screen.number, slugs)).map((r) => r.id);
      if (!ids.length) throw new Error("No items flagged \"Included in Rotation\" apply to screen " + screen.number);
      await adapter.removeAll("slot", {rotation: true, screen_id: screenId});
      await adapter.insertMany("slot", rotationSlots(ids, minutes, todayISO()).map((s) => toRow.slot({...s, screenId})));
    },
    clearRotation: (screenId) => adapter.removeAll("slot", {rotation: true, screen_id: screenId}),
    // Un-flags every item (on every screen). Slots (including generated rotations) are not touched.
    resetRotationFlags: () => adapter.updateAll("item", {rotation: false}),
    // Pinning, per screen: a screen has at most one pinned item. It is what that screen's Screen and Titles show, over any
    // slot, until unpinned. Slots and the rotation are not touched.
    pinItem: (screenId, itemId) => adapter.update("screen", screenId, {pinned_item_id: itemId}),
    unpinItem: (screenId) => adapter.update("screen", screenId, {pinned_item_id: null}),
    // Public (no sign-in) control of screen 2 ("studio"): pins an item of its generated rotation, or null to clear the pin
    studioPin: (itemId) => adapter.rpc("studio_pin", {p_item: itemId ?? null})
  };
}
