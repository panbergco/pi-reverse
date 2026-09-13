/** Divider label — no TUI imports, so `node test.mjs` can exercise it directly. */

/** A clipped answer always reserves both marker rows, so the pair below it never jumps by a line. */
export function windowEdgeLabels(start: number, hiddenBelow: number, wheelHint: string): [string, string] {
	const above =
		start > 0 ? `  ⋯ ${start} line${start === 1 ? "" : "s"} above · ${wheelHint} · alt+e expands` : "";
	const below = hiddenBelow > 0 ? `  ⋯ ${hiddenBelow} below · wheel down to follow again` : "";
	return [above, below];
}

/** "14:32 · 2h ago", or the gap when a turn follows a long pause. Empty stamp means unknown. */
export function dividerLabel(stamp: number | undefined, previous: number | undefined, now: number): string {
	if (stamp === undefined) return "time unknown";
	const clock = new Date(stamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	const age = now - stamp;
	const day = 24 * 60 * 60 * 1000;
	const when =
		age < 60_000
			? "just now"
			: age < 60 * 60_000
				? `${Math.round(age / 60_000)}m ago`
				: age < day
					? `${Math.round(age / 3_600_000)}h ago`
					: new Date(stamp).toLocaleDateString([], { month: "short", day: "numeric" });
	const gap = previous === undefined ? 0 : stamp - previous;
	if (gap >= 60 * 60_000) {
		const later = gap >= day ? `${Math.round(gap / day)}d later` : `${Math.round(gap / 3_600_000)}h later`;
		return `${later} · ${clock}`;
	}
	return `${clock} · ${when}`;
}
