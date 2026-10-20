// The Admin page. mountAdmin(root, repo, html, renderMarkdown): "html" is the htl template tag, passed in by the page;
// renderMarkdown(text) returns a DOM fragment (used for the Markdown field's preview).
// Returns a promise that resolves once the first load has been drawn.
import {FIELDS, DAYS, todayISO, stepRotation, onScreen} from "./lib.js";

export function mountAdmin(root, repo, html, renderMarkdown) {
  const ad = repo.adapter;
  const st = {
    data: {items: [], slots: [], screens: [], screen: null, pinnedItemId: null},
    screenRef: undefined,              // number of the screen the schedule, rotation and Show now panels work on (undefined = lowest)
    editingScreen: {},                 // the screen in the screens form ({} = a new one)
    editing: {},                       // the item in the form ({} = a new one)
    listOpen: true,                    // whether the items list is expanded, kept between redraws
    rotOpen: false,                    // whether the rotation list is expanded, kept between redraws
    slotsOpen: false,                  // whether the manual slots list is expanded, kept between redraws
    screensOpen: false,                // likewise for Manage screens
    slot: {itemId: "", days: [], start: "09:00", end: "10:00", weeks: 1, from: todayISO()},   // the slot form, kept between redraws
    search: "",                        // items-table filter text, kept between redraws
    rotMinutes: 10,                    // the rotation's slot length, kept between redraws
    msg: ""
  };

  async function refresh() {
    try {
      try { st.data = await repo.load(st.screenRef); }
      catch (e) {   // the chosen screen no longer exists (deleted, or renumbered): go back to the lowest-numbered one
        if (e.code !== "no-screen" || st.screenRef === undefined) throw e;
        st.screenRef = undefined; st.data = await repo.load();
      }
      st.screenRef = st.data.screen.number; st.msg = "";
    } catch (e) { st.msg = e.message; }
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
      ...[screensPanel(), itemsPanel(), rotationPanel(), schedulePanel(), pinPanel()].flatMap((p) => [p, html`<hr style="border:0;background:none;height:0;padding:0;border-top:2px solid #888;margin:20px 0">`]));
  }

  function signIn() {
    const email = html`<input type=email placeholder=email required>`;
    const pw = html`<input type=password placeholder=password required>`;
    return html`<form onsubmit=${guard(async (e) => {
      e.preventDefault(); await ad.signIn(email.value, pw.value); await refresh();
    })}><b>Admin sign-in</b> ${email} ${pw} <button>Sign in</button> <small>(read-only until signed in)</small></form>`;
  }

  // " · screen 2 (lobby)": added to the headings of the panels that work on one screen
  const screenTitle = () => st.data.screen ? " · screen " + st.data.screen.number + " (" + st.data.screen.slug + ")" : "";

  // Screens: the picker chooses which screen the Rotation, Schedule and Show now panels work on (Items are shared by all
  // screens). The URLs to embed are shown for the chosen screen; "Manage screens" adds, renames and deletes screens.
  function screensPanel() {
    const ro = !ad.canWrite, {screens, screen} = st.data, ed = st.editingScreen, inputs = {};
    const pick = html`<select>${screens.map((s) => html`<option value=${s.number} selected=${s.id === screen?.id}>${s.number} · ${s.slug}${s.name ? " · " + s.name : ""}</option>`)}</select>`;
    pick.onchange = () => { st.screenRef = +pick.value; st.msg = ""; refresh(); };
    const q = screen ? "?s=" + encodeURIComponent(screen.slug) : "";
    const screenURL = new URL("screen", location.href).href + q, titlesURL = new URL("./", location.href).href + q;
    const field = (key, label, el) => { inputs[key] = el; Object.assign(el, {disabled: ro, value: ed[key] ?? ""}); return html`<label>${label} ${el}</label>`; };
    const number = field("number", "Number", html`<input type=number min=1 required style="width:5em">`);
    const slug = field("slug", "Slug", html`<input pattern=${"[a-z][a-z0-9\\-]*"} title="lowercase letters, digits and hyphens, starting with a letter" required size=12>`);
    const name = field("name", "Name", html`<input size=20>`);
    const titlesLink = html`<input type=checkbox checked=${ed.showTitlesLink ?? true} disabled=${ro}>`;   // a new screen shows the link
    const form = html`<form style="margin-top:6px">${number} ${slug} ${name}
      <label title="A small link on the Screen page to the Titles page for this screen">${titlesLink} Titles link on Screen</label>
      <button disabled=${ro}>${ed.id ? "Update screen" : "Add screen"}</button>
      <button type=button onclick=${() => { st.editingScreen = {}; st.msg = ""; render(); }}>Clear</button></form>`;
    form.onsubmit = guard(async (e) => {
      e.preventDefault();
      st.editingScreen = {...ed, number: inputs.number.value, slug: inputs.slug.value, name: inputs.name.value, showTitlesLink: titlesLink.checked};   // keep what was typed if saving fails
      await repo.saveScreen(st.editingScreen);
      st.editingScreen = {};
      await refresh();
    });
    const row = (s) => html`<tr><td>${s.number}</td><td>${s.slug}</td><td>${s.name}</td>
      <td><button onclick=${() => { st.editingScreen = s; st.msg = ""; render(); }}>Edit</button>
        <button disabled=${ro} onclick=${guard(async () => {
          if (!confirm("Delete screen " + s.number + " (" + s.slug + ") and its slots? Items are kept.")) return;
          await repo.deleteScreen(s.id); await refresh();
        })}>Delete</button></td></tr>`;
    const manage = html`<details style="margin-top:6px;margin-bottom:12px" open=${st.screensOpen}><summary>Manage screens (${screens.length})</summary>${form}
        <p style="color:#666;margin:6px 0">A screen has a number and a slug, each unique. An item's Screens text (for rotation) can use numbers, ranges and slugs: <code>2, 7-10, lobby</code>. A page with no <code>?s=</code> shows the lowest-numbered screen. Deleting a screen deletes its slots.</p>
        <table style="width:100%"><tr><th align=left>Number</th><th align=left>Slug</th><th align=left>Name</th><th></th></tr>${screens.map(row)}</table></details>`;
    manage.ontoggle = () => { st.screensOpen = manage.open; };   // only the arrow opens or closes it; redraws keep it as it was
    return html`<section><h3>Screen</h3>
      <div>Working on ${pick}
        <small style="color:#666">Rotation, Schedule and Show now below apply to this screen; Items are shared by all screens.</small></div>
      <div style="margin-top:6px"><small style="color:#666;overflow-wrap:anywhere">Screen: <a href=${screenURL} target=_blank>${screenURL}</a><br>Titles: <a href=${titlesURL} target=_blank>${titlesURL}</a></small></div>
      ${manage}</section>`;
  }

  // A Markdown field: a toolbar of formatting buttons over the textarea, and a Write/Preview switch. The buttons wrap the
  // selected text (or insert a placeholder) with Markdown marks; Ctrl/Cmd-B, -I and -K do bold, italic and link.
  function markdownField(f, ta, ro) {
    const wrap = (before, after, ph) => {
      const {selectionStart: a, selectionEnd: b, value} = ta, sel = value.slice(a, b) || ph;
      ta.setRangeText(before + sel + after, a, b, "end");
      ta.setSelectionRange(a + before.length, a + before.length + sel.length);
      ta.focus();
    };
    // prefix every selected line (or the current one), e.g. "- " for a list; "1. " numbers them
    const lines = (prefix) => {
      const v = ta.value, a = v.lastIndexOf("\n", ta.selectionStart - 1) + 1;
      let e = v.indexOf("\n", ta.selectionEnd); if (e < 0) e = v.length;
      const out = v.slice(a, e).split("\n").map((l, i) => (prefix === "1. " ? i + 1 + ". " : prefix) + l).join("\n");
      ta.setRangeText(out, a, e, "select");
      ta.focus();
    };
    const link = () => {
      const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd) || "link text";
      const url = prompt("Link address (URL):", "https://");
      if (url) { ta.setRangeText(`[${sel}](${url})`, ta.selectionStart, ta.selectionEnd, "end"); ta.focus(); }
    };
    const actions = {b: () => wrap("**", "**", "bold"), i: () => wrap("*", "*", "italic"), k: link};
    ta.addEventListener("keydown", (e) => {
      const fn = (e.metaKey || e.ctrlKey) && !e.altKey && actions[e.key.toLowerCase()];
      if (fn) { e.preventDefault(); fn(); }
    });
    const preview = html`<div class="md-preview" hidden></div>`;
    const btn = (label, title, fn, style = "") => html`<button type=button title=${title} disabled=${ro} style=${style} onclick=${fn}>${label}</button>`;
    const tools = html`<span>${btn("B", "Bold (Ctrl/Cmd-B)", actions.b, "font-weight:bold")}
      ${btn("I", "Italic (Ctrl/Cmd-I)", actions.i, "font-style:italic")}
      ${btn("Link", "Link (Ctrl/Cmd-K)", link)}
      ${btn("• List", "Bulleted list", () => lines("- "))}
      ${btn("1. List", "Numbered list", () => lines("1. "))}
      ${btn("❝ Quote", "Quotation", () => lines("> "))}</span>`;
    const show = (previewing) => {
      if (previewing) preview.replaceChildren(renderMarkdown(ta.value));
      preview.hidden = !previewing; ta.hidden = !previewing ? false : true; tools.hidden = previewing;
      write.disabled = !previewing; prev.disabled = previewing;
    };
    const write = html`<button type=button disabled onclick=${() => show(false)}>Write</button>`;
    const prev = html`<button type=button onclick=${() => show(true)}>Preview</button>`;
    // rows is the textarea's height in lines; the preview gets the same height (a line is about 1.4em)
    const height = (f.rows ?? 8) * 1.4 + 0.6 + "em";
    ta.style.resize = (f.rows ?? 8) > 3 ? "vertical" : "none"; preview.style.height = height;
    return html`<div class="md-field" style="grid-column:span 2">
      <style>
        .md-field .bar { display: flex; gap: 6px; justify-content: space-between; margin-bottom: 4px; font-family: var(--sans-serif); font-size: 0.8em; }
        .md-field .bar button { font-size: inherit; padding: 1px 8px; }
        .md-field .md-preview { border: 1px solid #ccc; padding: 4px 8px; overflow: auto; font-size: 0.9em; }
        .md-field .md-preview > :last-child { margin-bottom: 0; }
        .md-field .md-preview p, .md-field .md-preview ul, .md-field .md-preview ol, .md-field .md-preview blockquote { margin: 0 0 0.6em; }
        .md-field .md-preview blockquote { padding-left: 0.8em; border-left: 3px solid #ccc; color: #666; }
        .md-field .hint { color: #777; font-size: 0.75em; font-family: var(--sans-serif); }
      </style>
      <div class="bar"><span><b>${f.label}</b> <small style="color:#777">(${f.key}, Markdown)</small></span>${tools}<span>${write}${prev}</span></div>
      ${ta}${preview}
      <div class="hint">Markdown: **bold**, *italic*, [text](url), "- " bullets, "1. " numbered, "> " quote; a blank line starts a new paragraph.</div></div>`;
  }

  function itemsPanel() {
    const ro = !ad.canWrite, ed = st.editing, inputs = {};
    // Compact form: two columns of fields, each label to the left of its field in the sans-serif (Inter) face, which is
    // narrower than the serif body text; a long label wraps inside its label column instead of widening it.
    const form = html`<form class="item-form" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 20px">
      <style>
        .item-form label { display: grid; grid-template-columns: 9.5em minmax(0, 1fr); gap: 0 8px; align-items: center;
                           font-family: var(--sans-serif); font-size: 0.8em; line-height: 1.2; }
        .item-form label.tall { align-items: start; }
        .item-form label small { color: #777; font-size: 0.85em; overflow-wrap: anywhere; }
        .item-form input:not([type=checkbox]), .item-form textarea, .item-form select { font-family: inherit; font-size: inherit; }
        .item-form input[type=checkbox] { margin: 0; justify-self: start; }
      </style></form>`;
    for (const f of FIELDS) {
      const el = f.type === "markdown" ? html`<textarea rows=${f.rows ?? 8}></textarea>`
        : f.type === "textarea" ? html`<textarea rows=2></textarea>`
        : f.type === "select" ? html`<select>${f.options.map((o) => html`<option value=${o}>${o}</option>`)}</select>`
        : html`<input type=${f.type ?? "text"}>`;
      // A duration that only comes from the item's first slot is shown as a placeholder, not as a value,
      // so saving the form does not turn the default into a fixed value.
      const fromSlot = f.key === "duration" && ed.durationIsDefault && ed.duration === ed.durationDefault;
      const isBox = f.type === "checkbox";
      Object.assign(el, {required: !!f.required, disabled: ro});
      if (isBox) el.checked = !!ed[f.key]; else el.value = fromSlot ? "" : (ed[f.key] || f.default || "");
      if (f.pattern) { el.pattern = f.pattern; el.title = f.placeholder; }
      el.placeholder = fromSlot ? "default: " + ed.duration + " (length of first slot)" : (f.placeholder ?? "");
      if (!isBox) el.style.width = "100%";
      inputs[f.key] = el;
      if (f.type === "markdown") { form.append(markdownField(f, el, ro)); continue; }
      form.append(html`<label class=${f.type === "textarea" ? "tall" : ""} style="${f.type === "textarea" ? "grid-column:span 2" : ""}"><span>${f.label}${f.required ? " *" : ""} <small>(${f.key})</small></span>${el}</label>`);
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
    // One line per item: the table has fixed column widths and a cell too long for its column is cut off with an ellipsis
    // (hover to see it all), so the list is as wide as the form above and no row wraps.
    const cell = (text, extra) => html`<td title=${text} style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${extra ?? text}</td>`;
    const row = (it) => html`<tr>
      ${cell(it.title)}${cell(it.authorship)}
      ${cell(it.duration, html`${it.duration}${it.durationIsDefault ? html` <small style="color:#666">(first slot)</small>` : ""}`)}
      <td><input type=checkbox checked=${it.rotation} disabled title="Included in Rotation (change it with Edit)"></td>
      ${cell(it.screens)}
      <td style="white-space:nowrap"><button onclick=${() => { st.editing = it; st.msg = ""; render(); }}>Edit</button>
        <button disabled=${ro} onclick=${guard(async () => {
          if (confirm('Delete "' + it.title + '" and its slots?')) { await repo.deleteItem(it.id); await refresh(); }
        })}>Delete</button></td></tr>`;
    // Matches on title or authorship, so a specific item can be found (to edit or delete) without
    // scrolling a long list. Filtering updates just the table body, not the whole panel, so the
    // search box keeps focus and caret position while typing.
    const matching = (q) => st.data.items.filter((it) =>
      !q || it.title.toLowerCase().includes(q) || (it.authorship ?? "").toLowerCase().includes(q));
    const noMatch = () => html`<tr><td colspan=6 style="color:#666">No items match "${st.search}"</td></tr>`;
    const rowsFor = (q) => { const found = matching(q).map(row); return found.length ? found : [noMatch()]; };
    const tbody = html`<tbody>${rowsFor(st.search.trim().toLowerCase())}</tbody>`;
    const search = html`<input type=search placeholder="Find an item by title or authorship…" style="width:100%" value=${st.search}
      oninput=${() => { st.search = search.value; tbody.replaceChildren(...rowsFor(st.search.trim().toLowerCase())); }}>`;
    const list = html`<details style="margin-top:10px;margin-bottom:12px" open=${st.listOpen}><summary>Item list (${st.data.items.length})</summary>
      <div style="margin-top:6px">${search}</div>
      <style>
        .items-list th, .items-list td { padding: 2px 8px 2px 0; text-align: left; vertical-align: middle; }   /* same for headings and values, so they line up */
        .items-list input[type=checkbox] { margin: 0; }
      </style>
      <table class="items-list" style="width:100%;max-width:none;table-layout:fixed;margin-top:6px">
        <colgroup><col style="width:26%"><col style="width:20%"><col style="width:12%"><col style="width:6em"><col style="width:20%"><col style="width:11em"></colgroup>
        <thead><tr><th>Title</th><th>Authorship</th><th>Duration</th><th>Rotation</th><th>Screens</th><th></th></tr></thead>${tbody}</table></details>`;
    list.ontoggle = () => { st.listOpen = list.open; };
    return html`<section><h3>Items (${st.data.items.length})</h3>${form}${list}</section>`;
  }

  function rotationPanel() {
    const ro = !ad.canWrite, {items, slots, screens, screen} = st.data;
    const generated = slots.filter((s) => s.rotation);
    const slugs = Object.fromEntries(screens.map((s) => [s.slug, s.number]));
    const flagged = items.filter((i) => i.rotation && (!screen || onScreen(i.screens, screen.number, slugs)));
    const mins = (s) => (+s.end.slice(0, 2) * 60 + +s.end.slice(3)) - (+s.start.slice(0, 2) * 60 + +s.start.slice(3));
    const minutes = html`<input type=number min=5 step=5 value=${st.rotMinutes} style="width:5em">`;
    minutes.oninput = () => { st.rotMinutes = +minutes.value; };
    // One row per item in the generated rotation, with the length of its slots (the last slot of the day may be shorter).
    const inRotation = items.filter((i) => generated.some((s) => s.itemId === i.id))
      .map((i) => ({title: i.authorship ? i.title + " / " + i.authorship : i.title, len: Math.max(...generated.filter((s) => s.itemId === i.id).map(mins))}));
    const generate = guard(async () => {
      await repo.generateRotation(st.rotMinutes, screen?.id); await refresh();
    });
    const clear = guard(async () => { await repo.clearRotation(screen?.id); await refresh(); });
    const reset = guard(async () => {
      if (!confirm("Set \"Included in Rotation\" to false for ALL items? (An existing rotation's slots are not touched.)")) return;
      await repo.resetRotationFlags(); await refresh();
    });
    const rotList = inRotation.length
      ? html`<details style="margin-top:8px;margin-bottom:12px" open=${st.rotOpen}><summary>Rotation list (${inRotation.length} item${inRotation.length === 1 ? "" : "s"})</summary>
          <table style="width:100%"><tr><th align=left>Item in rotation (title / authorship)</th><th align=left>Slot duration</th></tr>${inRotation.map((r) => html`<tr><td>${r.title}</td><td>${r.len} min</td></tr>`)}</table></details>`
      : html`<p style="color:#666">No rotation is currently scheduled.</p>`;
    rotList.ontoggle = () => { st.rotOpen = rotList.open; };
    return html`<section><h3>Rotation${screenTitle()}</h3>
      <div>Slot duration ${minutes} minutes
        <button disabled=${ro} onclick=${generate}>Generate rotation</button>
        <button disabled=${ro} onclick=${clear}>Clear rotation</button>
        <button disabled=${ro} onclick=${reset}>Set all items' rotation to false</button></div>
      <p style="color:#666;margin:6px 0">Generate rotation fills every day with back-to-back slots cycling through the ${flagged.length} item${flagged.length === 1 ? "" : "s"} flagged Included in Rotation whose Screens text includes this screen (blank = every screen; the cycle restarts at midnight), replacing this screen's previous rotation. Manual slots are kept and take priority over the rotation while they apply; an item whose turn falls under a manual slot is skipped for that time. Clear rotation removes only this screen's generated slots; item flags are kept.</p>
      ${rotList}</section>`;
  }

  function schedulePanel() {
    const ro = !ad.canWrite, {items, slots, screen} = st.data, sf = st.slot;
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
      await repo.addSlot({screenId: screen?.id, itemId: item.value, days: ds, start: start.value, end: end.value, weeks: +weeks.value, from: from.value});
      await refresh();
    });
    const rows = slots.filter((s) => !s.rotation).sort((a, b) => a.start.localeCompare(b.start)).map((s) => html`<tr>
      <td>${s.start}–${s.end ?? "?"}</td><td>${items.find((i) => i.id === s.itemId)?.title}</td>
      <td>${s.days.map((d) => DAYS[d]).join(" ")}</td>
      <td>${s.weeks ? s.weeks + " wk from " : "every week from "}${s.from}</td>
      <td><button disabled=${ro} onclick=${guard(async () => { await repo.deleteSlot(s.id); await refresh(); })}>Remove</button></td></tr>`);
    const slotList = html`<details style="margin-top:8px;margin-bottom:12px" open=${st.slotsOpen}><summary>Manual slots (${rows.length})</summary>
      <table style="width:100%;margin-top:4px"><tr><th align=left>Time</th><th align=left>Item</th><th align=left>Days</th><th align=left>Span</th><th></th></tr>${rows}</table></details>`;
    slotList.ontoggle = () => { st.slotsOpen = slotList.open; };
    return html`<section><h3>Schedule${screenTitle()} (manual slots; a generated rotation is summarized above)</h3>
      <div>${item} from ${start} until ${end} on ${days}</div>
      <div>Repeat for ${weeks} weeks (0 = indefinitely), starting week of ${from} <button disabled=${ro} onclick=${add}>Add slot</button></div>
      <p style="color:#666;margin:6px 0">An item can have any number of slots. Times not covered by any slot are unscheduled: Screen and Titles show "Nothing scheduled". Slots may touch (10:00 end, 10:00 start) but not overlap each other on the same screen (screens are independent); a manual slot may sit on top of a generated rotation and overrides it. An item with no Duration of its own uses the length of its first slot.</p>
      ${slotList}</section>`;
  }

  // Show now: one item that Screen and Titles show immediately, over every slot, until it is cleared.
  // Slots and the rotation are left alone and take over again once it is cleared.
  function pinPanel() {
    const ro = !ad.canWrite, {items, screen} = st.data;
    const pinned = items.find((i) => i.id === st.data.pinnedItemId);
    const item = html`<select>${items.map((i) => html`<option value=${i.id} selected=${i.id === (pinned?.id ?? st.pinChoice)}>${i.title}</option>`)}</select>`;
    item.onchange = () => { st.pinChoice = item.value; };
    const show = guard(async () => {
      if (!item.value) throw new Error("Add an item first");
      await repo.pinItem(screen?.id, item.value); await refresh();
    });
    const clear = guard(async () => { await repo.unpinItem(screen?.id); await refresh(); });
    // Reset to schedule: clears this screen's pin in the database (not just the one this page last loaded, which may be stale if
    // Show now was set from another tab or session) and forgets the dropdown's remembered choice, then reloads.
    // Always enabled, so it can be pressed even when this page does not think anything is pinned.
    const reset = guard(async () => { await repo.unpinItem(screen?.id); st.pinChoice = undefined; await refresh(); });
    // Previous / Next: Show now for the neighbouring item in the rotation's cycle, starting from what is showing now.
    const step = (dir) => guard(async () => {
      const id = stepRotation(st.data, dir);
      if (!id) throw new Error("There is no generated rotation to step through");
      await repo.pinItem(screen?.id, id); await refresh();
    });
    return html`<section><h3>Show now${screenTitle()}</h3>
      <div>${item} <button disabled=${ro} onclick=${show}>Show now</button>
        <button disabled=${ro || !pinned} onclick=${clear}>Stop showing</button></div>
      <div style="margin-top:6px"><button disabled=${ro} onclick=${step(-1)}>&larr; Previous</button>
        <button disabled=${ro} onclick=${step(1)}>Next &rarr;</button>
        <button disabled=${ro} onclick=${reset}>Reset to schedule</button></div>
      <p style="color:#666;margin:6px 0">Previous and Next do a Show now for the item before or after the one showing, going around the generated rotation's cycle (an item not in the rotation steps to its first or last item). Reset to schedule clears any Show now setting, however it was made (even one this page has not loaded yet), and forgets the dropdown's choice; the rotation and slots were never changed and take over again.</p>
      <p style="color:#666;margin:6px 0">The chosen item is shown on Screen and Titles right away and stays until you press Stop showing, taking priority over manual slots and the rotation, which are not changed and resume afterwards. Choosing another item replaces it.</p>
      ${pinned
        ? html`<p>Now showing: <b>${pinned.title}</b></p>`
        : html`<p style="color:#666">No item is being shown this way.</p>`}</section>`;
  }

  return refresh();
}
