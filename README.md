# pi-reverse

Reverse mode for the [pi coding agent](https://pi.dev): **input pinned to the top**, Q&A pairs
stacked **downward, newest first**, each pair still read normally — question, then its answer.

Named after Warp's *reverse mode*, which does the same for command blocks. This is the first one
for an agent conversation: VS Code refused the equivalent request for Copilot Chat (issue #12321,
closed out-of-scope, Dec 2025).

```text
  [ status bar ]
  [ input ]
  ▲ Q-BETA: list numbers 1 to 60          ← sticky question while its answer scrolls
  58
  59
  60
  ──────────────────────────────────────  ← rule between pairs
  Q-ALPHA: reply exactly: ALPHA-ANSWER
  ALPHA-ANSWER
```

It is a plain pi extension — no fork, no patched install, survives `pi update`.

## Install

```bash
pi install ~/Code/pi-reverse          # adds it to settings
pi -e ~/Code/pi-reverse               # or load once, nothing written
```

Requires fullscreen TUI mode: `{"tuiMode": "fullscreen"}` in `~/.pi/agent/settings.json`, or
`pi --tui-mode fullscreen`. In regular mode pi renders into the terminal's own scrollback, which
can only grow at the bottom — no extension can pin a top row there, and pi-reverse declines with a
warning instead of half-applying.

## Moving around

| | |
|---|---|
| `alt+j` / `/reverse next` | top of the next (older) Q&A pair |
| `alt+k` / `/reverse prev` | top of the previous pair — mid-pair it returns to that pair's question first |
| `alt+l` / `/reverse tail` | end of the answer being written |
| `/reverse question` | back to the newest question |
| `alt+,` / `alt+.` | scroll inside the newest answer's window |
| `alt+e` / `/reverse expand` | show that answer at full height, or re-window it |
| `alt+w` / `/reverse window` | turn answer windows on or off |

## Long answers get one screenful

The newest answer gets **70% of the pane**, so the next pair stays in sight below it; **older pairs
shrink to a 6-line preview**, so several
question/answer pairs fit on one screen and it stays easy to focus on one of them. Both heights are
settings (`answer-lines`, `older-lines`). Heights are measured from the terminal on every frame, so
splitting or resizing a tmux pane resizes the windows with it — down to a 5-line floor, below which
the transcript simply scrolls.

An answer longer than its height renders as a window anchored at its **end**, so the conclusion
sits next to the question instead of a screen-and-a-half below it. A dim marker says how much is
hidden. The window follows the text while it streams, and stops following the moment you scroll
inside it — scroll back to the bottom and it follows again.

**Mouse wheel inside an answer needs pi ≥ the fix in
[earendil-works/pi#9538](https://github.com/earendil-works/pi/issues/9538).** pi's `ScrollView`
does not forward mouse events to its content, so on an unpatched pi the wheel only moves the
transcript; the keyboard controls above work everywhere.

## Settings

`/reverse` shows them all; every change applies immediately and persists to
`<agent-dir>/pi-reverse.json`.

| option | values | default | what it does |
|---|---|---|---|
| `dock` | `top` `bottom` | `top` | which screen edge the prompt block sits on |
| `order` | `newest-first` `oldest-first` | `newest-first` | transcript direction |
| `status-bar` | `above-prompt` `below-prompt` | `above-prompt` | status bar side |
| `spinner` | `below-prompt` `above-prompt` | `below-prompt` | where the working spinner and queued messages go |
| `answer-lines` | `70%`, `screen`, or `3..200` | `70%` | height of the newest answer |
| `older-lines` | `same` or `3..200` | `6` | height of answers in older pairs |
| `sticky-question` | `on` `off` | `on` | keep the question on screen once it scrolls away |
| `turn-divider` | `on` `off` | `on` | rule between Q&A pairs |
| `follow-tail` | `on` `off` | `on` | chase a streaming answer instead of letting it grow past the fold |
| `tail-margin` | `0..5` | `1` | lines kept below the streaming line |
| `pad-outer` | `0..5` | `1` | blank lines at the screen edge |
| `pad-transient` | `0..5` | `1` | breathing room around the spinner |

`/reverse flip` swaps top/bottom, `/reverse reset` restores defaults.

## How it works

pi's fullscreen layout root is a `VStack [transcript, dock]` built from seven mounted regions
(document, pending, status, widgets-above, editor, widgets-below, footer). pi-reverse rebuilds that
root in the order you configure, and feeds the transcript a mirror container that groups the chat
log into turns — a turn starts at each user question — and reverses the **groups**, never their
contents.

## Known limits

- **Leans on pi internals** (the seven mounted regions, and `UserMessageComponent` as the marker for
  "a turn starts here"). If a pi release changes that shape, pi-reverse refuses to apply and prints
  a warning rather than breaking the UI.
- **Flipping resets the scroll position** — a fresh scroll view is built each time.
- The startup "Update Available" notice renders its three lines reversed; it arrives after the
  layout is applied, and pi adds it as separate children rather than one component.
- Verified against pi 0.84.2 and 0.85.1.

## Tests

```bash
node test.mjs      # layout order, turn grouping, jump targets, config validation
```
