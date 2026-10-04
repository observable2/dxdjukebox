// The Admin page. mountAdmin(root, repo, html): "html" is the htl template tag, passed in by the page.
// Returns a promise that resolves once the first load has been drawn.
import {FIELDS, DAYS, todayISO} from "./lib.js";

export function mountAdmin(root, repo, html) {
  const ad = repo.adapter;
  const st = {
    data: {items: [], slots: []},
    editing: {},                       // the item in the form ({} = a new one)
    slot: {itemId: "", days: [], start: "09:00", end: "10:00", weeks: 1, from: todayISO()},   // the slot form, kept between redraws
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
      itemsPanel(), schedulePanel());
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
    const form = html`<form style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px"></form>`;
    for (const f of FIELDS) {
      const el = f.type === "textarea" ? html`<textarea rows=2></textarea>` : html`<input type=${f.type ?? "text"}>`;
      // A duration that only comes from the item's first slot is shown as a placeholder, not as a value,
      // so saving the form does not turn the default into a fixed value.
      const fromSlot = f.key === "duration" && ed.durationIsDefault && ed.duration === ed.durationDefault;
      Object.assign(el, {required: !!f.required, disabled: ro, value: fromSlot ? "" : (ed[f.key] ?? "")});
      if (f.pattern) { el.pattern = f.pattern; el.title = f.placeholder; }
      el.placeholder = fromSlot ? "default: " + ed.duration + " (length of first slot)" : (f.placeholder ?? "");
      el.style.width = "100%";
      inputs[f.key] = el;
      form.append(html`<label style="${f.type === "textarea" ? "grid-column:span 2" : ""}">${f.label}${f.required ? " *" : ""}<br>${el}</label>`);
    }
    form.append(html`<div style="grid-column:span 2"><button disabled=${ro}>${ed.id ? "Update item" : "Add item"}</button>
      <button type=button onclick=${() => { st.editing = {}; st.msg = ""; render(); }}>Clear</button>
      <small style="color:#666"> * required; everything else is optional</small></div>`);
    form.onsubmit = guard(async (e) => {
      e.preventDefault();
      const it = {...st.editing};
      for (const f of FIELDS) it[f.key] = inputs[f.key].value;
      st.editing = it;                 // keep what was typed if saving fails
      await repo.saveItem(it);
      st.editing = {};
      await refresh();
    });
    const rows = st.data.items.map((it) => html`<tr>
      <td>${it.title}</td><td>${it.authorship}</td>
      <td>${it.duration}${it.durationIsDefault ? html` <small style="color:#666">(first slot)</small>` : ""}</td>
      <td><button onclick=${() => { st.editing = it; st.msg = ""; render(); }}>Edit</button>
        <button disabled=${ro} onclick=${guard(async () => {
          if (confirm('Delete "' + it.title + '" and its slots?')) { await repo.deleteItem(it.id); await refresh(); }
        })}>Delete</button></td></tr>`);
    return html`<section><h3>Items (${st.data.items.length})</h3>${form}
      <table style="width:100%;margin-top:10px"><tr><th align=left>Title</th><th align=left>Authorship</th><th align=left>Duration</th><th></th></tr>${rows}</table></section>`;
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
    const rows = [...slots].sort((a, b) => a.start.localeCompare(b.start)).map((s) => html`<tr>
      <td>${s.start}–${s.end ?? "?"}</td><td>${items.find((i) => i.id === s.itemId)?.title}</td>
      <td>${s.days.map((d) => DAYS[d]).join(" ")}</td>
      <td>${s.weeks ? s.weeks + " wk from " : "every week from "}${s.from}</td>
      <td><button disabled=${ro} onclick=${guard(async () => { await repo.deleteSlot(s.id); await refresh(); })}>Remove</button></td></tr>`);
    return html`<section><h3>Schedule</h3>
      <div>${item} from ${start} until ${end} on ${days}</div>
      <div>Repeat for ${weeks} weeks (0 = indefinitely), starting week of ${from} <button disabled=${ro} onclick=${add}>Add slot</button></div>
      <p style="color:#666;margin:6px 0">An item can have any number of slots. Times not covered by any slot are unscheduled: Screen and Titles show "Nothing scheduled". Slots may touch (10:00 end, 10:00 start) but not overlap. An item with no Duration of its own uses the length of its first slot.</p>
      <table style="width:100%;margin-top:8px"><tr><th align=left>Time</th><th align=left>Item</th><th align=left>Days</th><th align=left>Span</th><th></th></tr>${rows}</table></section>`;
  }

  return refresh();
}
