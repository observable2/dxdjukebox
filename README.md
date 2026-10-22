# DxD Jukebox ("DxDJ")

Two synchronized web pages driven by one schedule, plus an admin page that manages both.

- **Screen** shows web content, made to be embedded elsewhere. A URL ending in a video file extension (`.mp4`, `.m4v`, `.webm`, `.mov`, `.ogv`), or in a bare format folder such as Brown Digital Repository's `.../MP4/`, is played in a looping, letterboxed (never cropped) `<video>` without controls; anything else goes in an iframe. On desktop the video tries to play with sound; on mobile it is muted (see Known limits).
- **Titles** shows the full didactic metadata for exactly what the Screen is currently showing.
- **Admin** manages the item database, the schedule and the rotation.

Titles is also the site's default/landing page: its file is `nbks/index.html` (there is no separate `titles.html` — the file was moved/renamed there), so visiting the site's root URL shows Titles directly, with no redirect involved.

It is built with [Observable Notebook Kit](https://observablehq.com/notebook-kit/) as a static site. The data lives in Supabase (hosted Postgres), because a static site has no server of its own.

*Version 1.0.4. Last updated 8 Oct 2026.*

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

The three pages never touch the database directly. They talk to `repo` (`load`, `saveItem`, `deleteItem`, `saveScreen`, `deleteScreen`, `addSlot`, `deleteSlot`, `generateRotation`, `clearRotation`, `resetRotationFlags`, `pinItem`, `unpinItem`), so the backend can be swapped without changing them.

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
| Where created | no | |
| Publisher | no | |
| Constituent media | no | |
| Delivery medium | no | |
| Duration | no | `M:SS` or `H:MM:SS`; defaults to the length of the item's first slot |
| Duration type | no | dropdown (key `durationType`): `work`, `loop`, `ambient` or `ambient loop`; defaults to `work` |
| Notes | no | |
| Date related notes | no | free form (key `dateRelatedNotes`) |
| Further info URL | no | an optional link, shown on Titles as a link if its row exists in the Titles page |
| Course | no | |
| Mentor | no | |
| License | no | |
| Credits | no | |
| Included in Rotation | no | checkbox (default off, key `rotation`); items ticked here are cycled by **Generate rotation** |
| Screens | no | key `screens`; which screens a rotation may use this item on: screen numbers, ranges and slugs separated by commas, e.g. `2, 7-10, lobby`. `all` means every screen and blank (the default) means none. Only the rotation looks at it; manual slots and Show now can use any item on any screen |

Only Title, URL and Year created are required.

On the Admin page, each form label shows the field's key in parentheses (these keys are the ids Titles uses, below). The items table has a search box above it to find a specific item to edit or delete, matching against title or authorship (case-insensitive, substring match). Clicking **Edit** loads that item into the form above; clicking **Delete** removes it and its slots after confirmation.

- **Years** are four digits (1000–9999). **Month/Day** is written `M/D`. A leading zero is accepted (`03/14`) and stored as `3/14`. The day must exist in that month. `2/29` is allowed because the year may be unknown.
- **Duration format:** colon separated, with no leading zero on the first number (`3:45`, `90:00`, `1:02:30`, not `03:45`). Numbers after a colon are two digits and below 60 (`3:05`, not `3:5`).
- **Duration default:** when an item has no duration of its own, it uses the length of its first slot (end minus start): 9:00–10:00 is `1:00:00`, 9:00–9:30 is `30:00`. The first slot is the one with the earliest start date, then the earliest time of day. The default is worked out whenever data is loaded and is not stored, so it follows the schedule. Type a duration and yours wins. Empty the box and it goes back to following the slot.

## Scheduling

- An item has any number of **slots**. A slot belongs to exactly one item and exactly one screen. Deleting an item deletes its slots.
- A slot is: item, weekdays, start time, end time, a number of weeks (0 = indefinitely) and a start date (the span counts weeks from the week containing that date).
- Times are in 5-minute steps. A slot covers `[start, end)`, the end must be later than the start, and `24:00` is allowed as an end.
- **Slots may not overlap on the same screen** (screens are independent), but unscheduled time is allowed. Two slots conflict only if they share a time of day **and** there is a real calendar date on which both apply (weekdays, start date and number of weeks are all considered). Back-to-back slots (one ends at 10:00, the next starts at 10:00) are fine.
- Times outside every slot are unscheduled: Screen and Titles show "Nothing scheduled right now."
## Screens

One installation can run any number of screens, each with its own schedule, rotation and Show now. **Items are shared**: add an item once and use it on any screen.

- A screen has a **number** (1, 2, 3, ...) and a **slug** (lowercase letters, digits and hyphens, starting with a letter, e.g. `lobby`), each unique, and an optional name. The first screen is `1` / `main`.
- A page names its screen with `?s=` in its URL: `/screen?s=2`, `/screen?s=lobby`, `/?s=lobby` (Titles). With no `?s=` the lowest-numbered screen is shown, so existing embeds keep working. The Screen link on Titles goes to the same screen.
- On the Admin page, the **Screen** section at the top picks which screen the Rotation, Schedule and Show now sections work on, and shows the Screen and Titles URLs for it. **Manage screens** adds, renames and deletes screens, and sets each screen's **Titles link on Screen** checkbox (default on): whether the Screen page shows its small link to the Titles page for that screen. Deleting a screen deletes its slots (items are kept); the last screen cannot be deleted.
- An item's **Screens** text (see Items) uses numbers, ranges and slugs: `2, 7-10, lobby` means screens 2, 7, 8, 9, 10 and `lobby`. A number or range may name screens that do not exist yet. A slug must exist when the item is saved; if the screen is later deleted or renamed, the slug is simply ignored by the rotation.

## Rotation

The **Rotation** section of the Admin page fills the chosen screen's schedule automatically from the items ticked "Included in Rotation" whose Screens text includes that screen (or is `all`).

- **Slot duration** (default 10 minutes; whole minutes in multiples of 5).
- **Generate rotation** removes the chosen screen's previous rotation (other screens' are untouched) and creates back-to-back slots for every day, 00:00 to 24:00, repeating weekly with no end date from today. They cycle through the flagged items in title order, and the cycle restarts at midnight. If the duration does not divide the day evenly, the last slot of the day is shorter. It needs at least one flagged item.
- **Clear rotation** removes only the chosen screen's generated slots. The items' flags are left alone.
- **Set all items' rotation to false** un-ticks every item (after confirmation) without touching any slots.
- The section lists the items in the generated rotation with their slot length, not the slots themselves. The Schedule section lists manual slots only.
- **Manual slots win.** Where a manual slot and a rotation slot cover the same time, the manual slot is shown, and when the manual slot ends (or its weeks run out) the rotation resumes. Manual slots may be added over a running rotation. The rotation does not shift around them: an item whose turn is covered by a manual slot is simply skipped for that time.
- Generated slots are marked with `rotation = true` in `jukebox_slots`.

- Screen and Titles poll every 20 seconds and redraw only when the current item changes, so the embedded page is not reloaded on every poll.

## Show now

The **Show now** section at the bottom of the Admin page picks one item to appear on the chosen screen's Screen and Titles immediately and keep appearing until **Stop showing** is pressed. It beats every slot, manual or generated, the same way a manual slot beats the rotation. Nothing is added to or removed from the schedule, so the slots and the rotation resume as they were once it is cleared. At most one item is pinned per screen; choosing another replaces it. **Previous** and **Next** buttons do a Show now for the item before or after the one showing, going around the generated rotation's cycle (the rotation's items in the order they appear through the day, wrapping at the ends); **Reset to schedule** clears the pin, same as Stop showing. They change nothing in the schedule. The pin is the `pinned_item_id` column on `jukebox_screens`, and deleting the pinned item clears it.

### Public controls for screen 2 ("studio")

On Titles for screen 2 (`/?s=studio`) three small buttons at the bottom left, **←**, **→** and **schedule**, let any visitor, signed in or not, step through the rotation. The **←** and **→** arrow keys and **Esc** do the same. ← and → do a Show now for the previous or next item in the rotation, as the Admin page's Previous and Next do, and **schedule** (Esc) clears the pin so the schedule takes over. Other screens do not show them.

- Writes normally need the admin sign-in, so these call a database function, `studio_pin(p_item uuid)` (defined in `schema.sql`; an existing database needs that block run once in the Supabase SQL editor). It runs with its owner's rights, is callable by `anon`, and can only pin an item that is in screen 2's *generated rotation*, or clear the pin. Nothing else on any screen can be changed through it. It is wired to screen number 2; change the number in the function to move it. In the browser it is `repo.studioPin(itemId)`.
- It needs a generated rotation for screen 2 (Admin > Rotation), or it says "No generated rotation to step through".
- **Not done yet: auto-expiry.** A pin set this way stays until someone presses **schedule** (or an admin uses Stop showing / Reset to schedule), so a visitor who walks away leaves the screen on their choice. A "pinned until" time on `jukebox_screens`, honoured by `pickCurrent`, would let the schedule resume by itself after, say, ten minutes.
- Anyone who has the page's public key can call the function directly, so a hostile visitor could keep stepping the studio rotation. It cannot do anything else.

## Customizing the Titles page

Cell 2 of `nbks/index.html` decides which fields appear and what they are called. For each field in `FIELDS`, the page looks for `<dd id="{key}Value">` (and optionally `<dt id="{key}">` holding the label). A field is shown only if its `dd` exists and the item has a value; its `dt` and `dd` are hidden otherwise. Delete a pair to leave a field out, reorder pairs freely, and write labels (and `<br>` breaks) in the markup. `url` and `furtherInfoURL` are rendered as links, and `url` is hidden when the item has Hide URL ticked. The title goes in `#heading`. The label column width is the `--label-col` variable, and the heading is aligned to the value column. Below 480px wide the labels stack above their values.

The link in the lower-right corner of Titles goes to Screen. While a slot is showing it reads "Showing on screen for {time elapsed} of {slot length}" and counts up from 0 each second (the poll supplies the slot's end; the page does the counting). For a pinned item it reads "Showing on screen until further notice", and when nothing is scheduled it just says "Screen".

**Upgrading a project made before screens:** the Supabase tables need a new `jukebox_screens` table, a `screen_id` on slots and a `screens` column on items, and the old `pinned` column on items goes away. The commented migration block at the end of `nbks/schema.sql` does all of it in one run (existing slots go to a new screen 1, `main`).

## Known limits and open questions

- **Time zone:** slots use the viewer's local time. If viewers can be in different zones, pick one fixed zone for the venue.
- **Framing:** some sites refuse to be shown in an iframe (`X-Frame-Options` or CSP). The Screen then shows a blank frame. Consider checking such URLs when saving.
- **Overlap check** runs in the browser, not the database. Two admins adding slots at the same instant could both pass. With one admin this does not matter.
- **"First slot"** is by start date and time of day, not by the order slots were added. An item with slots of different lengths gets only the first one's length as its default.
- Years are not cross-checked, and an explicit duration is not checked against slot lengths.
- Slots can be added and removed but not yet edited in place.
- **Video:** desktop browsers try unmuted autoplay first, but block it until the viewer has interacted with the page (or the embedding site, or the site is allowed sound). Until then the video plays muted and gets its sound at the first click or key press. An unattended display needs the browser's autoplay policy relaxed (Chrome: `--autoplay-policy=no-user-gesture-required`), and a page embedding the Screen in an iframe needs `allow="autoplay"` on that iframe. Mobile always plays muted. The file's host must allow direct linking; a file that cannot be played shows a message on Screen.
- **Rotation:** Generate removes the old rotation before inserting the new one, so a failed insert leaves no rotation (run Generate again). Items flagged after a rotation was generated are not included until you generate again.
- Screen and Titles can differ by up to one poll interval.

## Development notes

The logic in `lib.js`, `repo.js` and `admin.js` was developed and tested in an Observable notebook with the local adapter. It has not been tested against a live Supabase project or built inside Notebook Kit. On first run, check that:

- the pages load and local imports (`./config.js`, `./lib.js`, …) resolve;
- a signed-out visitor can read but not write in Supabase;
- an item scheduled for the current weekday and time appears on both Screen and Titles.