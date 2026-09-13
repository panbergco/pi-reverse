/** Divider label — no TUI imports, so `node test.mjs` can exercise it directly. */

/**
 * A clipped window always reserves both marker rows, so the pair below it never jumps by a line.
 *
 * An answer rests at its end, so its hint rides the marker ABOVE. A question rests at its first
 * line, so the unread part is below it and the hint rides that marker instead — and "follow again"
 * would be nonsense on a question, which is not streaming anywhere.
 */
export function windowEdgeLabels(
	start: number,
	hiddenBelow: number,
	wheelHint: string,
	fromTop = false,
): [string, string] {
	const plural = (n: number) => (n === 1 ? "" : "s");
	if (fromTop) {
		return [
			start > 0 ? `  ⋯ ${start} line${plural(start)} above` : "",
			hiddenBelow > 0 ? `  ⋯ ${hiddenBelow} more line${plural(hiddenBelow)} · ${wheelHint} · alt+e expands` : "",
		];
	}
	const above = start > 0 ? `  ⋯ ${start} line${plural(start)} above · ${wheelHint} · alt+e expands` : "";
	const below = hiddenBelow > 0 ? `  ⋯ ${hiddenBelow} below · wheel down to follow again` : "";
	return [above, below];
}

// Built once. `toLocaleTimeString` with options constructs a formatter on every call — measured at
// 3.95 ms per frame for a screen of seams, against 0.37 ms when the formatter is hoisted.
const CLOCK = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });

/** "14:32 · 2h ago", or the gap when a turn follows a long pause. Empty stamp means unknown. */
export function dividerLabel(stamp: number | undefined, previous: number | undefined, now: number): string {
	if (stamp === undefined) return "time unknown";
	const clock = CLOCK.format(stamp);
	const age = now - stamp;
	const day = 24 * 60 * 60 * 1000;
	const when =
		age < 60_000
			? "just now"
			: age < 60 * 60_000
				? `${Math.round(age / 60_000)}m ago`
				: age < day
					? `${Math.round(age / 3_600_000)}h ago`
					: DATE.format(stamp);
	const gap = previous === undefined ? 0 : stamp - previous;
	if (gap >= 60 * 60_000) {
		const later = gap >= day ? `${Math.round(gap / day)}d later` : `${Math.round(gap / 3_600_000)}h later`;
		return `${later} · ${clock}`;
	}
	return `${clock} · ${when}`;
}
