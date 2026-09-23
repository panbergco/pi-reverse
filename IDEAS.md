# Future ideas

Parked work for pi-reverse, with the evidence behind each. Nothing here is scheduled.

## Next in the product

1. **Jump-to-latest cue.** One dim line when the reader is away from the live edge, with a count of
   lines that arrived while they were reading. Warp shipped the same thing as a "Jump to bottom of
   this block" button plus `cmd-shift-down` for exactly this layout. (~1h)
2. **Release follow on any interaction, not just the wheel.** Text selection, page keys, search and
   link-opening should all stop the view from moving. This is rule 3 of the shadcn streaming-chat
   contract. (~1h)
3. **Verify pi's alt-screen search (`ctrl+shift+f`) against the reordered transcript.** Untested, and
   the most likely thing to be quietly broken: search jumps to a scroll offset that the mirror has
   reordered. (~30m)
4. **Sticky question: toggle, and never cover the first line of the answer.** Warp's #6549 is exactly
   this bug in their sticky command header; they ended up making it switchable per session. (~30m)
5. **Per-window keys for the answer under the pointer**, instead of only the newest one. (~1h)
6. **Open a resumed session at the last question, not the absolute end.** shadcn's `last-anchor`
   default exists because landing at the bottom drops the reader in without context.

## Reach beyond pi

- **Per-harness ports are expensive.** No other agent harness exposes a layout seam: Claude Code has
  hooks, plugins and a statusline but no layout API; Codex CLI, Crush, Gemini CLI and Aider have
  none. Porting means an upstream PR per project.
- **OSC 133 turn markers are the cheap lever.** Terminals already agree on
  [semantic prompt marks](https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md)
  — `A` prompt start, `B` input, `C` output start, `D;code` end — and 9 of 12 tested terminals parse
  them (iTerm2, Ghostty, WezTerm, Kitty, VS Code, Warp, Zellij). If an agent emitted them per turn in
  **non-fullscreen** mode, every one of those terminals would get jump-between-turns, select-an-answer
  and copy-last-answer for free, and Warp's reverse mode would work on agent conversations.
  Caveat: a fullscreen TUI paints its own cells, so the marks have nothing to attach to — this is the
  route for reach, not for the mode pi-reverse runs in.

## Evidence that people want this

- **Warp** — the only vendor that shipped it: *Reverse mode*, April 2023, after requests since 2022
  (warpdotdev/warp#1412, #22). Its remaining bugs are about sticky headers covering output
  (#6549, #8259), not about the idea.
- **Claude Code** — `inputPosition: "top"` requested in anthropics/claude-code#61876 (May 2026),
  closed by an inactivity bot with no human reply. The sub-problems are filed separately and all open:
  #77004 (no in-message scroll when a long message is expanded), #80720 (no way to collapse long diff
  output), #26954 (expand controls don't fully expand), #92203 (repainted turns lose multiplexer
  scrollback), #90537 (fullscreen sticky prompt bar regression).
- **VS Code Copilot Chat** — same request, microsoft/vscode-copilot-release#12321, closed
  out-of-scope, December 2025.
- **Aider** — users working around it: Aider-AI/aider#2972 (clear the screen every completion),
  #4332 (paging like `less`).
- **The web world wrote the contract**: shadcn's `MessageScroller` and TanStack Virtual's chat mode
  both exist only to solve streaming-scroll, and their open bugs (shadcn-ui/ui#11125, #11181) are the
  traps waiting for anyone who builds this.

## Upstream

- **Resolved without an upstream change.** From pi 0.85.1 the layout dispatcher reaches components
  inside a scroll view, and pi-reverse routes the event to the window under the pointer itself, so the
  inner wheel works on stock pi (verified on 0.85.1 and 0.87.1). pi 0.84.x does not deliver the
  event; there the keyboard controls are the way in. The patch proposed in earendil-works/pi#9538 is
  no longer needed.
