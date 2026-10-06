// The Admin page. mountAdmin(root, repo, html): "html" is the htl template tag, passed in by the page.
// Returns a promise that resolves once the first load has been drawn.
import {FIELDS, DAYS, todayISO} from "./lib.js";

export function mountAdmin(root, repo, html) {
  const ad = repo.adapter;
  const st = {
    data: {items: [], slots: []},
    editing: {},                       // the item in the form ({} = a new one)
    slot: {itemId: "", days: [], start: "09:00", end: "10:00", weeks: 1, from: todayISO()},   // the slot form, kept between redraws
    search: "",                        // items-table filter text, kept between redraws
    rotMinutes: 10,                    // the rotation's slot length, kept between redraws
    msg: ""
  };

  async function refresh() {
    try { st.data = await repo.load(); st.msg = ""; } catch (e) { st.msg = e.message; }
    render();
  }
  // Wraps an action: an error is shown at the top of the page instead of being lost.
  const guard = (fn) => async (...args) => {
    try { await fn(...args); } catch (e) { st.msg = e.message; render(); }
  };
  function render() {
    root.replaceChildren(
      ...(ad.canWrite ? [] : [signIn()]),
      html`<p class="admin-msg" style="color:crimson">${st.msg}</p>`,
      itemsPanel(), rotationPanel(), schedulePanel());
  }

  function signIn() {
    const email = html`<input type=email placeholder=email required>`;
    const pw = html`<input type=password placeholder=password required>`;
    return html`<form onsubmit=${guard(async (e) => {
      e.preventDefault(); await ad.signIn(email.value, pw.value); await refresh();
    })}><b>Admin sign-in</b> ${email} ${pw} <button>Sign in</button> <small>(read-only until signed in)</small></form>`;
  }

  function itemsPanel() {
    const ro = !ad.canWrite, ed = st.editing, inputs = {};
    const form = html`<form style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px"></form>`;
    for (const f of FIELDS) {
      const el = f.type === "textarea" ? html`<textarea rows=2></textarea>` : html`<input type=${f.type ?? "text"}>`;
      // A duration that only comes from the item's first slot is shown as a placeholder, not as a value,
      // so saving the form does not turn the default into a fixed value.
      const fromSlot = f.key === "duration" && ed.durationIsDefault && ed.duration === ed.durationDefault;
      const isBox = f.type === "checkbox";
      Object.assign(el, {required: !!f.required, disabled: ro});
      if (isBox) el.checked = !!ed[f.key]; else el.value = fromSlot ? "" : (ed[f.key] ?? "");
      if (f.pattern) { el.pattern = f.pattern; el.title = f.placeholder; }
      el.placeholder = fromSlot ? "default: " + ed.duration + " (length of first slot)" : (f.placeholder ?? "");
      if (!isBox) el.style.width = "100%";
      inputs[f.key] = el;
      form.append(html`<label style="${f.type === "textarea" ? "grid-column:span 2" : ""}">${f.label}${f.required ? " *" : ""} <small style="color:#666;font-size:0.75em;overflow-wrap:anywhere">(${f.key})</small><br>${el}</label>`);
    }
    form.append(html`<div style="grid-column:span 2"><button disabled=${ro}>${ed.id ? "Update item" : "Add item"}</button>
      <button type=button onclick=${() => { st.editing = {}; st.msg = ""; render(); }}>Clear</button>
      <small style="color:#666"> * required; everything else is optional</small></div>`);
    form.onsubmit = guard(async (e) => {
      e.preventDefault();
      const it = {...st.editing};
      for (const f of FIELDS) it[f.key] = f.type === "checkbox" ? inputs[f.key].checked : inputs[f.key].value;
      st.editing = it;                 // keep what was typed if saving fails
      await repo.saveItem(it);
      st.editing = {};
      await refresh();
    });
    const row = (it) => html`<tr>
      <td>${it.title}</td><td>${it.authorship}</td>
      <td>${it.duration}${it.durationIsDefault ? html` <small style="color:#666">(first slot)</small>` : ""}</td>
      <td><button onclick=${() => { st.editing = it; st.msg = ""; render(); }}>Edit</button>
        <button disabled=${ro} onclick=${guard(async () => {
          if (confirm('Delete "' + it.title + '" and its slots?')) { await repo.deleteItem(it.id); await refresh(); }
        })}>Delete</button></td></tr>`;
    // Matches on title or authorship, so a specific item can be found (to edit or delete) without
    // scrolling a long list. Filtering updates just the table body, not the whole panel, so the
    // search box keeps focus and caret position while typing.
    const matching = (q) => st.data.items.filter((it) =>
      !q || it.title.toLowerCase().includes(q) || (it.authorship ?? "").toLowerCase().includes(q));
    const noMatch = () => html`<tr><td colspan=4 style="color:#666">No items match "${st.search}"</td></tr>`;
    const rowsFor = (q) => { const found = matching(q).map(row); return found.length ? found : [noMatch()]; };
    const tbody = html`<tbody>${rowsFor(st.search.trim().toLowerCase())}</tbody>`;
    const search = html`<input type=search placeholder="Find an item by title or authorship…" style="width:100%" value=${st.search}
      oninput=${() => { st.search = search.value; tbody.replaceChildren(...rowsFor(st.search.trim().toLowerCase())); }}>`;
    return html`<section><h3>Items (${st.data.items.length})</h3>${form}
      <div style="margin-top:10px">${search}</div>
      <table style="width:100%;margin-top:6px"><tr><th align=left>Title</th><th align=left>Authorship</th><th align=left>Duration</th><th></th></tr>${tbody}</table></section>`;
  }

  function rotationPanel() {
    const ro = !ad.canWrite, {items, slots} = st.data;
    const generated = slots.filter((s) => s.rotation);
    const flagged = items.filter((i) => i.rotation);
    const mins = (s) => (+s.end.slice(0, 2) * 60 + +s.end.slice(3)) - (+s.start.slice(0, 2) * 60 + +s.start.slice(3));
    const minutes = html`<input type=number min=5 step=5 value=${st.rotMinutes} style="width:5em">`;
    minutes.oninput = () => { st.rotMinutes = +minutes.value; };
    // One row per item in the generated rotation, with the length of its slots (the last slot of the day may be shorter).
    const inRotation = items.filter((i) => generated.some((s) => s.itemId === i.id))
      .map((i) => ({title: i.title, len: Math.max(...generated.filter((s) => s.itemId === i.id).map(mins))}));
    const generate = guard(async () => {
      await repo.generateRotation(st.rotMinutes); await refresh();
    });
    const clear = guard(async () => { await repo.clearRotation(); await refresh(); });
    const reset = guard(async () => {
      if (!confirm("Set \"Included in Rotation\" to false for ALL items? (An existing rotation's slots are not touched.)")) return;
      await repo.resetRotationFlags(); await refresh();
    });
    return html`<section><h3>Rotation</h3>
      <div>Slot duration ${minutes} minutes
        <button disabled=${ro} onclick=${generate}>Generate rotation</button>
        <button disabled=${ro} onclick=${clear}>Clear rotation</button>
        <button disabled=${ro} onclick=${reset}>Set all items' rotation to false</button></div>
      <p style="color:#666;margin:6px 0">Generate rotation fills every day with back-to-back slots cycling through the ${flagged.length} item${flagged.length === 1 ? "" : "s"} flagged Included in Rotation (the cycle restarts at midnight), replacing any previous rotation. Manual slots are kept and take priority over the rotation while they apply; an item whose turn falls under a manual slot is skipped for that time. Clear rotation removes only the generated slots; item flags are kept.</p>
      ${inRotation.length
        ? html`<table style="width:100%"><tr><th align=left>Item in rotation</th><th align=left>Slot duration</th></tr>${inRotation.map((r) => html`<tr><td>${r.title}</td><td>${r.len} min</td></tr>`)}</table>`
        : html`<p style="color:#666">No rotation is currently scheduled.</p>`}</section>`;
  }

  function schedulePanel() {
    const ro = !ad.canWrite, {items, slots} = st.data, sf = st.slot;
    const item = html`<select>${items.map((i) => html`<option value=${i.id} selected=${i.id === sf.itemId}>${i.title}${i.duration ? " (" + i.duration + ")" : ""}</option>`)}</select>`;
    const days = DAYS.map((d, i) => html`<label style="margin-right:6px"><input type=checkbox value=${i} checked=${sf.days.includes(i)}> ${d}</label>`);
    const start = html`<input type=time step=300 value=${sf.start}>`;
    // <input type=time> cannot hold 24:00, so the end is a text box: type 24:00 to run to midnight
    const end = html`<input type=text size=5 pattern="([01][0-9]|2[0-3]):[0-5][05]|24:00" placeholder="HH:MM" value=${sf.end} title="End time, 5-minute steps (24:00 = midnight)">`;
    const weeks = html`<input type=number min=0 value=${sf.weeks} style="width:4em">`;
    const from = html`<input type=date value=${sf.from}>`;
    const add = guard(async () => {
      const ds = days.map((l) => l.querySelector("input")).filter((c) => c.checked).map((c) => +c.value);
      Object.assign(st.slot, {itemId: item.value, days: ds, start: start.value, end: end.value, weeks: +weeks.value, from: from.value});
      if (!item.value) throw new Error("Add an item first");
      await repo.addSlot({itemId: item.value, days: ds, start: start.value, end: end.value, weeks: +weeks.value, from: from.value});
      await refresh();
    });
    const rows = slots.filter((s) => !s.rotation).sort((a, b) => a.start.localeCompare(b.start)).map((s) => html`<tr>
      <td>${s.start}–${s.end ?? "?"}</td><td>${items.find((i) => i.id === s.itemId)?.title}</td>
      <td>${s.days.map((d) => DAYS[d]).join(" ")}</td>
      <td>${s.weeks ? s.weeks + " wk from " : "every week from "}${s.from}</td>
      <td><button disabled=${ro} onclick=${guard(async () => { await repo.deleteSlot(s.id); await refresh(); })}>Remove</button></td></tr>`);
    return html`<section><h3>Schedule (manual slots; a generated rotation is summarized above)</h3>
      <div>${item} from ${start} until ${end} on ${days}</div>
      <div>Repeat for ${weeks} weeks (0 = indefinitely), starting week of ${from} <button disabled=${ro} onclick=${add}>Add slot</button></div>
      <p style="color:#666;margin:6px 0">An item can have any number of slots. Times not covered by any slot are unscheduled: Screen and Titles show "Nothing scheduled". Slots may touch (10:00 end, 10:00 start) but not overlap each other; a manual slot may sit on top of a generated rotation and overrides it. An item with no Duration of its own uses the length of its first slot.</p>
      <table style="width:100%;margin-top:8px"><tr><th align=left>Time</th><th align=left>Item</th><th align=left>Days</th><th align=left>Span</th><th></th></tr>${rows}</table></section>`;
  }

  return refresh();
}
