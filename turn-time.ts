/** Timestamp matching — no TUI imports, so `node test.mjs` can exercise it directly. */

export interface QuestionRecord {
	text: string;
	at: number;
}

export interface MatchedQuestionTime {
	at: number | undefined;
	previous: number | undefined;
}

function normalized(text: string): string {
	return text.replace(/\r\n?/g, "\n").trim().replace(/[ \t]+/g, " ");
}

/** Extract the text blocks from a pi message without depending on pi's message types. */
export function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) =>
			typeof block === "object" && block !== null && "text" in block ? String((block as { text: unknown }).text) : "",
		)
		.filter(Boolean)
		.join("\n");
}

type Pool = Array<{ at: number; previous: number | undefined }>;

/**
 * The session's questions, indexed by text so a visible turn can find its own timestamp.
 *
 * A resumed/compacted transcript is only a suffix of the full history, so positional indexes are
 * wrong; matching on text is what makes a resumed session read correctly. But the history is up to
 * ten thousand messages and the index costs 65 ms to build, so it is built ONCE and extended as
 * the session grows — never rebuilt per frame, which is what made every repaint pay for the whole
 * history.
 */
export class QuestionTimes {
	private readonly pools = new Map<string, Pool>();
	private indexed = 0;
	private firstAt: number | undefined;
	private lastAt: number | undefined;

	/** Take in the session's records. Appending costs only the new ones; a replaced history rebuilds. */
	sync(recordsOldestFirst: readonly QuestionRecord[]): void {
		// Compaction can replace the history rather than extend it: shorter, or a different beginning.
		// The END is checked too, so a rewind that regrows to the same length — and any rewrite that
		// reaches the newest message — is caught rather than served from a stale index.
		const replaced =
			recordsOldestFirst.length < this.indexed ||
			recordsOldestFirst[0]?.at !== this.firstAt ||
			(this.indexed > 0 && recordsOldestFirst[this.indexed - 1]?.at !== this.lastAt);
		if (replaced) {
			this.pools.clear();
			this.indexed = 0;
			this.firstAt = recordsOldestFirst[0]?.at;
		}
		for (let i = this.indexed; i < recordsOldestFirst.length; i++) {
			const record = recordsOldestFirst[i];
			const key = normalized(record.text);
			if (!key) continue;
			const pool = this.pools.get(key);
			const entry = { at: record.at, previous: recordsOldestFirst[i - 1]?.at };
			if (pool) pool.push(entry);
			else this.pools.set(key, [entry]);
		}
		this.indexed = recordsOldestFirst.length;
		this.lastAt = recordsOldestFirst[this.indexed - 1]?.at;
	}

	/**
	 * Timestamps for the visible turns, newest first. Costs one lookup per VISIBLE turn — the screen's
	 * worth of work, not the session's. A cursor per text walks each pool backwards so repeated
	 * questions ("go") take the newest unclaimed one, without consuming the index itself.
	 */
	match(questionsNewestFirst: readonly string[]): MatchedQuestionTime[] {
		const cursor = new Map<string, number>();
		return questionsNewestFirst.map((question) => {
			const key = normalized(question);
			const pool = this.pools.get(key);
			if (!pool) return { at: undefined, previous: undefined };
			const next = (cursor.get(key) ?? pool.length) - 1;
			cursor.set(key, next);
			const hit = next >= 0 ? pool[next] : undefined;
			// A COPY, not the stored entry. The old code handed out an object it had just removed from
			// the pool, so a caller writing to it harmed nothing; this index keeps its entries, and
			// handing out a reference would let one careless consumer corrupt every later frame.
			return hit === undefined ? { at: undefined, previous: undefined } : { at: hit.at, previous: hit.previous };
		});
	}
}

/** Convenience for tests and one-shot callers: index and match in one go. */
export function matchQuestionTimes(
	questionsNewestFirst: readonly string[],
	recordsOldestFirst: readonly QuestionRecord[],
): MatchedQuestionTime[] {
	const times = new QuestionTimes();
	times.sync(recordsOldestFirst);
	return times.match(questionsNewestFirst);
}
