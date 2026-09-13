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

/**
 * Match visible turns (newest first) to the session's user messages (oldest first) by question text.
 * A resumed/compacted transcript contains only a suffix of the full history, so positional indexes
 * are wrong. Popping from each text's chronological pool also handles repeated questions like "go".
 */
export function matchQuestionTimes(
	questionsNewestFirst: readonly string[],
	recordsOldestFirst: readonly QuestionRecord[],
): MatchedQuestionTime[] {
	const pools = new Map<string, Array<{ at: number; previous: number | undefined }>>();
	for (let i = 0; i < recordsOldestFirst.length; i++) {
		const record = recordsOldestFirst[i];
		const key = normalized(record.text);
		if (!key) continue;
		const pool = pools.get(key) ?? [];
		pool.push({ at: record.at, previous: recordsOldestFirst[i - 1]?.at });
		pools.set(key, pool);
	}
	return questionsNewestFirst.map((question) => {
		const match = pools.get(normalized(question))?.pop();
		return match ?? { at: undefined, previous: undefined };
	});
}
