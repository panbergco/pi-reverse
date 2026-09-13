/**
 * pi-reverse — reverse mode for pi: input pinned to the top, turns stacked downward newest first,
 * each Q&A pair still read normally. Named after Warp's reverse mode, which does this for command
 * blocks. Every choice is configurable and flips live; nothing needs a restart.
 *
 * Requires fullscreen TUI mode (`tuiMode: "fullscreen"`). In regular mode pi renders into the
 * terminal's own scrollback, which can only grow at the bottom — no extension can pin a top row.
 */

import { writeFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Container,
	isViewportTUI,
	ScrollView,
	Spacer,
	type TUI,
	type TuiMouseEvent,
	VStack,
} from "@earendil-works/pi-tui";
import { configFile, DEFAULTS, dockOrder, type ReverseConfig, readConfig, sanitize } from "./config.ts";
import { groupTurns, isQuestion, nextTurnOffset, reverseTurns } from "./turns.ts";

/** pi mounts exactly these regions, in this order (interactive-mode init). */
const REGIONS = ["document", "pending", "status", "widgetsAbove", "editor", "widgetsBelow", "footer"] as const;

/** Container mirroring another container's children, newest turn first. */
class Reversed extends Container {
	private readonly mirrors = new WeakMap<Component, Reversed>();
	/** The chat-log mirror nested inside this one (document level only). */
	inner: Reversed | undefined;
	/** Children present when the layout was applied (startup banner) stay in original order. */
	private pivot = -1;

	constructor(
		private readonly source: Container,
		/** Also reverse the last source child (the chat log inside the document). */
		private readonly deep: boolean,
		/** Optional rule drawn between turns. */
		private readonly divider?: () => Component,
		/** Optional window around each answer; newest and older turns can differ. */
		private readonly window?: (answer: Component, newest: boolean) => Component,
	) {
		super();
	}

	/** Windows survive re-syncs so their scroll position is not reset on every frame. */
	private readonly windows = new WeakMap<Component, Component>();
	/** The newest turn's answer window — what alt+e expands and the wheel scrolls. */
	newestWindow: Windowed | undefined;
	/** Line offset of that window inside the transcript content. */
	newestWindowTop = 0;

	/** Rendered height of the newest turn — what "follow the tail" needs to scroll by. */
	newestTurnHeight = 0;
	/** Line offset of the top of every turn, newest first — what turn-to-turn jumping needs. */
	turnOffsets: number[] = [];
	private newestTurnCount = 0;
	private turnStarts: number[] = [];

	private sync(): void {
		const src = this.source.children;
		if (this.pivot < 0 || src.length < this.pivot) this.pivot = this.deep ? 0 : src.length;
		const body = src.slice(this.pivot).map((child, index, all) => {
			// The chat log is the document's last child: mirror it too, one level down.
			if (!this.deep || index !== all.length - 1 || !(child instanceof Container)) return child;
			let mirror = this.mirrors.get(child);
			if (!mirror) {
				mirror = new Reversed(child, false, this.divider, this.window);
				this.mirrors.set(child, mirror);
			}
			this.inner = mirror;
			return mirror as Component;
		});
		// The document's own regions have no turns in them, so they simply reverse.
		if (this.deep) {
			this.children = [...body.reverse(), ...src.slice(0, this.pivot)];
			return;
		}
		const stacked = (groupTurns(body) as Component[][]).reverse();
		const children: Component[] = [];
		const starts: number[] = [];
		for (const turn of stacked) {
			if (children.length > 0 && this.divider) children.push(this.divider());
			starts.push(children.length);
			const parts = this.windowed(turn, starts.length === 1);
			// Count after windowing: a windowed answer is one child, however many components it holds.
			if (starts.length === 1) {
				this.newestTurnCount = parts.length;
				const last = parts[parts.length - 1];
				this.newestWindow = last instanceof Windowed ? last : undefined;
			}
			for (const child of parts) children.push(child);
		}
		this.turnStarts = starts;
		this.children = [...children, ...src.slice(0, this.pivot)];
	}

	/** Question stays as it is; everything after it in the turn shares one window. */
	private windowed(turn: Component[], newest: boolean): Component[] {
		if (!this.window) return turn;
		const split = turn.findIndex((child) => isQuestion(child)) + 1;
		if (split <= 0 || split >= turn.length) return turn;
		const key = turn[split];
		let box = this.windows.get(key);
		if (!box) {
			const answer = new Container();
			answer.children = turn.slice(split);
			box = this.window(answer, newest);
			this.windows.set(key, box);
		} else if (box instanceof Windowed) {
			box.setAnswer(turn.slice(split));
		}
		return [...turn.slice(0, split), box];
	}

	override render(width: number): string[] {
		this.sync();
		const lines: string[] = [];
		const offsets: number[] = [];
		let newest = 0;
		let turnTop = 0;
		for (let i = 0; i < this.children.length; i++) {
			if (this.turnStarts.includes(i)) {
				offsets.push(lines.length);
				turnTop = lines.length;
			}
			const child = this.children[i];
			// +2 covers the window's own "N lines above/below" markers.
			if (child instanceof Windowed) {
				child.setReserve(lines.length - turnTop + 2);
				if (child === this.newestWindow) this.newestWindowTop = lines.length;
			}
			const childLines = child.render(width);
			if (i < this.newestTurnCount) newest += childLines.length;
			for (const line of childLines) lines.push(line);
		}
		this.newestTurnHeight = newest;
		this.turnOffsets = offsets;
		return lines;
	}

	override handleMouse(event: TuiMouseEvent) {
		this.sync();
		return super.handleMouse(event);
	}

	override invalidate(): void {
		this.sync();
		super.invalidate();
	}
}

/** Gives a region fixed breathing room on both sides — and zero height when it is empty. */
class Padded implements Component {
	private lead = 0;

	constructor(
		private readonly inner: Component,
		private readonly pad: number,
	) {}

	render(width: number): string[] {
		const lines = this.inner.render(width);
		let start = 0;
		let end = lines.length;
		while (start < end && lines[start].trim() === "") start++;
		while (end > start && lines[end - 1].trim() === "") end--;
		this.lead = start;
		if (start === end) return [];
		// Normalise: strip whatever padding the component brought, add exactly `pad` each side.
		const blanks = Array.from({ length: this.pad }, () => "");
		return [...blanks, ...lines.slice(start, end), ...blanks];
	}

	invalidate(): void {
		this.inner.invalidate?.();
	}

	handleMouse(event: TuiMouseEvent) {
		if (event.y < this.pad || event.y >= event.height - this.pad) return undefined;
		const offset = this.pad - this.lead;
		return this.inner.handleMouse?.({ ...event, y: event.y - offset, height: event.height - 2 * this.pad + this.lead });
	}
}

const IMAGE_PREFIXES = ["\x1b_G", "\x1b]1337;File="];

/**
 * Caps an answer at one screenful, anchored at its END so the conclusion sits next to the question.
 * The hidden part is still reachable: the wheel scrolls inside the window.
 */
class Windowed implements Component {
	/** Absolute first visible line once the reader has scrolled; undefined means follow the end. */
	private anchor: number | undefined;
	private start = 0;
	private lead = 0;
	private clipped = false;
	private height = 0;
	/** Furthest the window can start; reaching it means "at the end", where following resumes. */
	private maxStart = 0;

	/** Lines this turn already spends above the window (question, markers, rules). */
	private reserve = 4;

	constructor(
		private readonly inner: Container,
		/** Which half of the pane owns the wheel for this window. */
		private readonly zone: () => "left" | "right" | "full" | "off",
		/** Whether the far end of this window passes the wheel on to the transcript. */
		private readonly chain: () => boolean,
		/** Final window height; receives what this turn already spends above the window. */
		private readonly maxLines: (reserve: number) => number,
		private readonly style: (text: string) => string,
	) {}

	/** The mirror measures what sits above this window in the same turn, so the end stays on screen. */
	setReserve(lines: number): void {
		this.reserve = Math.max(2, lines);
	}

	/** Keep the same window (and its scroll position) as the turn grows. */
	setAnswer(children: Component[]): void {
		this.inner.children = children;
	}

	/** Move the window by whole lines; returns false at either end so the transcript can take over. */
	scrollByLines(delta: number): boolean {
		if (!this.clipped || delta === 0) return false;
		const current = this.anchor ?? this.maxStart;
		const next = Math.min(this.maxStart, Math.max(0, current + delta));
		if (next === current) return false;
		this.anchor = next >= this.maxStart ? undefined : next;
		return true;
	}

	private wheelHint(): string {
		const zone = this.zone();
		if (zone === "off") return "alt+, / alt+.";
		if (zone === "full") return "wheel or alt+, / alt+.";
		return `wheel on the ${zone} half`;
	}

	private ownsWheel(x: number, width: number): boolean {
		const zone = this.zone();
		if (zone === "off") return false;
		if (zone === "full") return true;
		const middle = Math.floor(width / 2);
		return zone === "left" ? x < middle : x >= middle;
	}

	/** Height of the rendered window, markers included — needed to know what the pointer is over. */
	get windowHeight(): number {
		return this.height;
	}

	get isClipped(): boolean {
		return this.clipped;
	}

	/** Show the answer at full height, or put the one-screen window back. */
	toggleExpanded(): boolean {
		this.expanded = !this.expanded;
		return this.expanded;
	}

	private expanded = false;

	render(width: number): string[] {
		const lines = this.inner.render(width);
		const max = Math.max(5, this.maxLines(this.reserve));
		// Images are drawn with escape sequences spanning rows; slicing them corrupts the screen.
		if (this.expanded || lines.length <= max || lines.some((line) => IMAGE_PREFIXES.some((p) => line.includes(p)))) {
			this.start = 0;
			this.lead = 0;
			this.clipped = false;
			this.height = lines.length;
			return lines;
		}
		this.clipped = true;
		const maxStart = lines.length - max;
		this.maxStart = maxStart;
		// Following the end unless the reader scrolled: then their line stays put while text arrives.
		const start = this.anchor === undefined ? maxStart : Math.min(this.anchor, maxStart);
		this.start = start;
		const head =
			start > 0
				? [this.style(`  \u22ef ${start} line${start === 1 ? "" : "s"} above · ${this.wheelHint()} · alt+e expands`)]
				: [];
		const hiddenBelow = lines.length - start - max;
		const foot = hiddenBelow > 0 ? [this.style(`  \u22ef ${hiddenBelow} below · wheel down to follow again`)] : [];
		this.lead = head.length;
		const out = [...head, ...lines.slice(start, start + max), ...foot];
		this.height = out.length;
		return out;
	}

	invalidate(): void {
		this.inner.invalidate?.();
	}

	handleMouse(event: TuiMouseEvent) {
		// Wheel up (negative delta) walks back into the hidden part; wheel down returns to the end.
		// The wheel belongs to this window in its half of the pane. Reaching the end stops there:
		// the transcript does not take over mid-gesture unless chaining is switched on.
		if (event.type === "wheel" && event.wheelDelta && this.ownsWheel(event.x, event.width)) {
			const moved = this.scrollByLines(event.wheelDelta);
			if (moved || (this.clipped && !this.chain())) return { handled: true };
			return undefined;
		}
		return this.inner.handleMouse?.({ ...event, y: event.y - this.lead + this.start });
	}
}

/** A one-line rule between turns, so stacked pairs are easy to tell apart. */
class Divider implements Component {
	constructor(private readonly style: (text: string) => string) {}
	render(width: number): string[] {
		return ["", this.style("─".repeat(Math.max(1, width)))];
	}
	invalidate(): void {}
}

/** The question of the turn being answered, kept on screen while its answer scrolls underneath. */
class StickyQuestion implements Component {
	text = "";
	visible = false;
	constructor(private readonly style: (text: string) => string) {}
	render(width: number): string[] {
		if (!this.visible || this.text === "") return [];
		const label = ` ▲ ${this.text.replace(/\s+/g, " ").trim()}`;
		return [this.style(label.length > width ? `${label.slice(0, Math.max(1, width - 1))}…` : label)];
	}
	invalidate(): void {}
}

/** What "follow the tail" needs: the scroll view and the mirror that knows the newest turn's height. */
interface TailTracker {
	transcript: ScrollView;
	mirror: Reversed;
	margin: number;
	/** Chase the streaming text (top-docked newest-first only; elsewhere the scroll view follows the end). */
	chase: boolean;
	/** Scroll position this extension set last, to tell our own scrolling from the reader's. */
	owned?: number;
	/** True while the reader has scrolled away from the tail. */
	released?: boolean;
	sticky?: StickyQuestion;
}

let tail: TailTracker | undefined;

/** Move between turns, or to the end of the answer being written. */
export function jump(where: "tail" | "question" | "next" | "prev"): boolean {
	if (!tail) return false;
	const mirror = tail.mirror.inner;
	if (where === "tail") {
		followTail();
		return true;
	}
	const to =
		where === "question"
			? 0
			: nextTurnOffset(mirror?.turnOffsets ?? [], tail.transcript.scrollTop, where === "next" ? 1 : -1);
	if (to === undefined) return false;
	tail.transcript.scrollTo(to);
	if (tail.sticky) tail.sticky.visible = false;
	return true;
}

/**
 * Follow the end of a streaming answer — but only while the reader is still there. Scrolling away
 * hands control back (native chat behaviour); returning to the end resumes following, as does the
 * next question.
 */
function followTail(): void {
	if (!tail?.chase) return;
	const height = tail.mirror.inner?.newestTurnHeight ?? 0;
	const target = Math.max(0, height - tail.transcript.viewportHeight + tail.margin);
	const at = tail.transcript.scrollTop;
	if (tail.owned !== undefined && Math.abs(at - tail.owned) >= 1) {
		// The reader moved the transcript themselves; leave it alone until they come back.
		tail.released = at < target - 1;
	}
	if (tail.released) {
		tail.owned = at;
		return;
	}
	if (Math.abs(at - target) >= 1) tail.transcript.scrollTo(target);
	tail.owned = target;
	// Once the question itself has scrolled out of the viewport, show it as a pinned line instead.
	if (tail.sticky) tail.sticky.visible = target > 0;
}

/** A new question starts a new turn: follow it again. */
function resumeFollowing(): void {
	if (!tail) return;
	tail.released = false;
	tail.owned = undefined;
}

function applyLayout(
	tui: TUI,
	config: ReverseConfig,
	dim: (text: string) => string,
	sticky: StickyQuestion,
): string | undefined {
	if (tui.mode !== "fullscreen") return "pi-reverse needs fullscreen mode — set tuiMode: fullscreen";
	if (!isViewportTUI(tui)) return "pi-reverse: this pi build has no layout root";
	if (tui.children.length !== REGIONS.length) {
		return `pi-reverse: unexpected layout (${tui.children.length} regions, expected ${REGIONS.length})`;
	}
	const region: Record<string, Component> = {};
	REGIONS.forEach((name, index) => {
		region[name] = tui.children[index];
	});
	const document = region.document;
	if (!(document instanceof Container)) return "pi-reverse: transcript container not found";

	const newestFirst = config.order === "newest-first";
	const divider = config.turnDivider === "on" ? () => new Divider(dim) : undefined;
	// Measured live from the terminal, not the scroll view: a split pane resizes without the scroll
	// view being laid out again, and a stale viewport would freeze every answer window at the old size.
	let view: ScrollView | undefined;
	const dockRows = 8;
	const screenful = () => Math.max(4, tui.terminal.rows - dockRows);
	// The newest pair gets room to be read; older pairs shrink to a preview so one pair is easy to
	// focus on and the rest stay scannable.
	const height = (newest: boolean): ((reserve: number) => number) => {
		const setting = newest || config.olderLines === "same" ? config.answerLines : config.olderLines;
		if (typeof setting === "number") return () => setting;
		if (setting === "screen") return (reserve) => screenful() - reserve;
		// A share of the viewport, so the next pair stays in sight below the one being read.
		const percent = Number.parseInt(setting, 10) / 100;
		return (reserve) => Math.round(screenful() * percent) - reserve;
	};
	const window =
		config.answerWindow === "screen"
			? (answer: Component, newest: boolean) =>
					new Windowed(
						answer as Container,
						() => config.wheelZone,
						() => config.wheelChain === "on",
						height(newest),
						dim,
					)
			: undefined;
	const mirror = newestFirst ? new Reversed(document, true, divider, window) : undefined;
	const transcript = new ScrollView(mirror ?? document, {
		follow: newestFirst && config.dock === "top" ? "none" : "end",
		primary: true,
		overscroll: "chain",
	});
	view = transcript;
	// Only the top-docked, newest-first layout needs it: otherwise the scroll view follows the end itself.
	sticky.visible = false;
	tail = mirror
		? {
				transcript,
				mirror,
				margin: config.tailMargin,
				chase: config.followTail === "on" && config.dock === "top",
				...(config.stickyQuestion === "on" ? { sticky } : {}),
			}
		: undefined;

	const slot = (name: string) => {
		if (name === "pad") return { component: new Spacer(config.padOuter), shrink: 0 as const, minSize: config.padOuter };
		if (name === "sticky") return { component: sticky, shrink: 0 as const, minSize: 0 };
		if (name === "pending" || name === "status") {
			return { component: new Padded(region[name], config.padTransient), shrink: 1 as const, minSize: 0 };
		}
		if (name === "editor") return { component: region.editor, shrink: 1 as const, minSize: 3 };
		if (name === "footer") return { component: region.footer, shrink: 1 as const, minSize: 1 };
		return { component: region[name], shrink: 1 as const, minSize: 0 };
	};

	const dock = new VStack(dockOrder(config).map(slot));
	const transcriptSlot = { component: transcript, basis: 0, grow: 1, shrink: 1, minSize: 1 } as const;
	const dockSlot = { component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 } as const;
	tui.setLayoutRoot(new VStack(config.dock === "top" ? [dockSlot, transcriptSlot] : [transcriptSlot, dockSlot]));
	tui.requestRender(true);
	return undefined;
}

const USAGE = [
	"/reverse                       show current settings",
	"/reverse next | prev           jump to the top of the next / previous Q&A pair  (alt+j / alt+k)",
	"/reverse tail                  jump to the end of the answer being written      (alt+l)",
	"/reverse question              jump back to the newest question",
	"/reverse flip                  swap dock between top and bottom",
	"/reverse dock top|bottom",
	"/reverse order newest-first|oldest-first",
	"/reverse status-bar above-prompt|below-prompt",
	"/reverse spinner below-prompt|above-prompt",
	"/reverse sticky-question on|off  keep the question on screen while its answer scrolls",
	"/reverse turn-divider on|off     rule between Q&A pairs",
	"/reverse window                  toggle one-screen answer windows            (alt+w)",
	"/reverse expand                  expand / collapse the newest answer         (alt+e)",
	"                                 alt+, / alt+. scroll inside the answer",
	"/reverse answer-window screen|off",
	"/reverse answer-lines 70%|screen|3..200   height of the newest answer",
	"/reverse older-lines same|3..200      height of answers in older pairs",
	"/reverse wheel-zone left|right|full|off  which half of the pane scrolls inside an answer",
	"/reverse wheel-chain on|off           pass the wheel to the transcript at an answer's end",
	"/reverse follow-tail on|off      keep a streaming answer's last line in view",
	"/reverse tail-margin 0..5        slack kept below that line",
	"/reverse pad-outer 0..5          blank lines at the screen edge",
	"/reverse pad-transient 0..5      blank lines around the working spinner",
	"/reverse reset                   back to defaults",
].join("\n");

const KEYS: Record<string, keyof ReverseConfig> = {
	dock: "dock",
	order: "order",
	"status-bar": "statusBar",
	statusbar: "statusBar",
	spinner: "spinner",
	"sticky-question": "stickyQuestion",
	"turn-divider": "turnDivider",
	"answer-window": "answerWindow",
	"answer-lines": "answerLines",
	"older-lines": "olderLines",
	"wheel-zone": "wheelZone",
	"wheel-chain": "wheelChain",
	"pad-outer": "padOuter",
	"pad-transient": "padTransient",
	"follow-tail": "followTail",
	"tail-margin": "tailMargin",
};

const JUMPS: Record<string, "tail" | "question" | "next" | "prev"> = {
	next: "next",
	prev: "prev",
	previous: "prev",
	tail: "tail",
	end: "tail",
	question: "question",
};

export default function (pi: ExtensionAPI) {
	let config = readConfig();
	let live: TUI | undefined;
	let applyPending = true;
	let dim: (text: string) => string = (text) => text;
	const sticky = new StickyQuestion((text) => dim(text));

	const register = (ctx: { ui: { setWidget: Function; notify: Function } }): void => {
		// A widget factory is the only place an extension is handed the live TUI (and the theme).
		ctx.ui.setWidget("pi-reverse", (tui: TUI, theme: { fg(color: string, text: string): string }) => {
			live = tui;
			dim = (text) => theme.fg("dim", text);
			if (applyPending) {
				applyPending = false;
				// Defer: we are inside a render pass.
				setTimeout(() => {
					const problem = applyLayout(tui, config, dim, sticky);
					if (problem) ctx.ui.notify(problem, "warning");
				}, 0);
			}
			return { invalidate() {}, render: () => [] };
		});
	};

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode === "tui") register(ctx as never);
	});

	pi.on("input", async (event) => {
		sticky.text = String((event as { text?: string }).text ?? "");
		sticky.visible = false;
		resumeFollowing();
	});

	// Scroll after the frame that contains the new text, so the measured height is current.
	const chase = (): void => {
		if (tail?.chase) setTimeout(followTail, 0);
	};
	pi.on("message_update", async () => chase());
	pi.on("message_end", async () => chase());
	pi.on("tool_execution_update", async () => chase());
	pi.on("tool_execution_end", async () => chase());

	const move = (where: "tail" | "question" | "next" | "prev"): void => {
		if (jump(where)) live?.requestRender(true);
	};
	pi.registerShortcut("alt+j", { description: "pi-reverse: next Q&A pair", handler: () => move("next") });
	pi.registerShortcut("alt+k", { description: "pi-reverse: previous Q&A pair", handler: () => move("prev") });
	pi.registerShortcut("alt+l", { description: "pi-reverse: end of the current answer", handler: () => move("tail") });
	const scrollAnswer = (lines: number): void => {
		const box = tail?.mirror.inner?.newestWindow;
		if (box?.scrollByLines(lines)) live?.requestRender(true);
	};
	pi.registerShortcut("alt+,", { description: "pi-reverse: scroll up inside the answer", handler: () => scrollAnswer(-5) });
	pi.registerShortcut("alt+.", {
		description: "pi-reverse: scroll down inside the answer",
		handler: () => scrollAnswer(5),
	});
	pi.registerShortcut("alt+e", {
		description: "pi-reverse: expand / collapse the newest answer",
		handler: () => {
			const box = tail?.mirror.inner?.newestWindow;
			if (!box) return;
			box.toggleExpanded();
			live?.requestRender(true);
		},
	});
	pi.registerShortcut("alt+w", {
		description: "pi-reverse: toggle one-screen answer windows",
		handler: (ctx) => toggleWindow(ctx as never),
	});

	// Flip answer windowing without touching anything else, and keep the choice.
	const toggleWindow = (ctx: { ui: { notify: Function } }): void => {
		config = { ...config, answerWindow: config.answerWindow === "screen" ? "off" : "screen" };
		save(ctx);
		if (live) {
			const problem = applyLayout(live, config, dim, sticky);
			ctx.ui.notify(problem ?? `pi-reverse: answer window ${config.answerWindow}`, problem ? "warning" : "info");
		}
	};

	const save = (ctx: { ui: { notify: Function } }): void => {
		try {
			writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`);
		} catch (error) {
			ctx.ui.notify(`pi-reverse: settings not saved (${(error as Error).message})`, "warning");
		}
	};

	pi.registerCommand("reverse", {
		description: "Reverse mode: prompt on top, newest Q&A pair first, jumping between pairs",
		handler: async (args, ctx) => {
			const [rawKey, rawValue] = String(args ?? "").trim().split(/\s+/);
			const describe = () =>
				`pi-reverse: dock ${config.dock} · order ${config.order} · status-bar ${config.statusBar} · spinner ${config.spinner} · sticky-question ${config.stickyQuestion} · turn-divider ${config.turnDivider} · follow-tail ${config.followTail} · tail-margin ${config.tailMargin} · pad-outer ${config.padOuter} · pad-transient ${config.padTransient} · answer-window ${config.answerWindow} · answer-lines ${config.answerLines} · older-lines ${config.olderLines} · wheel-zone ${config.wheelZone} · wheel-chain ${config.wheelChain}`;

			if (!rawKey) {
				ctx.ui.notify(`${describe()}\n\n${USAGE}`, "info");
				return;
			}
			const where = JUMPS[rawKey.toLowerCase()];
			if (where) {
				if (!jump(where)) ctx.ui.notify("pi-reverse: nothing to jump to", "warning");
				else live?.requestRender(true);
				return;
			}
			if (rawKey === "expand") {
				const box = tail?.mirror.inner?.newestWindow;
				if (!box) ctx.ui.notify("pi-reverse: nothing to expand", "warning");
				else {
					box.toggleExpanded();
					live?.requestRender(true);
				}
				return;
			}
			if (rawKey === "window") {
				toggleWindow(ctx as never);
				return;
			}
			if (rawKey === "reset") config = { ...DEFAULTS };
			else if (rawKey === "flip") config = { ...config, dock: config.dock === "top" ? "bottom" : "top" };
			else {
				const key = KEYS[rawKey.toLowerCase()];
				if (!key) {
					ctx.ui.notify(`pi-reverse: unknown option "${rawKey}"\n\n${USAGE}`, "warning");
					return;
				}
				const numeric = key === "padOuter" || key === "padTransient" || key === "tailMargin";
				const counted = (key === "answerLines" || key === "olderLines") && /^\d+$/.test(rawValue ?? "");
				const value = numeric || counted ? Number(rawValue) : rawValue;
				const next = sanitize({ ...config, [key]: value });
				if (next[key] !== value) {
					ctx.ui.notify(`pi-reverse: invalid value "${rawValue}" for ${rawKey}\n\n${USAGE}`, "warning");
					return;
				}
				config = next;
			}

			save(ctx as never);
			if (!live) {
				applyPending = true;
				register(ctx as never);
				return;
			}
			const problem = applyLayout(live, config, dim, sticky);
			ctx.ui.notify(problem ?? describe(), problem ? "warning" : "info");
		},
	});
}
