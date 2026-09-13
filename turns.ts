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
	// No question yet (startup banner): every child is its own group, so the whole log simply reverses.
	if (!children.some(isQuestion)) return children.map((child) => [child]);
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

