/** Pure configuration helpers — no TUI imports, so `node test.mjs` can exercise them directly. */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export interface ReverseConfig {
	/** Which end of the screen the prompt block is docked to. */
	dock: "top" | "bottom";
	/** Newest turn first, or pi's normal chronological order. */
	order: "newest-first" | "oldest-first";
	/** Where the status bar (footer) sits relative to the prompt. */
	statusBar: "above-prompt" | "below-prompt";
	/** Blank lines at the outer edge of the prompt block (screen edge side). */
	padOuter: number;
	/** Blank lines around the working spinner and queued messages. */
	padTransient: number;
	/** Keep the end of a streaming answer in view instead of letting it grow past the fold. */
	followTail: "on" | "off";
	/** Lines of slack kept below the streaming line when following it. */
	tailMargin: number;
	/** Keep the current question on screen while its answer scrolls underneath. */
	stickyQuestion: "on" | "off";
	/** Draw a rule between turns so stacked pairs are easy to separate. */
	turnDivider: "on" | "off";
	/** Where the working spinner and queued messages sit relative to the prompt. */
	spinner: "below-prompt" | "above-prompt";
	/** Cap each answer at one screenful, anchored at its end, instead of letting it run on. */
	answerWindow: "screen" | "off";
	/** Height of the newest answer: a share of the viewport ("70%"), a line count, or "screen". */
	answerLines: "screen" | `${number}%` | number;
	/** Height of answers in older pairs; "same" gives every pair the same share. */
	olderLines: "same" | number;
	/** Which half of the pane scrolls inside an answer; the other half scrolls the transcript. */
	wheelZone: "left" | "right" | "full" | "off";
	/** Whether hitting the end of an answer hands the wheel on to the transcript. */
	wheelChain: "on" | "off";
}

export const DEFAULTS: ReverseConfig = {
	dock: "top",
	order: "newest-first",
	statusBar: "above-prompt",
	padOuter: 1,
	padTransient: 1,
	followTail: "on",
	tailMargin: 1,
	stickyQuestion: "on",
	turnDivider: "on",
	spinner: "below-prompt",
	answerWindow: "screen",
	answerLines: "70%",
	olderLines: "same",
	wheelZone: "left",
	wheelChain: "off",
};

/** pi mounts exactly these regions, in this order (interactive-mode init). */
const REGIONS = ["document", "pending", "status", "widgetsAbove", "editor", "widgetsBelow", "footer"] as const;

/** Region order of the prompt block, outermost (screen edge) first. Pure: unit-testable. */
export function dockOrder(config: ReverseConfig): string[] {
	const statusAbove = config.statusBar === "above-prompt";
	const promptBlock = [
		...(statusAbove ? ["footer"] : []),
		"widgetsAbove",
		"editor",
		"widgetsBelow",
		...(statusAbove ? [] : ["footer"]),
	];
	const transient = ["pending", "status"];
	const sticky = config.stickyQuestion === "on" ? ["sticky"] : [];
	const outer = config.padOuter > 0 ? ["pad"] : [];
	// "below-prompt" means between the prompt and the transcript, where the answer appears.
	const inner = config.spinner === "below-prompt" ? [...promptBlock, ...transient] : [...transient, ...promptBlock];
	return config.dock === "top" ? [...outer, ...inner, ...sticky] : [...sticky, ...inner, ...outer];
}

export function configFile(env: Record<string, string | undefined> = process.env): string {
	const agentDir = env.PI_CODING_AGENT_DIR?.trim();
	return resolve(agentDir ? agentDir : resolve(homedir(), ".pi", "agent"), "pi-reverse.json");
}

export function readConfig(file = configFile()): ReverseConfig {
	try {
		return sanitize(JSON.parse(readFileSync(file, "utf8")));
	} catch {
		return { ...DEFAULTS };
	}
}

/** Unknown keys and bad values fall back to the default rather than breaking the layout. */
export function sanitize(raw: unknown): ReverseConfig {
	const input = (raw ?? {}) as Partial<Record<keyof ReverseConfig, unknown>>;
	const pick = <K extends keyof ReverseConfig>(key: K, allowed: readonly string[]): ReverseConfig[K] =>
		(typeof input[key] === "string" && allowed.includes(input[key] as string)
			? input[key]
			: DEFAULTS[key]) as ReverseConfig[K];
	const count = (key: "padOuter" | "padTransient" | "tailMargin"): number => {
		const value = Number(input[key]);
		return Number.isInteger(value) && value >= 0 && value <= 5 ? value : DEFAULTS[key];
	};
	// "screen"/"same" or a line count; anything else falls back to the default.
	const lines = <K extends "answerLines" | "olderLines">(key: K, keyword: string): ReverseConfig[K] => {
		const value = input[key];
		if (value === keyword || value === "screen") return value as ReverseConfig[K];
		if (typeof value === "string" && /^\d{1,3}%$/.test(value)) {
			const percent = Number.parseInt(value, 10);
			if (percent >= 10 && percent <= 100) return value as ReverseConfig[K];
			return DEFAULTS[key];
		}
		const count = Number(value);
		return (Number.isInteger(count) && count >= 3 && count <= 200 ? count : DEFAULTS[key]) as ReverseConfig[K];
	};
	return {
		dock: pick("dock", ["top", "bottom"]),
		order: pick("order", ["newest-first", "oldest-first"]),
		statusBar: pick("statusBar", ["above-prompt", "below-prompt"]),
		padOuter: count("padOuter"),
		padTransient: count("padTransient"),
		followTail: pick("followTail", ["on", "off"]),
		tailMargin: count("tailMargin"),
		stickyQuestion: pick("stickyQuestion", ["on", "off"]),
		turnDivider: pick("turnDivider", ["on", "off"]),
		spinner: pick("spinner", ["below-prompt", "above-prompt"]),
		answerWindow: pick("answerWindow", ["screen", "off"]),
		answerLines: lines("answerLines", "screen"),
		olderLines: lines("olderLines", "same"),
		wheelZone: pick("wheelZone", ["left", "right", "full", "off"]),
		wheelChain: pick("wheelChain", ["on", "off"]),
	};
}
