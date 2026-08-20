/* Merging two devices' progress has to be boring and predictable, and three of
   these cases are things that were actually wrong before the test existed.
   Run directly:  node test/sync-merge-test.js  */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'sync-state.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src + '\n;this.SyncState = SyncState;', sandbox);
const S = sandbox.SyncState;

const M = S.merge;
const key = o => JSON.stringify(o);
const cases = [];
const check = (name, pass, note) => cases.push({ name, pass: !!pass, note: note || '' });

/* ---- stars ---- */

check('same week keeps the higher total',
  M({ stars: 3, weekStart: 100 }, { stars: 7, weekStart: 100 }).stars === 7);

const older = M({ stars: 2, weekStart: 200, weeks: [] }, { stars: 9, weekStart: 100, weeks: [] });
check('a newer week wins this week\'s count',
  older.stars === 2 && older.weekStart === 200,
  'taking the max across weeks would resurrect last week\'s stars into this one');
check('the losing week is archived, not dropped',
  key(older.weeks) === key([{ start: 100, stars: 9 }]),
  'the app promises nothing ever removes a star, and a merge is not an exception');

check('"Clear this week" beats a higher count',
  M({ stars: 0, weekStart: 100, starsEpoch: 1 }, { stars: 9, weekStart: 100, starsEpoch: 0 }).stars === 0,
  'without the epoch a max merge refills the stars instantly');

/* ---- today's counts ---- */

check('counts merge to the higher per job',
  key(M({ done: { date: '2026-8-20', counts: { a: 1, b: 3 } } },
        { done: { date: '2026-8-20', counts: { a: 4, c: 2 } } }).done.counts)
  === key({ a: 4, b: 3, c: 2 }));

check('the later day wins even unpadded',
  M({ done: { date: '2026-8-9', counts: { a: 5 } } },
    { done: { date: '2026-8-10', counts: { b: 1 } } }).done.date === '2026-8-10',
  'Store.today() emits "2026-8-9", which sorts AFTER "2026-8-10" as a string');

check('"Let them do today again" beats populated counts',
  Object.keys(M({ done: { date: '2026-8-20', counts: {} }, doneEpoch: 1 },
                { done: { date: '2026-8-20', counts: { a: 9 } }, doneEpoch: 0 }).done.counts).length === 0);

/* ---- runs ---- */

const runs = M({ sessions: [{ at: 1, level: 1, earned: 1, tasks: 1, beatTimer: 1, extra: 'nope' }] },
               { sessions: [{ at: 2, level: 1, earned: 1, tasks: 1, beatTimer: 1 }] });
check('runs are unioned', runs.sessions.length === 2);
check('runs carry only the five numbers', !('extra' in runs.sessions[0]),
  'rebuilt field by field, so nothing unexpected can travel');

/* ---- convergence: the properties that stop a write loop ---- */

const A = { stars: 5, weekStart: 300, weeks: [{ start: 1, stars: 2 }],
            done: { date: '2026-8-20', counts: { x: 2, a: 1 } },
            sessions: [{ at: 10, level: 1, earned: 1, tasks: 2, beatTimer: 1 }] };
const B = { stars: 8, weekStart: 300, weeks: [{ start: 2, stars: 4 }],
            done: { date: '2026-8-20', counts: { y: 5 } },
            sessions: [{ at: 20, level: 2, earned: 2, tasks: 2, beatTimer: 0 }] };

check('order does not matter', key(M(A, B)) === key(M(B, A)),
  'differing key order alone makes each device see the other as changed, forever');
check('merging again changes nothing', key(M(M(A, B), B)) === key(M(A, B)));
check('re-merging the other side changes nothing', key(M(M(A, B), A)) === key(M(A, B)));
check('subset output is canonical',
  key(S.subset({ done: { date: '2026-8-20', counts: { z: 1, a: 2 } } }).done.counts) === key({ a: 2, z: 1 }));

/* ---- rubbish in ---- */

check('rubbish is survivable', (() => {
  try { M(null, 'nope'); M(undefined, undefined); M({}, { done: 7, weeks: 'x', sessions: null }); return true; }
  catch (err) { return false; }
})());

/* ---- report ---- */

const failed = cases.filter(c => !c.pass);
cases.forEach(c => console.log((c.pass ? '  ok   ' : '  FAIL ') + c.name + (c.note && !c.pass ? '\n         ' + c.note : '')));
console.log('');
if (failed.length) {
  console.error(failed.length + ' of ' + cases.length + ' merge checks failed.');
  process.exit(1);
}
console.log(cases.length + ' merge checks passed.');
