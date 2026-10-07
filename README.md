# DxD Jukebox ("DxDJ")

Two synchronized web pages driven by one schedule, plus an admin page that manages both.

- **Screen** shows web content, made to be embedded elsewhere. A URL ending in a video file extension (`.mp4`, `.m4v`, `.webm`, `.mov`, `.ogv`) is played in a muted, looping, letterboxed (never cropped) `<video>`; anything else goes in an iframe.
- **Titles** shows the full didactic metadata for exactly what the Screen is currently showing.
- **Admin** manages the item database, the schedule and the rotation.

Titles is also the site's default/landing page: its file is `nbks/index.html` (there is no separate `titles.html` — the file was moved/renamed there), so visiting the site's root URL shows Titles directly, with no redirect involved.

It is built with [Observable Notebook Kit](https://observablehq.com/notebook-kit/) as a static site. The data lives in Supabase (hosted Postgres), because a static site has no server of its own.

*Version 1.0.2. Last updated 7 Oct 2026.*

## Layout

```
dxdjukebox/
├─ README.md
└─ nbks/
   ├─ index.html     Titles page (also the site's default/landing page, see above)
   ├─ screen.html    Screen page
   ├─ admin.html     Admin page
   ├─ config.js      Supabase URL + anon key; creates `repo`
   ├─ lib.js         fields, validation, scheduling logic
   ├─ repo.js        storage adapters (Supabase, local) + createRepo
   ├─ admin.js       the Admin page UI
   └─ schema.sql     Supabase tables and security policies
```

The three pages never touch the database directly. They talk to `repo` (`load`, `saveItem`, `deleteItem`, `addSlot`, `deleteSlot`, `generateRotation`, `clearRotation`, `resetRotationFlags`), so the backend can be swapped without changing them.

## Setup

1. Create a Supabase project and run `nbks/schema.sql` in its SQL Editor.
2. Under Authentication, create one admin user and turn off public sign-ups.
3. Put the project URL and the public anon key in `nbks/config.js`.
4. Build the site with Notebook Kit (with `nbks` as the notebook folder) and deploy the output. The Notebook Kit version is pinned in `package.json` (2.6.6); change it deliberately, since the kit is pre-1.0 and changes quickly.

**Upgrading an existing Supabase project** (one created before 1.0.1): run this once in the SQL Editor. If the API still reports a missing column, run `notify pgrst, 'reload schema';`.

```sql
alter table jukebox_items
  add column if not exists rotation boolean not null default false,
  add column if not exists hide_url boolean not null default false,
  add column if not exists further_info_url text,
  add column if not exists pinned boolean not null default false;
alter table jukebox_slots
  add column if not exists rotation boolean not null default false;
```

With `config.js` left blank, the pages use the browser's `localStorage`, which is handy for trying everything locally. Data stored that way is per browser and is not shared between devices.

Security comes from row-level security in `schema.sql`: anyone can read, and only a signed-in admin can write. The anon key is meant to be public. Do not link to the Admin page from public pages if you want it kept quiet, though that is only a courtesy, not protection.

## Items

| Field | Required? | Notes |
|---|---|---|
| Title | yes | |
| Authorship | no | |
| URL | yes | the page or video file the Screen displays |
| Hide URL | no | checkbox (default off); when ticked, Titles does not show the URL |
| Year created | yes | four digits, e.g. `2024` |
| Month/Day created | no | `M/D`, e.g. `3/14` |
| Year published | no | four digits; defaults to the current year when saved |
| Month/Day published | no | `M/D` |
| Where created | no | |
| Publisher | no | |
| Constituent media | no | |
| Delivery medium | no | |
| Duration | no | `M:SS` or `H:MM:SS`; defaults to the length of the item's first slot |
| Notes | no | |
| Further info URL | no | an optional link, shown on Titles as a link if its row exists in the Titles page |
| Course | no | |
| Mentor | no | |
| License | no | |
| Credits | no | |
| Included in Rotation | no | checkbox (default off, key `rotation`); items ticked here are cycled by **Generate rotation** |

Only Title, URL and Year created are required.

On the Admin page, each form label shows the field's key in parentheses (these keys are the ids Titles uses, below). The items table has a search box above it to find a specific item to edit or delete, matching against title or authorship (case-insensitive, substring match). Clicking **Edit** loads that item into the form above; clicking **Delete** removes it and its slots after confirmation.

- **Years** are four digits (1000–9999). **Month/Day** is written `M/D`. A leading zero is accepted (`03/14`) and stored as `3/14`. The day must exist in that month. `2/29` is allowed because the year may be unknown.
- **Year published default:** if left blank, the current year is filled in when the item is saved and stored, so an item saved in 2026 stays 2026 in later years.
- **Duration format:** colon separated, with no leading zero on the first number (`3:45`, `90:00`, `1:02:30`, not `03:45`). Numbers after a colon are two digits and below 60 (`3:05`, not `3:5`).
- **Duration default:** when an item has no duration of its own, it uses the length of its first slot (end minus start): 9:00–10:00 is `1:00:00`, 9:00–9:30 is `30:00`. The first slot is the one with the earliest start date, then the earliest time of day. The default is worked out whenever data is loaded and is not stored, so it follows the schedule. Type a duration and yours wins. Empty the box and it goes back to following the slot.

## Scheduling

- An item has any number of **slots**. A slot belongs to exactly one item. Deleting an item deletes its slots.
- A slot is: item, weekdays, start time, end time, a number of weeks (0 = indefinitely) and a start date (the span counts weeks from the week containing that date).
- Times are in 5-minute steps. A slot covers `[start, end)`, the end must be later than the start, and `24:00` is allowed as an end.
- **Slots may not overlap**, but unscheduled time is allowed. Two slots conflict only if they share a time of day **and** there is a real calendar date on which both apply (weekdays, start date and number of weeks are all considered). Back-to-back slots (one ends at 10:00, the next starts at 10:00) are fine.
- Times outside every slot are unscheduled: Screen and Titles show "Nothing scheduled right now."
## Rotation

The **Rotation** section of the Admin page fills the schedule automatically from the items ticked "Included in Rotation".

- **Slot duration** (default 10 minutes; whole minutes in multiples of 5).
- **Generate rotation** removes the previous rotation and creates back-to-back slots for every day, 00:00 to 24:00, repeating weekly with no end date from today. They cycle through the flagged items in title order, and the cycle restarts at midnight. If the duration does not divide the day evenly, the last slot of the day is shorter. It needs at least one flagged item.
- **Clear rotation** removes only the generated slots. The items' flags are left alone.
- **Set all items' rotation to false** un-ticks every item (after confirmation) without touching any slots.
- The section lists the items in the generated rotation with their slot length, not the slots themselves. The Schedule section lists manual slots only.
- **Manual slots win.** Where a manual slot and a rotation slot cover the same time, the manual slot is shown, and when the manual slot ends (or its weeks run out) the rotation resumes. Manual slots may be added over a running rotation. The rotation does not shift around them: an item whose turn is covered by a manual slot is simply skipped for that time.
- Generated slots are marked with `rotation = true` in `jukebox_slots`.

- Screen and Titles poll every 20 seconds and redraw only when the current item changes, so the embedded page is not reloaded on every poll.

## Show now

The **Show now** section at the bottom of the Admin page picks one item to appear on Screen and Titles immediately and keep appearing until **Stop showing** is pressed. It beats every slot, manual or generated, the same way a manual slot beats the rotation. Nothing is added to or removed from the schedule, so the slots and the rotation resume as they were once it is cleared. At most one item is pinned; choosing another replaces it. The pin is the `pinned` column on `jukebox_items`, and deleting the pinned item clears it.

## Customizing the Titles page

Cell 2 of `nbks/index.html` decides which fields appear and what they are called. For each field in `FIELDS`, the page looks for `<dd id="{key}Value">` (and optionally `<dt id="{key}">` holding the label). A field is shown only if its `dd` exists and the item has a value; its `dt` and `dd` are hidden otherwise. Delete a pair to leave a field out, reorder pairs freely, and write labels (and `<br>` breaks) in the markup. `url` and `furtherInfoURL` are rendered as links, and `url` is hidden when the item has Hide URL ticked. The title goes in `#heading`. The label column width is the `--label-col` variable, and the heading is aligned to the value column. Below 480px wide the labels stack above their values.

The link in the lower-right corner of Titles goes to Screen. While a slot is showing it reads "Showing on screen at {time left}/{slot length}" and counts down each second (the poll supplies the slot's end; the page does the counting). For a pinned item it reads "Showing on screen until further notice", and when nothing is scheduled it just says "Screen".

## Known limits and open questions

- **Time zone:** slots use the viewer's local time. If viewers can be in different zones, pick one fixed zone for the venue.
- **Framing:** some sites refuse to be shown in an iframe (`X-Frame-Options` or CSP). The Screen then shows a blank frame. Consider checking such URLs when saving.
- **Overlap check** runs in the browser, not the database. Two admins adding slots at the same instant could both pass. With one admin this does not matter.
- **"First slot"** is by start date and time of day, not by the order slots were added. An item with slots of different lengths gets only the first one's length as its default.
- Years are not cross-checked (a published year earlier than the created year is accepted), and an explicit duration is not checked against slot lengths.
- Slots can be added and removed but not yet edited in place.
- **Video:** playback is muted (browsers block unmuted autoplay) and the file's host must allow direct linking; a file that cannot be played shows a message on Screen.
- **Rotation:** Generate removes the old rotation before inserting the new one, so a failed insert leaves no rotation (run Generate again). Items flagged after a rotation was generated are not included until you generate again.
- Screen and Titles can differ by up to one poll interval.

## Development notes

The logic in `lib.js`, `repo.js` and `admin.js` was developed and tested in an Observable notebook with the local adapter. It has not been tested against a live Supabase project or built inside Notebook Kit. On first run, check that:

- the pages load and local imports (`./config.js`, `./lib.js`, …) resolve;
- a signed-out visitor can read but not write in Supabase;
- an item scheduled for the current weekday and time appears on both Screen and Titles.