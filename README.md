# Tidy Up

A wordless tidy-up helper for a five-year-old who cannot read yet.

One job at a time, one picture, one timer, one big button. No text appears
anywhere on the child's side of the app.

**Live:** https://minormending.github.io/tidy-up/

---

## What it does

**Pick.** A grid of pictures, one per job. Tapping a picture runs that job.
The green button runs everything still left today.

**One job.** A single large picture, a ring that visibly drains, and one
enormous check button. Nothing else on screen is tappable. Tapping the
picture replays the recorded instruction.

**Done.** A star, one short sound, and then the app puts itself away. Waking
it takes a deliberate long press, so there is nothing here to play with once
the tidying is finished.

## Why it is built this way

Every constraint below came out of standard behavioural parent training
(Kazdin's parent management training, Incredible Years, PCIT). They are worth
keeping when the temptation arrives to make this more fun.

- **The picture is a photo of the real bin.** "Clean your room" is an abstract
  category a five-year-old cannot execute. "Put the blocks in the blue bin" is
  a task. A photo of *his* bin removes the last abstraction step. The four
  built-in pictures are placeholders — replace them.
- **Instructions are audio, in your own voice.** A pre-reader cannot use text,
  and your recorded voice beats text-to-speech for a child this age.
- **Progress is dots, not numerals.** He cannot read "3 / 4".
- **Stars are earned and never removed.** Response cost — taking points away —
  reliably backfires at this age and turns tidying into a power struggle.
- **The star is for finishing, not for beating the clock.** Requiring a perfect
  result extinguishes the behaviour. Most of the blocks away earns the star;
  you tighten the standard over weeks.
- **Running out of time is not a failure.** One soft tone, and the button still
  works. No alarm, no red screen, no lost star.
- **A job done today cannot be run again for a second star.** Tapping it just
  replays the voice clip. There is no star farming.
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

Hold the **top-right corner for about 1.6 seconds** to open the grown-up
panel. There you can:

- name each job, photograph the real bin or shelf, and record the instruction
- set the timer per job — from what he can actually sustain, not from what
  sounds reasonable to an adult
- choose the support level, and see whether the recent runs justify stepping
  it down
- see the week's stars and the run log

Add it to the home screen and it opens portrait, full screen, with no address
bar to wander out of.

## Privacy

Photos and voice recordings never leave the device. They live in the browser's
IndexedDB; the task list and stars live in `localStorage`. There is no backend,
no analytics, and no network request after the page loads. Nothing personal is
in this repository.

Clearing the browser's site data erases the setup, so re-record rather than
relying on it as a backup.

## Running it locally

```
python3 -m http.server 8791
```

Then open http://localhost:8791. Plain static files — no build step and no
dependencies. Camera and microphone need `localhost` or HTTPS.

## Layout

```
index.html          all screens
css/app.css         one stylesheet
js/store.js         task list, settings, stars (localStorage)
js/idb.js           photos and voice clips (IndexedDB)
js/kid.js           the child's flow — no words in here on purpose
js/parent.js        the grown-up panel
js/chime.js         the few tones, made with WebAudio
sw.js               offline shell
```
