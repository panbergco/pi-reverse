/** Turn grouping — no TUI imports, so `node test.mjs` can exercise it directly. */

/** Anything the TUI can render; only the class name is inspected here. */
type Renderable = { constructor?: { name?: string } };

/** A turn starts at the user's question; everything after it (answer, tools) belongs to that turn. */
export function isQuestion(component: Renderable): boolean {
	return component?.constructor?.name === "UserMessageComponent";
}

/**
 * Newest turn first, each turn still read normally: question, then its answer.
 * Groups children into turns at each question and reverses the GROUPS, never their contents.
 */
export function reverseTurns(children: readonly Renderable[]): Renderable[] {
	return groupTurns(children).reverse().flat();
}

/** Turns in chronological order; the last one is the newest (the one being answered). */
export function groupTurns(children: readonly Renderable[]): Renderable[][] {
	// No question yet (startup banner): one group, so nothing is reversed and no rule is drawn
	// between pieces of the banner.
	if (!children.some(isQuestion)) return children.length > 0 ? [[...children]] : [];
	const turns: Renderable[][] = [];
	let current: Renderable[] = [];
	for (const child of children) {
		if (isQuestion(child) && current.length > 0) {
			// A blank line before a question separates the turns, so it leads the new one.
			const trailing = current[current.length - 1];
			const lead = trailing?.constructor?.name === "Spacer" ? [current.pop() as Renderable] : [];
			if (current.length > 0) turns.push(current);
			current = [...lead];
		}
		current.push(child);
	}
	if (current.length > 0) turns.push(current);
	return turns;
}

/** Offset of the turn to land on when moving `step` turns from the current scroll position. */
export function nextTurnOffset(offsets: readonly number[], scrollTop: number, step: 1 | -1): number | undefined {
	if (offsets.length === 0) return undefined;
	// "Current" is the last turn whose top is at or above the viewport top.
	let current = 0;
	for (let i = 0; i < offsets.length; i++) {
		if (offsets[i] <= scrollTop + 1) current = i;
	}
	// Sitting mid-turn and going back means returning to this turn's own question first.
	if (step === -1 && scrollTop > offsets[current] + 1) return offsets[current];
	const target = current + step;
	return target >= 0 && target < offsets.length ? offsets[target] : undefined;
}


/**
 * Who acts on a wheel event: the window under the pointer, or the transcript behind it.
 *
 * `wheel-chain off` exists so reaching the end of an answer does not fling the transcript away in
 * the middle of a gesture. Absorbing EVERY event at that edge does more than that: a window resting
 * at its edge under the pointer owns that half of the pane for good, and the reader cannot scroll
 * back to the prompt at all. One event is absorbed, and the rest pass through.
 */
export function wheelGoesTo(
	moved: boolean,
	clipped: boolean,
	chains: boolean,
	blocked: number,
): "window" | "transcript" {
	if (moved) return "window";
	if (!clipped || chains) return "transcript";
	return blocked < 1 ? "window" : "transcript";
}
