# DxD Jukebox ("DJ")

Two web pages driven by one schedule, plus an admin page that manages both.

- **Screen** shows web content, made to be embedded elsewhere.
- **Titles** shows the full didactic metadata for exactly what the Screen is showing right now.
- **Admin** manages the item database and the schedule.

It is built with [Observable Notebook Kit](https://observablehq.com/notebook-kit/) as a static site. The data lives in Supabase (hosted Postgres), because a static site has no server of its own.

*Last updated 4 Oct 2026 (admin item search added).*

## Layout

```
dxd-jukebox/
├─ README.md
└─ nbks/
   ├─ index.html     near-empty notebook with links to the others
   ├─ screen.html    Screen page
   ├─ titles.html    Titles page
   ├─ admin.html     Admin page
   ├─ config.js      Supabase URL + anon key; creates `repo`
   ├─ lib.js         fields, validation, scheduling logic
   ├─ repo.js        storage adapters (Supabase, local) + createRepo
   ├─ admin.js       the Admin page UI
   └─ schema.sql     Supabase tables and security policies
```

The three pages never touch the database directly. They talk to `repo` (`load`, `saveItem`, `deleteItem`, `addSlot`, `deleteSlot`), so the backend can be swapped without changing them.

## Setup

1. Create a Supabase project and run `nbks/schema.sql` in its SQL Editor.
2. Under Authentication, create one admin user and turn off public sign-ups.
3. Put the project URL and the public anon key in `nbks/config.js`.
4. Build the site with Notebook Kit (with `nbks` as the notebook folder) and deploy the output.

With `config.js` left blank, the pages use the browser's `localStorage`, which is handy for trying everything locally. Data stored that way is per browser and is not shared between devices.

Security comes from row-level security in `schema.sql`: anyone can read, and only a signed-in admin can write. The anon key is meant to be public. Do not link to the Admin page from public pages if you want it kept quiet, though that is only a courtesy, not protection.

## Items

| Field | Required? | Notes |
|---|---|---|
| Title | yes | |
| Authorship | no | |
| URL | yes | the page the Screen displays |
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
| Course | no | |
| Mentor | no | |
| License | no | |
| Credits | no | |

Only Title, URL and Year created are required.

On the Admin page, the items table has a search box above it to find a specific item to edit or delete, matching against title or authorship (case-insensitive, substring match). Clicking **Edit** loads that item into the form above; clicking **Delete** removes it and its slots after confirmation.

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
- Screen and Titles poll every 20 seconds and redraw only when the current item changes, so the embedded page is not reloaded on every poll.

## Known limits and open questions

- **Time zone:** slots use the viewer's local time. If viewers can be in different zones, pick one fixed zone for the venue.
- **Framing:** some sites refuse to be shown in an iframe (`X-Frame-Options` or CSP). The Screen then shows a blank frame. Consider checking such URLs when saving.
- **Overlap check** runs in the browser, not the database. Two admins adding slots at the same instant could both pass. With one admin this does not matter.
- **"First slot"** is by start date and time of day, not by the order slots were added. An item with slots of different lengths gets only the first one's length as its default.
- Years are not cross-checked (a published year earlier than the created year is accepted), and an explicit duration is not checked against slot lengths.
- Slots can be added and removed but not yet edited in place.
- Screen and Titles can differ by up to one poll interval.

## Development notes

The logic in `lib.js`, `repo.js` and `admin.js` was developed and tested in an Observable notebook with the local adapter. It has not been tested against a live Supabase project or built inside Notebook Kit. On first run, check that:

- the pages load and local imports (`./config.js`, `./lib.js`, …) resolve;
- a signed-out visitor can read but not write in Supabase;
- an item scheduled for the current weekday and time appears on both Screen and Titles.