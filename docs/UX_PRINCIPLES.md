# Havelio UX Principles

Permanent behavioral rules for the product — how Havelio behaves, as
distinct from [`BRAND_GUIDELINES.md`](BRAND_GUIDELINES.md) (how it
looks) and [`UI_PATTERNS.md`](UI_PATTERNS.md) (how each component is
built). Every rule below exists because a real product decision
already depends on it, or because its absence would visibly
contradict Havelio's stated brand personality (professional,
trustworthy, calm, precise). Future work updates this document before
it contradicts one of these rules — see
[`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md)'s "documentation as
part of implementation" principle, applied here to UX.

1. **Every important action is undoable whenever the underlying data
   model allows it.** Where an action truly can't be undone (deleting
   a customer record, converting a quote), the UI compensates with an
   explicit Confirmation Dialog (see `UI_PATTERNS.md`) instead of a
   silent "undo" affordance that doesn't actually exist — never imply
   reversibility that isn't real.

2. **Never hide a destructive action behind an extra click that only
   exists to hide it.** A delete/cancel/revoke action is placed where
   a user would look for it, clearly labeled, and protected by a
   Confirmation Dialog — not buried three menus deep "for safety."
   Confirmation, not concealment, is how Havelio prevents accidents.

3. **Always show loading feedback for anything that takes longer than
   `--duration-base` (150ms).** A user should never wonder whether
   their click registered. See `UI_PATTERNS.md`'s Loading/Skeletons
   patterns for the specific treatment.

4. **Never block the user unnecessarily.** A full-page loading
   overlay is used only for an initial auth/session check — never for
   an action that only affects one region of the page (see
   `UI_PATTERNS.md`'s Error states: "isolate the error to the failed
   region only" applies equally to loading).

5. **Never surprise the user.** No action changes something the user
   didn't ask it to change (e.g. submitting a filter never also
   resets pagination to page 1 silently without visibly refreshing
   the visible list — the state change must be visibly reflected).
   No destructive side effect happens as a side effect of an
   unrelated action.

6. **Maximum 3 clicks/taps to any common action from the app's home
   screen.** Booking a rental, creating a quote, finding a customer —
   the primary navigation plus one page-level action must reach these
   in 3 or fewer interactions. If a common action needs a 4th click,
   that's a navigation-architecture problem to fix, not a UX detail to
   accept.

7. **Forms auto-save only where the cost of losing the draft would be
   disproportionate to the task's frequency** — today, no form
   auto-saves (every create/edit flow is explicit-submit); this rule
   exists so a future long-lived draft (e.g. a lengthy document
   template edit) is a deliberate, documented exception rather than
   an inconsistent surprise on one screen and not another.

8. **Keyboard shortcuts are consistent across the whole product, never
   redefined per page.** A shortcut means the same thing everywhere
   it's active, or it isn't bound at all on a page where it would mean
   something else. (No global shortcut set exists yet — this rule
   governs TASK-0010's Command Palette/shortcut work so it ships
   consistent from the first shortcut, not retrofitted later.)

9. **Dialog behavior is identical everywhere.** Every dialog traps
   focus, closes on `Escape` (except mid-destructive-submit), returns
   focus to its trigger on close, and defaults focus to the _safe_
   action, never the destructive one. See `UI_PATTERNS.md`'s Dialogs/
   Confirmation dialogs.

10. **Table behavior is identical everywhere.** Sorting, row hover,
    pagination shape (`{ items, total, page, pageSize }`), and empty/
    loading/error treatment are the same on every list page — a user
    who's learned one table has learned all of them.

11. **Filtering is always additive and always visibly reversible.** A
    user can always see which filters are active and always has a
    one-click way to clear them (see `UI_PATTERNS.md`'s Filters).

12. **Sorting never silently changes what's selected.** If rows can be
    selected (bulk actions — not yet built anywhere, but this rule
    pre-commits the behavior), changing sort order never deselects or
    reassigns a selection to different rows.

13. **Search is always debounced, never fires on every keystroke**
    (300ms, per `UI_PATTERNS.md`), and always has a visible "no
    results" state distinct from "no records exist yet" — the copy
    must tell the user which situation they're in.

14. **Pagination controls disappear when there's nothing to paginate**
    (`total === 0`) rather than rendering a disabled, confusing
    "page 1 of 0."

15. **Validation happens as early as it can be correct, and never
    later than submission.** Where a field's validity doesn't depend
    on another field (e.g. email format), validate on blur. Where it
    does (e.g. "end date after start date"), validate once both are
    present. Never validate only after a failed server round-trip
    when the client already had enough information to catch it.

16. **Every notification — toast, in-app notification, or email — uses
    the same tone and the same underlying event vocabulary.** A
    "rental extended" event reads the same whether it's a toast to
    the staff member who approved it or a portal notification to the
    customer who requested it, adjusted only for audience (see
    `BRAND_GUIDELINES.md`'s Voice section on the Customer Portal being
    "warmer, never less precise").

17. **Permissions are enforced by omission, not by disabling.** A
    control the current user cannot use is not shown at all, rather
    than shown disabled with no explanation — a disabled button with
    no reason reads as broken software, not as "you don't have
    access." (The one exception, `UI_PATTERNS.md`'s Permission Denied
    state, exists only for the residual case of a stale client-side
    permission snapshot disagreeing with the server.)

18. **Loading indicators never block the surrounding UI from being
    read or navigated away from**, unless the action genuinely can't
    be interrupted safely (e.g. mid-file-upload) — and even then, the
    rest of the page outside that control stays interactive.

19. **Empty states are never dead ends.** Every empty state includes
    at least one actionable next step (see `BRAND_GUIDELINES.md`'s
    five-part empty-state anatomy) — a screen with only "Nothing
    here." and no action is never acceptable.

20. **Success messages are specific and past-tense, never generic.**
    "Rental reserved" beats "Success." A user should be able to read
    only the toast and know exactly what happened, without looking
    back at the page.

21. **Destructive confirmations name the specific record and the
    specific consequence, never a generic "Are you sure?"** — see
    `UI_PATTERNS.md`'s Confirmation dialogs.

22. **The client never computes and displays a number as if it were
    final when the server is the actual source of truth for it.**
    Every client-side pricing estimate is visually and behaviorally
    understood by the user as a preview (per
    `ARCHITECTURE_LOCK.md` 1.3) — in practice, this means an estimate
    is never shown with the same visual weight/certainty as a
    server-confirmed total once one exists.

23. **Data formatting is consistent across the entire product.** Money
    always renders via the same `formatMoney` helper (never a
    per-page ad hoc `toFixed(2)`); dates always render via the same
    locale-aware formatting; a genuinely inapplicable field always
    renders as an em dash "—", never blank, "N/A", "null", or "-".

24. **A record's status is always shown the same way everywhere it
    appears** — the same label text (translated), the same
    color-coding, whether it's in a table row, a detail-page header,
    or a dashboard card.

25. **Dense data (tables, financial summaries) favors clarity over
    friendliness; sparse data (empty states, onboarding) favors
    warmth over density.** Havelio calibrates tone to the task, not
    the audience — the same operator gets terse table copy and a
    friendlier empty-state headline in the same session, deliberately.

26. **Every irreversible or hard-to-notice mistake is prevented before
    it happens where that's feasible, not just explained after.** The
    date-picker rule in `UI_PATTERNS.md` (an end date before the start
    date simply can't be selected) is the model: prevention beats a
    validation error message whenever the interaction allows it.

27. **A user is never asked to re-enter information the system already
    has.** A wizard step never asks for a customer's name again after
    step 1 selected them; an edit form is always pre-populated with
    current values.

28. **Errors are actionable or they name a clear next step (e.g. "try
    again," "contact support," "go back") — never a dead-end technical
    message.** A raw stack trace or a bare HTTP status code is never
    shown to a user; see `BRAND_GUIDELINES.md`'s Voice rules for the
    exact tone.

29. **The interface never asks the user to confirm something they
    just explicitly did via a deliberate, unambiguous action** (e.g.
    typing a full record name into a delete-confirmation field is
    reserved for the single highest-stakes actions only — tenant
    deletion, were it ever built — not applied reflexively to every
    delete button, which would violate rule 6's click-budget for
    routine actions).

30. **Consistency beats local optimization.** A screen-specific
    "better" pattern that diverges from an established one elsewhere
    in the product is rejected by default — per
    `BRAND_GUIDELINES.md`'s Brand Rules, a new pattern is added to
    `UI_PATTERNS.md` and applied everywhere it's relevant, not shipped
    as a one-off.

---

## How these rules are enforced

None of these are automatically checked by CI today — they're
enforced by code review against this document, the same way
`ARCHITECTURE_LOCK.md`'s architectural principles are. A future
reliable, low-false-positive automated check (e.g. a lint rule
banning `window.confirm` once a real Confirmation Dialog component
exists, to enforce rule 9) should be added the same way the
governance safeguards in `scripts/` were — see `DECISIONS.md` D-040
for that precedent — rather than left as an unenforced document
forever.
