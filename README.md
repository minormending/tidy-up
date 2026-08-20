# Tidy Up

A wordless tidy-up helper for a five-year-old who cannot read yet.

One job at a time, one picture, one timer, one big button. No text appears
anywhere on the child's side of the app.

**Live:** https://minormending.github.io/tidy-up/

---

## What it does

**Pick.** A grid of pictures, one per job. Tapping a picture runs that job —
including one already done, which can be done again. The green button runs
everything still left today, and steps aside once nothing is left; "Let them do
today again" in the panel starts the whole round over.

**One job.** A single large picture, a ring that visibly drains, and one
enormous check button. Nothing else on screen is tappable. Tapping the
picture replays the recorded instruction.

**Done.** A star and one short sound, and then the app settles into a quiet
record of the day: a filled star for each job, and every job's picture with the
number of times it was done. Nothing on that screen responds to a tap, and
waking it takes a deliberate long press — so there is nothing left to play with
once the tidying is finished, but the day is still shown rather than the screen
going blank.

## Why it is built this way

Every constraint below came out of standard behavioural parent training
(Kazdin's parent management training, Incredible Years, PCIT). They are worth
keeping when the temptation arrives to make this more fun.

- **Icons come from [Phosphor](https://github.com/phosphor-icons/core)**, fill
  weight, MIT licensed and vendored into `js/icons.js` so the app keeps working
  offline. Only the 70 shapes actually used are included; the licence is in
  `vendor/`. Each job's icon is tinted to its own colour, because with
  single-colour icons the colour is doing as much work as the shape in telling
  one tile from another.
- **The picture is a photo of the real bin.** "Clean your room" is an abstract
  category a five-year-old cannot execute. "Put the blocks in the blue bin" is
  a task. A photo of *their own* bin removes the last abstraction step. The four
  built-in pictures are placeholders — replace them.
- **Instructions are audio, in your own voice.** A pre-reader cannot use text,
  and your recorded voice beats text-to-speech for a child this age.
- **Progress is dots, not numerals.** They cannot read "3 / 4".
- **Stars are earned and never removed.** Response cost — taking points away —
  reliably backfires at this age and turns tidying into a power struggle.
- **The star is for finishing, not for beating the clock.** Requiring a perfect
  result extinguishes the behaviour. Most of the blocks away earns the star;
  you tighten the standard over weeks.
- **Running out of time is not a failure.** One soft tone, and the button still
  works. No alarm, no red screen, no lost star.
- **A job can be done as many times as it needs doing.** Blocks come out
  again. The tile shows a tick the first time and then a count, so the day's
  record is honest about what actually happened, and every run earns its star.
  The big finish is kept for clearing the whole list, so it does not fire again
  on every repeat.
- **The app is deliberately boring.** No characters, no levels, no unlockables,
  no sound worth replaying. If the app is more interesting than the task, it
  converts tidy-up time into screen time — the main way a thing like this
  fails.
- **There is an exit.** Four support levels, steppable down to "every job on
  one screen, one button", and then to not opening the app at all. A reward
  system with no fading plan becomes permanent scaffolding.

### The part the app cannot do

The star is not what changes behaviour — you are. The app holds the task
breakdown and the timer, which are the parts a five-year-old genuinely cannot
hold. The reinforcement that actually works is labelled praise while it is
happening: "you put *every single block* in the bin", not "good job". If the
app becomes a substitute for that rather than a scaffold for it, expect about
two good weeks.

## Setting it up

There is a round button in the **top-right corner of the screen**. Press and
hold it for about 1.6 seconds and the grown-up panel opens; a ring fills around
it while you hold, so you can tell it is working. A plain tap does nothing,
which is what keeps a five-year-old out — the button is visible, the hold is
the lock. It hides itself during a job, and the panel says how to get back in.
There you can:

- name each job, pick its icon and colour (the picker has a search box — try
  "bin", "ball", "bag", "pet"), photograph the real bin or shelf, and record the
  instruction
- set the timer per job — from what they can actually sustain, not from what
  sounds reasonable to an adult
- choose the support level, and see whether the recent runs justify stepping
  it down
- see the week's stars and the run log

Add it to the home screen and it opens portrait, full screen, with no address
bar to wander out of.

The layout follows the screen it is on: the pictures pick a column count that
keeps them closest to square in the space available, and on a short landscape
screen the job screen stands up in two columns so the big button stays on
screen. Checked from a 320px phone up to a 1280px laptop, in both orientations.

## Backing it up, and moving it

Both live under **Backup and moving** in the grown-up panel.

**Backup file.** Saves everything — jobs, photos, voice clips, stars — as a
single JSON file. This is the real backup: keep one somewhere safe, because
clearing the browser's site data erases the setup and there is no copy
anywhere else.

**Setup code.** A QR of the job list only — names, timers, support level.
Point the other device's camera at it and the app opens already configured;
the photos then get taken on that device. Jobs keep their id, so scanning the
same code again on a device that already has photos keeps them.

Photos and recordings deliberately are not in the code, and no amount of
compression would change that: a QR code holds about 2.9KB and one 720px photo
is fifty times that. Use a backup file to move media.

**Two devices at once.** The setup code and a backup file each move things once,
deliberately, every time you use them. Live sharing keeps two devices in step as you go:
a job finished on the tablet shows as done on your phone a moment later. Turn it
on in the grown-up panel, read the code off one device, type it into the other.

Only the day's progress travels — stars, today's per-job counts, the week
archive, and the run log. Three things deliberately do not:

| Left out | Why |
|---|---|
| Photos and voice clips | They never leave the device they were made on. A photo of your child's room and a recording of your own voice are not going near a shared database, and one photo is fifty times what a room can hold anyway. |
| The job list | It already has a way to travel — the setup code, which keeps whatever photos and recordings the receiving device already has. Live-syncing the list as well would fight that and could break a device's media associations for no gain. |
| Chime on/off | One tablet is usually the muted one. |

So the setup code configures a device and live sharing keeps the day in step.

Merging never lowers anything, which is the same promise the rest of the app
makes: a star is never taken away, and a job's count only ever goes up. The two
grown-up clears are the exceptions and they work by bumping a counter that beats
a merge — otherwise the other device's higher numbers would merge straight back
and undo the clear. Clearing today and clearing the week are independent, so
one does not touch the other. Joining a device to an existing code is never
destructive, however many times that code has been cleared.

The `sync/` folder is vendored rather than written here: its canonical copy is
[minormending/kidsync](https://github.com/minormending/kidsync), shared with the other games. Edit it there and run
`kidsync/tools/install`, which also reminds you to bump `CACHE` in `sw.js`;
`kidsync/tools/check` fails if a copy has drifted. What belongs to *this* app is
`js/sync-state.js` — the merge rules — and the card in the panel.

If sharing cannot start — no network, blocked domain, missing config — it is one
line in the console and an app that behaves exactly as it did before. Tidy Up is
a local app that can sync, not a sync app.

## Privacy

Photos and voice recordings never leave the device. They live in the browser's
IndexedDB; the task list and stars live in `localStorage`. There is no backend
you run and no analytics, and nothing personal is in this repository.

Live sharing is the one thing here that touches the network, and it is off until
you turn it on. Even then it carries only the numbers listed above — never a
photo, a recording, or a job name. Leave it off and there is no network request
after the page loads at all.

Sharing has no accounts. Each device signs in anonymously so that completely
unauthenticated access is refused and every write is attributable, but anyone
can obtain an anonymous session, so that is not a privacy boundary: the room
code is. Roughly two billion of them, and anyone holding one can read and write
that progress record. Fine for stars and tick counts, which is exactly why
nothing else is in there. `sync/RULES-EXPLAINED.md` goes through the database
rules line by line.

A setup code encodes only the job names, timers, and support level, in the
link itself — it is never sent anywhere. A backup file is written straight to
your own device.

## Running it locally

```
python3 -m http.server 8791
```

Then open http://localhost:8791. Plain static files — no build step and no
dependencies. Camera and microphone need `localhost` or HTTPS.

## The shared look

The front door the app opens on — its name, the line under it, the round play
button — and the grown-up panel's controls are not written here. They are
[minormending/kidsuite](https://github.com/minormending/kidsuite), vendored into
`suite/` the same way `sync/` is, and shared with the other games so the three
read as one suite rather than three unrelated apps.

Edit it there and run `kidsuite/tools/install`, which also reminds you to bump
`CACHE` in `sw.js`; `kidsuite/tools/check` fails if a copy has drifted. Never
edit `suite/` directly.

What belongs to *this* app is the paint and the one thing the door has to do
here: the `--ld-` and `--gu-` tokens at the top of `css/app.css`, and
`Chime.unlock()` on the way through, without which the tones and the recorded
voice cannot play at all on iOS. The words on the door are for whoever is
holding the tablet, same as the labels under the job pictures; what the child
has to understand is the round button.

## Layout

```
index.html          all screens
css/app.css         this app's stylesheet — child screens, and the shared tokens
js/store.js         task list, settings, stars (localStorage)
js/idb.js           photos and voice clips (IndexedDB)
js/kid.js           the child's flow — no words in here on purpose
js/parent.js        the grown-up panel
js/chime.js         the few tones, made with WebAudio
js/icons.js         vendored Phosphor icons (MIT), only the ones used
js/backup.js        backup files and setup codes
js/qr.js            QR encoder
js/sync-state.js    what merging two devices' progress means (no DOM, testable)
js/sync.js          live sync plumbing
suite/              vendored from minormending/kidsuite — edit it there, not here
sync/               vendored from minormending/kidsync — edit it there, not here
sw.js               offline shell
test/qr-test.js     checks the encoder against a reference implementation
test/css-test.js    checks no styling has been deleted by accident
test/sync-merge-test.js  checks the progress merge converges
.githooks/          pre-commit hook running both checks
```

## Tests

```
node test/qr-test.js && node test/css-test.js && node test/sync-merge-test.js
```

`css-test.js` checks that every class the markup and scripts actually apply has
a rule in the stylesheet. Editing that file by slicing between markers has
twice silently deleted a whole section, so this guards against it.

`sync-merge-test.js` checks that merging two devices' progress converges. Three
of its cases are bugs that were real: taking the max of stars across two
different weeks resurrected last week's total into this one; identical counts
held in a different key order made each device see the other as changed and
republish forever; and `Store.today()` emits `2026-8-9`, which sorts *after*
`2026-8-10` as a string.

It also runs as a pre-commit hook. The hook is tracked in `.githooks/`, so
turn it on once per clone:

```
git config core.hooksPath .githooks
```

A commit that would ship unstyled classes is refused; `--no-verify` skips it.


Compares every QR version (1-40), both error correction levels, and all eight
mask patterns — 640 symbols — against matrices from the
[segno](https://github.com/heuer/segno) reference encoder, by hash, and checks
that an auto-masked symbol matches one of the eight valid symbols for its data.
No dependencies; the reference hashes are committed.

The rendered SVG output was also rasterised and decoded with OpenCV's QR
detector to confirm a real camera reads it, including a full five-job setup
link.
