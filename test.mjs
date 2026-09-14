// Smallest check that fails if the layout logic breaks: node test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULTS, dockOrder, sanitize } from "./config.ts";
import { reverseTurns } from "./turns.ts";

// Default: prompt block at the top, status bar above the editor, spinner last.
assert.deepEqual(dockOrder(DEFAULTS), ["pad", "footer", "widgetsAbove", "editor", "widgetsBelow", "pending", "status", "sticky"]);

// Status bar below the prompt.
assert.deepEqual(dockOrder({ ...DEFAULTS, statusBar: "below-prompt" }), [
	"pad", "widgetsAbove", "editor", "widgetsBelow", "footer", "pending", "status", "sticky",
]);

// Spinner above the prompt: the transient block leads instead of trailing.
assert.deepEqual(dockOrder({ ...DEFAULTS, spinner: "above-prompt" }), [
	"pad", "pending", "status", "footer", "widgetsAbove", "editor", "widgetsBelow", "sticky",
]);

// Sticky question can be switched off entirely.
assert.ok(!dockOrder({ ...DEFAULTS, stickyQuestion: "off" }).includes("sticky"));

// Docked at the bottom: the whole block mirrors, screen-edge padding last.
assert.deepEqual(dockOrder({ ...DEFAULTS, dock: "bottom" }), [
	"sticky", "footer", "widgetsAbove", "editor", "widgetsBelow", "pending", "status", "pad",
]);

// No outer padding means no spacer region at all.
assert.ok(!dockOrder({ ...DEFAULTS, padOuter: 0 }).includes("pad"));

// Junk config never breaks the layout.
assert.deepEqual(sanitize({ dock: "sideways", padOuter: 99, order: null }), DEFAULTS);
assert.equal(sanitize({ padTransient: 3 }).padTransient, 3);

console.log("pi-reverse: 6 checks passed");

// --- turn grouping: newest turn first, question still above its answer ---
const mk = (name, label) => { const C = { [name]: class { constructor(l){ this.label = l; } } }[name]; return new C(label); };
const q = (l) => mk("UserMessageComponent", l);
const a = (l) => mk("AssistantMessageComponent", l);
const sp = () => mk("Spacer", "·");

const log = [q("Q1"), a("A1"), sp(), q("Q2"), a("A2")];
assert.deepEqual(reverseTurns(log).map((c) => c.label), ["·", "Q2", "A2", "Q1", "A1"]);

// Mid-stream: the answer being written stays under its own question.
const streaming = [q("Q1"), a("A1"), q("Q2")];
assert.deepEqual(reverseTurns(streaming).map((c) => c.label), ["Q2", "Q1", "A1"]);

// No questions yet (startup banner only): left exactly as it is — no reversal, no rules between
// the pieces of the banner.
assert.deepEqual(reverseTurns([a("x"), a("y")]).map((c) => c.label), ["x", "y"]);

console.log("pi-reverse: turn grouping checks passed");

// --- turn groups expose the newest turn, which is what follow-the-tail measures ---
import { groupTurns } from "./turns.ts";
const groups = groupTurns([q("Q1"), a("A1"), sp(), q("Q2"), a("A2")]);
assert.equal(groups.length, 2);
assert.deepEqual(groups[groups.length - 1].map((c) => c.label), ["·", "Q2", "A2"]);

// follow-tail and tail-margin are real, validated settings
assert.equal(sanitize({}).followTail, "on");
assert.equal(sanitize({ followTail: "maybe" }).followTail, "on");
assert.equal(sanitize({ followTail: "off" }).followTail, "off");
assert.equal(sanitize({ tailMargin: 4 }).tailMargin, 4);
assert.equal(sanitize({ tailMargin: 99 }).tailMargin, 1);

console.log("pi-reverse: follow-tail checks passed");

// --- jumping between Q&A pairs ---
import { nextTurnOffset } from "./turns.ts";
const offs = [0, 40, 95];           // newest turn at 0, older ones below
assert.equal(nextTurnOffset(offs, 0, 1), 40);     // next pair down
assert.equal(nextTurnOffset(offs, 40, 1), 95);
assert.equal(nextTurnOffset(offs, 95, 1), undefined); // already at the oldest
assert.equal(nextTurnOffset(offs, 95, -1), 40);   // back up a pair
assert.equal(nextTurnOffset(offs, 60, -1), 40);   // mid-pair: back to this pair's question first
assert.equal(nextTurnOffset(offs, 0, -1), undefined);
assert.equal(nextTurnOffset([], 0, 1), undefined);

console.log("pi-reverse: jump checks passed");

// --- answer height: a screenful for the newest pair, a preview for older ones ---
assert.equal(sanitize({}).answerLines, "70%");
assert.equal(sanitize({ answerLines: "50%" }).answerLines, "50%");
assert.equal(sanitize({ answerLines: "5%" }).answerLines, "70%");   // below the floor
assert.equal(sanitize({ answerLines: "screen" }).answerLines, "screen");
assert.equal(sanitize({}).olderLines, "same");   // every pair gets the same share by default
assert.equal(sanitize({ answerLines: 12 }).answerLines, 12);
assert.equal(sanitize({ answerLines: 1 }).answerLines, "70%");      // below the floor
assert.equal(sanitize({ olderLines: 8 }).olderLines, 8);
assert.equal(sanitize({ olderLines: 999 }).olderLines, "same");

console.log("pi-reverse: answer height checks passed");

// --- wheel zone: half the pane scrolls the answer, the other half the transcript ---
assert.equal(sanitize({}).wheelZone, "left");
assert.equal(sanitize({ wheelZone: "right" }).wheelZone, "right");
assert.equal(sanitize({ wheelZone: "sideways" }).wheelZone, "left");

console.log("pi-reverse: wheel zone checks passed");

// --- reaching the end of an answer stops there by default ---
assert.equal(sanitize({}).wheelChain, "off");
assert.equal(sanitize({ wheelChain: "on" }).wheelChain, "on");

// `wheel-chain off` stops dead at a window's edge rather than dragging the transcript with it.
import { wheelGoesTo } from "./turns.ts";
assert.equal(wheelGoesTo(true, true, false), "window");
// The end of an answer is the END: no event passes through to the transcript behind it.
assert.equal(wheelGoesTo(false, true, false), "window");
// A window with nothing hidden never holds the wheel, and a chaining one hands it over at once.
assert.equal(wheelGoesTo(false, false, false), "transcript");
assert.equal(wheelGoesTo(false, true, true), "transcript");

console.log("pi-reverse: wheel chain checks passed");

// --- the seam is labelled with when the question below it was asked ---
import { dividerLabel, ruleTo, windowEdgeLabels } from "./reverse-label.ts";
import { matchQuestionTimes, messageText, QuestionTimes } from "./turn-time.ts";
const T = Date.parse("2026-09-13T08:00:00Z");
assert.match(dividerLabel(T, undefined, T + 30_000), /just now/);
assert.match(dividerLabel(T, undefined, T + 20 * 60_000), /20m ago/);
assert.match(dividerLabel(T, undefined, T + 3 * 3_600_000), /3h ago/);
// A long pause between turns is announced instead of the age.
assert.match(dividerLabel(T, T - 4 * 3_600_000, T + 60_000), /4h later/);
// No timestamp says so rather than guessing.
assert.equal(dividerLabel(undefined, undefined, T), "time unknown");

console.log("pi-reverse: divider label checks passed");

// --- inner scrolling never changes the answer window's height ---
const atEnd = windowEdgeLabels(40, 0, "wheel on the left half");
const inMiddle = windowEdgeLabels(20, 20, "wheel on the left half");
const atStart = windowEdgeLabels(0, 40, "wheel on the left half");
assert.equal(atEnd.length, 2);
assert.equal(inMiddle.length, 2);
assert.equal(atStart.length, 2);
assert.equal(atEnd[1], "");
assert.equal(atStart[0], "");
assert.match(inMiddle[0], /20 lines above/);
assert.match(inMiddle[1], /20 below/);

// A long question is capped too, so it cannot squeeze its answer down to the floor. Its unread
// part is BELOW it, so that is where the hint goes, and it never claims to be following a stream.
const asked = windowEdgeLabels(0, 35, "wheel on the left half", true);
assert.equal(asked[0], "");
assert.match(asked[1], /35 more lines/);
// alt+e expands the ANSWER, and the wheel hint rides the answer's marker: neither belongs here.
assert.doesNotMatch(asked[1], /alt\+e expands/);
assert.doesNotMatch(asked[1], /wheel on the/);
assert.doesNotMatch(asked[1], /follow again/);
// An unclipped question still gets a boundary, so the pair always reads as two halves.
assert.equal(windowEdgeLabels(0, 0, "wheel on the left half", true)[1], "RULE");
assert.match(ruleTo("RULE", 40), /^ {2}\u2500+$/);
assert.match(ruleTo("⋯ 9 more lines", 40), /^ {2}⋯ 9 more lines \u2500+$/);
const askedScrolled = windowEdgeLabels(12, 20, "wheel on the left half", true);
assert.match(askedScrolled[0], /12 lines above/);
assert.equal(askedScrolled.length, 2);
// The answer keeps its own wording.
assert.match(windowEdgeLabels(40, 3, "wheel on the left half")[1], /follow again/);
assert.equal(sanitize({}).questionLines, "40%");
assert.equal(sanitize({ questionLines: "full" }).questionLines, "full");
assert.equal(sanitize({ questionLines: 9 }).questionLines, 9);
assert.equal(sanitize({ questionLines: "nonsense" }).questionLines, "40%");

console.log("pi-reverse: fixed-height answer window checks passed");

// --- resumed/compacted sessions match timestamps by question, never by partial display index ---
const records = Array.from({ length: 783 }, (_, index) => ({ text: `question ${index}`, at: T + index * 60_000 }));
records[100] = { text: "go", at: T + 100 * 60_000 };
records[782] = { text: "go", at: T + 782 * 60_000 };
const matched = matchQuestionTimes(["go", "question 781", "question 780"], records);
assert.equal(matched[0].at, records[782].at); // repeated text takes the newest matching message
assert.equal(matched[1].at, records[781].at);
assert.equal(matched[2].at, records[780].at);
assert.equal(matched[0].previous, records[781].at);
assert.equal(matchQuestionTimes(["not in this session"], records)[0].at, undefined);
assert.equal(messageText([{ type: "text", text: "hello" }, { type: "image", data: "ignored" }]), "hello");

console.log("pi-reverse: resumed-session timestamp checks passed");

// --- the question index is built once and extended, so a repaint never pays for the whole history ---
// v0.14 rebuilt a 9,269-entry index per frame: 65 ms of every repaint. These checks hold the
// incremental index to the behaviour of that (correct, slow) version, which is used here as oracle.
const norm = (t) => t.replace(/\r\n?/g, "\n").trim().replace(/[ \t]+/g, " ");
function oracle(questions, recs) {
	const pools = new Map();
	for (let i = 0; i < recs.length; i++) {
		const key = norm(recs[i].text);
		if (!key) continue;
		const pool = pools.get(key) ?? [];
		pool.push({ at: recs[i].at, previous: recs[i - 1]?.at });
		pools.set(key, pool);
	}
	return questions.map((q) => pools.get(norm(q))?.pop() ?? { at: undefined, previous: undefined });
}
let seed = 12345;
const rand = (n) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
const vocab = ["go", "go ", " go", "fix it", "what now?", "", "  ", "do 3 and 8", "GO", "reply\r\nnow"];
for (let trial = 0; trial < 200; trial++) {
	const n = rand(60);
	const recs = Array.from({ length: n }, (_, i) => ({ text: vocab[rand(vocab.length)], at: 1_000_000 + i * 1000 }));
	const visible = Array.from({ length: rand(12) }, () => vocab[rand(vocab.length)]);
	// Growing the index in arbitrary increments must equal indexing the whole history at once.
	const grown = new QuestionTimes();
	for (let cut = 0; cut <= n; cut += 1 + rand(4)) grown.sync(recs.slice(0, cut));
	grown.sync(recs);
	assert.deepEqual(grown.match(visible), oracle(visible, recs));
	// Matching must not consume the index: the same screen drawn twice reads the same.
	assert.deepEqual(grown.match(visible), grown.match(visible));
	// A history replaced by compaction must not answer from the one it replaced.
	const after = Array.from({ length: rand(30) }, (_, i) => ({ text: vocab[rand(vocab.length)], at: 9_000_000 + i * 1000 }));
	grown.sync(after);
	assert.deepEqual(grown.match(visible), oracle(visible, after));
}

// A rewrite that reaches the newest message is caught even when the length and the first stamp
// are unchanged — this is what the tail check buys, and it is the reachable case.
const before = [{ text: "go", at: 1000 }, { text: "alpha", at: 2000 }, { text: "omega", at: 3000 }];
const rewritten = [{ text: "go", at: 1000 }, { text: "BETA", at: 2500 }, { text: "omega", at: 3500 }];
const rewrite = new QuestionTimes();
rewrite.sync(before);
rewrite.sync(rewritten);
assert.equal(rewrite.match(["omega"])[0].at, 3500);
assert.equal(rewrite.match(["BETA"])[0].at, 2500);

// KNOWN AND ACCEPTED: an edit that changes only the MIDDLE, leaving the count, the first stamp and
// the last stamp identical, is not detected. Catching it costs hashing the whole history on every
// read — the cost this index exists to remove. Asserted so the boundary is a decision, not a
// surprise: if pi ever gains in-place message editing, this is the line that must change.
const middleOnly = [{ text: "go", at: 1000 }, { text: "BETA", at: 2000 }, { text: "omega", at: 3000 }];
const undetected = new QuestionTimes();
undetected.sync(before);
undetected.sync(middleOnly);
assert.equal(undetected.match(["BETA"])[0].at, undefined);

// A caller that writes to what it was handed must not corrupt the index behind it.
const shared = new QuestionTimes();
shared.sync([{ text: "go", at: 1000 }]);
shared.match(["go"])[0].at = 999_999;
assert.equal(shared.match(["go"])[0].at, 1000);

// Replacement of the same length, detected by its newest stamp rather than by its count.
const swapped = new QuestionTimes();
swapped.sync([{ text: "A", at: 1 }, { text: "B", at: 2 }]);
swapped.sync([{ text: "A", at: 1 }, { text: "C", at: 3 }]);
assert.equal(swapped.match(["B"])[0].at, undefined);
assert.equal(swapped.match(["C"])[0].at, 3);

console.log("pi-reverse: question index checks passed (200 differential trials)");

// --- regression: invalidating a long transcript must not throw away every off-screen row ---
// That made the working indicator wait 4.9s on a 1,000-message session. Width changes still clear
// the cache; ordinary transcript invalidation does not, because rows refresh before entering view.
const source = readFileSync(new URL("./reverse.ts", import.meta.url), "utf8");
const invalidate = source.match(/override invalidate\(\): void \{([\s\S]*?)\n\t\}/)?.[1] ?? "";
assert.ok(invalidate, "Reversed.invalidate exists");
assert.doesNotMatch(invalidate, /dropCache\(/);

console.log("pi-reverse: invalidation cache regression check passed");
