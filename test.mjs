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

console.log("pi-reverse: wheel chain checks passed");

// --- the seam is labelled with when the question below it was asked ---
import { dividerLabel } from "./reverse-label.ts";
const T = Date.parse("2026-09-13T08:00:00Z");
assert.match(dividerLabel(T, undefined, T + 30_000), /just now/);
assert.match(dividerLabel(T, undefined, T + 20 * 60_000), /20m ago/);
assert.match(dividerLabel(T, undefined, T + 3 * 3_600_000), /3h ago/);
// A long pause between turns is announced instead of the age.
assert.match(dividerLabel(T, T - 4 * 3_600_000, T + 60_000), /4h later/);
// No timestamp says so rather than guessing.
assert.equal(dividerLabel(undefined, undefined, T), "time unknown");

console.log("pi-reverse: divider label checks passed");

// --- regression: invalidating a long transcript must not throw away every off-screen row ---
// That made the working indicator wait 4.9s on a 1,000-message session. Width changes still clear
// the cache; ordinary transcript invalidation does not, because rows refresh before entering view.
const source = readFileSync(new URL("./reverse.ts", import.meta.url), "utf8");
const invalidate = source.match(/override invalidate\(\): void \{([\s\S]*?)\n\t\}/)?.[1] ?? "";
assert.ok(invalidate, "Reversed.invalidate exists");
assert.doesNotMatch(invalidate, /dropCache\(/);

console.log("pi-reverse: invalidation cache regression check passed");
