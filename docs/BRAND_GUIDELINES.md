# Havelio Brand Guidelines

This document is the permanent visual identity of Havelio. It is not
a suggestion — every screen, document, email, and future client
(web, mobile, public site) must trace its visual decisions back to
this file. If a future change needs a color, spacing value,
typeface, radius, shadow, or motion curve that isn't here, **this
document is updated first**, and only then is the implementation
changed. See [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) — this
file governs the "UI visual design" extensible area named there.

All tokens described below are implemented as CSS custom properties
in [`packages/ui/src/styles/theme.css`](../packages/ui/src/styles/theme.css)
and exposed as Tailwind utilities via that file's `@theme inline`
block. Every hex value, spacing step, and radius named in this
document has a corresponding token in that file — treat any
mismatch between the two as a bug in whichever one is wrong, not as
license to hardcode a value in a component.

## Brand philosophy

Havelio is a premium business operating system for rental companies
— not a consumer app, not a toy, not a marketing site dressed up as
software. Every visual decision serves one goal: make a professional
operator feel that the software is as precise and dependable as the
business decisions they're making inside it.

**Havelio is:**

Professional · Trustworthy · Calm · Modern · Premium · Intelligent ·
Minimal · Precise · Efficient

**Havelio is never:** playful, cute, "corporate" in the beige/navy
enterprise-software sense, cluttered, loud, or trend-chasing. No
mascots, no illustrations of people, no confetti, no bouncy motion,
no gradients used decoratively, no more than one accent color on a
screen at a time.

The test for every new screen, illustration, or copy line: **would
this feel out of place next to Stripe's dashboard, Linear's issue
tracker, or a Vercel deployment page?** If yes, it doesn't belong in
Havelio, regardless of how polished it looks in isolation.

---

## Color system

### Why this palette

The primary brand color is a deep, desaturated teal-blue we call
**Havelio Petrol**. It was chosen deliberately to sit outside the
violet/indigo family Stripe and Linear both occupy, and outside the
near-monochrome family Notion occupies — so Havelio reads as its own
product at a glance, not "another one of those." Petrol also reads
as calm and precise rather than energetic, which fits "calm" and
"trustworthy" better than a brighter blue or violet would.

Petrol is deliberately **not** green, even though green would be a
natural "trust/growth/finance" association for a rental/asset
platform — reserving green exclusively for the `Success` semantic
color means a status badge can never be visually confused with a
primary call-to-action. Precision over cleverness.

The accent color, a muted copper, is the one deliberate warm note in
an otherwise cool palette — used sparingly (secondary emphasis,
chart series 2), never for primary actions, never covering more than
a small fraction of any screen.

### Primary

| Token                    | Hex       | Usage                                                                         |
| ------------------------ | --------- | ----------------------------------------------------------------------------- |
| `--color-primary`        | `#0E6C8C` | Primary buttons, active nav item, links, checked states, focus ring           |
| `--color-primary-hover`  | `#0B5A76` | `:hover` state of anything using Primary                                      |
| `--color-primary-active` | `#094A61` | `:active`/pressed state — the darkest step                                    |
| `--color-primary-light`  | `#E1F1F6` | Tinted backgrounds: selected table rows, info badges, subtle highlights       |
| `--color-primary-dark`   | `#052733` | Reserved for high-contrast contexts (e.g. text on a light-primary background) |

### Accent

| Token            | Hex       | Usage                                                                                           |
| ---------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `--color-accent` | `#C97A3D` | Secondary emphasis only: a second chart series, a rare secondary badge. Never a primary button. |

### Neutral scale

A cool gray with a faint petrol undertone, so grays never visually
fight the brand color the way a pure or warm gray would.

| Token                 | Hex       |
| --------------------- | --------- |
| `--color-neutral-50`  | `#F7F9FA` |
| `--color-neutral-100` | `#EEF2F4` |
| `--color-neutral-200` | `#DEE5E8` |
| `--color-neutral-300` | `#C3CDD2` |
| `--color-neutral-400` | `#97A5AB` |
| `--color-neutral-500` | `#6B7A80` |
| `--color-neutral-600` | `#4C5A60` |
| `--color-neutral-700` | `#374347` |
| `--color-neutral-800` | `#232D30` |
| `--color-neutral-900` | `#141B1D` |
| `--color-neutral-950` | `#0A0E10` |

### Surface roles

| Token        | Light     | Dark                     | Usage                                                                               |
| ------------ | --------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `Background` | `#F7F9FA` | `#0A0E10`                | The page canvas behind everything                                                   |
| `Surface`    | `#FFFFFF` | `#141B1D`                | Cards, panels, dialogs, popovers, table rows                                        |
| `Sidebar`    | `#EEF2F4` | `#0F1517`                | The app sidebar/nav rail — one step off Background for depth without a heavy border |
| `Borders`    | `#DEE5E8` | `rgb(255 255 255 / 10%)` | Dividers, input borders, card borders                                               |
| `Text`       | `#141B1D` | `#F7F9FA`                | Primary reading text                                                                |
| `Muted`      | `#6B7A80` | `#97A5AB`                | Secondary text: captions, timestamps, helper text                                   |

### Semantic colors

Each semantic color is a genuinely distinct hue from Primary and
from every other semantic color — status can never be mistaken for
a brand action, and no two statuses can be confused with each other
at a glance (including for common forms of color-vision deficiency,
since hue, not just saturation, differs between all four).

| Token             | Hex       | Light background | Usage                                           |
| ----------------- | --------- | ---------------- | ----------------------------------------------- |
| `--color-danger`  | `#D64545` | `#FBEAEA`        | Destructive actions, errors, failed states      |
| `--color-warning` | `#C98A1E` | `#FBF1DF`        | Caution states, expiring items, needs-attention |
| `--color-success` | `#1E9A5A` | `#E4F7EC`        | Completed, confirmed, signed, paid              |
| `--color-info`    | `#3B82C4` | `#E8F2FA`        | Neutral informational banners, tips             |

None of these is "loud" — all four are deliberately muted enough to
sit calmly in a dense data table without turning it into a traffic
light. Full saturation is reserved for the rare case of a single
prominent alert banner.

### Dark mode

Dark mode is a first-class target, not an inverted afterthought.
`Primary` lightens to `#3FA0C2` in dark mode specifically to hold
AA contrast against the near-black `#0A0E10` background — the same
hue, adjusted lightness only, so the brand still reads as the same
color. Shadows deepen (see "Shadow System") rather than disappear,
since dark surfaces still need elevation cues.

---

## Typography

### Font family

- **UI text:** [Inter](https://rsms.me/inter/) (variable font),
  loaded via `next/font/google` in `apps/web/src/app/layout.tsx` —
  self-hosted at build time, no runtime request to Google, no
  render-blocking network call. Inter was chosen for genuinely
  practical reasons, not fashion: true tabular figures (critical for
  the rental/pricing tables and financial summaries this product is
  full of), and broad Cyrillic/Latin-Extended coverage matching all
  six shipped locales (`en`, `ru`, `uk`, `de`, `pl`, `es`) from one
  font file.
- **Monospace:** JetBrains Mono, same loading strategy. Used for
  document numbers, rental numbers, IDs, and anything else that
  benefits from fixed-width alignment — never for body prose.
- **Token:** `font-sans` / `font-mono` Tailwind utilities, backed by
  `--font-sans` / `--font-mono` in `theme.css`. Never reference a
  font family by name in a component.

### Weights

Only three weights are used anywhere in the product:

| Weight   | Value | Usage                                      |
| -------- | ----- | ------------------------------------------ |
| Regular  | 400   | Body text, table cells, form input values  |
| Medium   | 500   | Labels, table headers, buttons, nav items  |
| Semibold | 600   | Page titles, card titles, section headings |

Bold (700) is deliberately not used — at Havelio's information
density, bold text reads as shouting. Semibold is the ceiling.

### Sizes, line heights, letter spacing

| Role                 | Size               | Line height | Letter spacing                               | Weight   |
| -------------------- | ------------------ | ----------- | -------------------------------------------- | -------- |
| Page title (H1)      | 24px / `text-2xl`  | 32px        | −0.01em                                      | Semibold |
| Section heading (H2) | 18px / `text-lg`   | 28px        | −0.005em                                     | Semibold |
| Card title (H3)      | 16px / `text-base` | 24px        | normal                                       | Semibold |
| Body                 | 14px / `text-sm`   | 20px        | normal                                       | Regular  |
| Caption / helper     | 12px / `text-xs`   | 16px        | normal                                       | Regular  |
| Table header         | 12px / `text-xs`   | 16px        | 0.02em (slight tracking, uppercase optional) | Medium   |
| Table cell           | 14px / `text-sm`   | 20px        | normal                                       | Regular  |
| Form label           | 14px / `text-sm`   | 20px        | normal                                       | Medium   |
| Button               | 14px / `text-sm`   | 20px        | normal                                       | Medium   |
| Navigation item      | 14px / `text-sm`   | 20px        | normal                                       | Medium   |
| Dialog title         | 18px / `text-lg`   | 28px        | −0.005em                                     | Semibold |

No custom font sizes outside this list. If a screen seems to need a
new size, it needs a different role from this list applied
correctly, not a new size.

### Examples

```
H1   "Rentals"                              24px / Semibold / Text
H2   "Financial summary"                    18px / Semibold / Text
H3   "RNT-000482"  (card title)             16px / Semibold / Text
Body "3 items, 12 Aug – 19 Aug"             14px / Regular  / Text
Caption "Updated 2 minutes ago"             12px / Regular  / Muted
Table header "RENTAL NUMBER"                12px / Medium   / Muted
Button "Reserve rental"                     14px / Medium   / Primary-foreground
```

---

## Spacing system

Havelio uses Tailwind's default 4px-based spacing scale, restricted
to the following approved steps — this is a deliberate reuse of an
existing, already-shipped scale (per
[`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) 1.4's "no duplicated
logic" spirit applied to design), not a new system:

| Step | Tailwind | Pixels | Use for                                                                  |
| ---- | -------- | ------ | ------------------------------------------------------------------------ |
| 2    | `p-0.5`  | 2px    | Icon-to-text gaps inside a tight badge/chip                              |
| 4    | `p-1`    | 4px    | Space between a label and its input's helper text                        |
| 8    | `p-2`    | 8px    | Space between inline elements (icon + label), compact table cell padding |
| 12   | `p-3`    | 12px   | Default table cell padding, gap between form fields in a tight row       |
| 16   | `p-4`    | 16px   | Card internal padding, gap between stacked form fields                   |
| 20   | `p-5`    | 20px   | Comfortable card padding on larger surfaces                              |
| 24   | `p-6`    | 24px   | Section padding, gap between cards in a grid                             |
| 32   | `p-8`    | 32px   | Page-level padding on desktop, gap between major page sections           |
| 40   | `p-10`   | 40px   | Empty-state vertical padding                                             |
| 48   | `p-12`   | 48px   | Large empty-state / illustration vertical padding                        |
| 64   | `p-16`   | 64px   | Marketing-style or full-page centered layouts (auth pages)               |
| 96   | `p-24`   | 96px   | Reserved — very large hero-style spacing, rare in an app shell           |

Never use an arbitrary Tailwind value (`p-[13px]`) outside this
list. If none of these steps fits, that's a signal to reconsider the
layout, not to invent a thirteenth value.

---

## Border radius

Fixed steps only — never an arbitrary value, never `rounded-full`
outside avatars/dots/pills explicitly called out below.

| Token         | Value | Usage                                                                   |
| ------------- | ----- | ----------------------------------------------------------------------- |
| `--radius-xs` | 2px   | Checkboxes, small chips, tag pills' corner sharpness on dense tables    |
| `--radius-sm` | 4px   | Inputs, buttons, badges                                                 |
| `--radius-md` | 8px   | Cards, dropdowns, popovers, table container                             |
| `--radius-lg` | 12px  | Dialogs, side panels                                                    |
| `--radius-xl` | 16px  | Large surfaces: image frames, the customer portal's rental QR code card |

`rounded-full` is reserved for genuinely circular elements only:
avatars, status dots, and pill-shaped badges — never applied to a
rectangular card or button to "soften" it.

---

## Shadow system

Elevation communicates layering, not decoration — a shadow should
answer "is this floating above the page," never be used as a stylistic
flourish on a flat element.

| Token               | Level    | Usage                                                          |
| ------------------- | -------- | -------------------------------------------------------------- |
| `--shadow-1`        | Level 1  | Cards resting on the page (subtle, almost imperceptible)       |
| `--shadow-2`        | Level 2  | Hovered cards, raised table rows                               |
| `--shadow-3`        | Level 3  | Persistent floating surfaces (e.g. a pinned summary bar)       |
| `--shadow-dropdown` | Dropdown | `<select>`-style menus, command palette results                |
| `--shadow-popover`  | Popover  | Date pickers, filter popovers, context menus                   |
| `--shadow-tooltip`  | Tooltip  | The lightest floating shadow — tooltips sit closest to content |
| `--shadow-modal`    | Modal    | The heaviest shadow — dialogs, confirmation modals             |

Level 0 is the absence of a shadow token — the default resting state
of in-flow content (table cells, plain text, unhovered list rows).

Dark mode shadows use a higher opacity black (`rgb(0 0 0 / …)`
instead of the light-mode `rgb(20 27 29 / …)`) at each level — a
shadow on a near-black background needs more contrast to read at
all, not less.

---

## Icon style

**Chosen icon set: [Lucide](https://lucide.dev/)** (`lucide-react`,
already a dependency of `@rentos/ui`) — reused, not newly introduced,
per the same "one implementation" principle
[`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) applies to business
logic. Lucide is a single coherent icon family already vetted into
this codebase; introducing a second icon library for "just this one
icon" is forbidden.

Rules, all inherited from Lucide's own consistent design and made
mandatory here:

- **Stroke width:** always `1.5` (Lucide's default and the only
  weight ever used — never bold/filled icon variants).
- **Corner radius:** Lucide's default rounded joins — never mix in a
  sharp-cornered icon set.
- **Optical weight:** all icons at the same stroke width read at a
  consistent visual weight against 14px body text; never scale an
  icon up without also increasing its container so the stroke
  doesn't look thin relative to surrounding bold-weight UI chrome.
- **Sizing:** icons are sized in fixed steps tied to their context —
  16px inline with body/label text, 20px in buttons and nav items,
  24px as a standalone action icon (e.g. a toolbar icon button).
  Never an arbitrary pixel size.
- **Color:** icons inherit `currentColor` — an icon's color always
  matches the text role it sits beside (e.g. `text-muted-foreground`
  for a secondary icon), never a hardcoded color independent of its
  text context, except for semantic icons (danger/warning/success/
  info) which use their matching semantic token.

---

## Illustration style

Havelio uses illustration sparingly and only for empty/error/status
screens — never decoratively on a data screen. Where an illustration
is used:

- **Line width:** a single consistent stroke weight (2px at the
  illustration's natural size), matching the icon system's
  discipline of "one weight, everywhere."
- **Corner radius:** soft-rounded joins, consistent with the
  `--radius-md`/`--radius-lg` language used elsewhere — never sharp
  geometric illustrations that clash with the rounded UI chrome.
- **Colors:** `Neutral` scale plus exactly one accent — either
  `Primary` or the relevant semantic color for the state being shown
  (e.g. `Danger` for a 404/error illustration, `Success` for a
  completed-empty-state). Never multi-color, never gradient fills.
- **Visual tone:** abstract and geometric (shapes, simple objects
  like a document or a box), never a human figure, mascot, or
  cartoon character — this is a business tool, not a consumer app.

| Context           | Tone                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Empty state       | A single simple object (an empty box/tray) in `Neutral-300` line, `Primary` for one small accent detail |
| 404               | An abstract "lost path" motif (a broken line, a dotted route) in `Neutral` + `Primary`                  |
| Error             | The same geometric language, `Danger`-accented                                                          |
| Maintenance       | A simple gear/wrench motif, `Neutral` + `Warning` accent                                                |
| No search results | A magnifying glass motif, `Neutral` only (no accent — it's not an error)                                |
| No permissions    | A simple lock motif, `Neutral` + `Muted` — deliberately understated, never alarming                     |
| Loading           | No illustration — use a skeleton or spinner (see `UI_PATTERNS.md`)                                      |
| Success           | A simple checkmark-in-shape motif, `Success` accent                                                     |

---

## Graph / chart style

- **Bar, line, area charts:** `Primary` for the single most important
  series; `Accent` for a second series; `Neutral-300`/`Neutral-400`
  for any additional comparison/reference series (e.g. "previous
  period"). Never more than `Primary` + `Accent` + one neutral
  reference series on a single chart — if a chart needs a fourth
  distinct series, it needs to be two charts.
- **Pie / donut charts:** used only for true part-of-whole
  compositions (e.g. rental status breakdown), segments ordered
  largest-to-smallest clockwise from 12 o'clock, using `Primary`,
  `Accent`, and `Neutral` steps in that priority order — never the
  four semantic status colors used as an arbitrary categorical
  palette (those are reserved for actual status meaning elsewhere in
  the UI, and reusing them here would create false meaning).
- **Heat maps / calendars:** a single-hue intensity ramp from
  `Primary-light` (lowest) to `Primary` (highest) — never a
  red-to-green "bad to good" ramp, which would collide with the
  semantic danger/success colors' meaning.
- **Timelines:** `Neutral-200` connecting line, `Primary` for the
  active/current-position marker, `Neutral-400` dots for past events.
- **Metric cards:** the number itself in `Text` at Semibold weight,
  a small `Success`/`Danger` delta indicator (with an up/down icon,
  never color alone) beside it, label in `Muted` beneath.
- **Legend:** always present when more than one series exists, always
  a small color swatch (`--radius-xs`, 8×8px) + label, never color
  alone with no text key.
- **Grid lines:** `Neutral-200` (light) / `rgb(255 255 255 / 8%)`
  (dark), always behind data, never a stronger stroke than the axis
  itself.
- **Hover:** a `--shadow-tooltip`-elevated tooltip showing the exact
  value, plus the hovered data point growing subtly (no color
  change) — following the Motion System's `--duration-fast`.
- **Selection:** a selected range/bar gets a `Primary` outline ring,
  never a full color fill-swap that would compete with the semantic
  palette.

---

## Logo guidelines

The logo itself is intentionally **not designed as part of this
document** — only the rules that will govern its use once it exists.

- **Safe area:** clear space around the logo equal to the height of
  the logomark itself on all sides — no UI chrome, text, or other
  graphic may enter that space.
- **Minimum size:** never render the full lockup (mark + wordmark)
  below 20px tall; below that, use the mark alone (see "App icon
  philosophy").
- **Light mode usage:** full-color logo on `Background`/`Surface`
  (`#F7F9FA`/`#FFFFFF`) only — never on a colored or photographic
  background.
- **Dark mode usage:** a single-color (white or `Neutral-50`) variant
  on `Background`/`Surface` dark values — the full-color light-mode
  version must never be placed on a dark background unverified for
  contrast.
- **Favicon rules:** the mark alone (no wordmark), rendered at 16/32/
  48px, using `Primary` on a transparent or `Surface`-colored
  background — must remain legible as a single-color shape at 16px.
- **Application icon rules:** the mark alone, full-bleed to the
  platform's required corner-radius mask (iOS/Android/PWA each apply
  their own mask — the source icon itself should be a full square
  with no pre-applied rounding), using `Primary` as the dominant
  color with `Background`/`Surface` as the field color.

---

## App icon philosophy

Not drawn here — principles only, for whoever designs it later:

- Must read clearly as a single, simple shape at 40×40px (a typical
  home-screen/dock size) — no fine detail, no more than two colors.
- Must use `Primary` (`#0E6C8C`) as its dominant color — the icon is
  the single most concentrated expression of the brand color a user
  will see, and should not compromise on it for the sake of a
  "friendlier" alternate color.
- Should evoke precision/operations rather than a literal object
  (avoid a literal "box" or "truck" icon, which would tie the brand
  back to one industry vertical — a direct violation of the
  "universal product architecture" principle in
  [`ARCHITECTURE_LOCK.md`](ARCHITECTURE_LOCK.md) 1.1 applied to
  visual identity). An abstract geometric mark (e.g. derived from the
  wordmark's initial letterform) is preferred over an industry-coded
  pictogram.
- Must work identically well as a monochrome shape (for contexts like
  a notification-bar icon) as it does in full color.

---

## Motion system

Motion in Havelio is fast, confident, and precise — it exists to
confirm that an action registered, never to entertain. **No bounce,
no spring/elastic easing, no overshoot, anywhere in the product.**

### Durations

| Token                 | Value | Usage                                                            |
| --------------------- | ----- | ---------------------------------------------------------------- |
| `--duration-fast`     | 100ms | Hover states, focus rings, icon color changes                    |
| `--duration-base`     | 150ms | Button/input state changes, checkbox toggles, tooltips appearing |
| `--duration-moderate` | 200ms | Dropdowns, popovers, toasts entering/leaving                     |
| `--duration-slow`     | 300ms | Dialogs opening/closing, page-level transitions                  |

### Easing

**One curve, used everywhere:** `--ease-standard: cubic-bezier(0.2, 0, 0, 1)`
— a fast-out, precise-stop curve. No second easing curve exists in
this system; introducing one requires updating this document first.

### Applied

| Element          | Behavior                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hover            | Background/border color transitions at `--duration-fast`                                                                                                                    |
| Buttons          | Background color + subtle scale-none (no scale transform) at `--duration-fast`                                                                                              |
| Dropdowns        | Fade + 4px slide toward the trigger at `--duration-moderate`, `--ease-standard`                                                                                             |
| Tables           | Row hover background at `--duration-fast`; no animation on sort/filter — the new data appears immediately, since animating a data table reorder reads as slow, not polished |
| Dialogs          | Backdrop fade + panel fade/scale from 98%→100% at `--duration-slow`                                                                                                         |
| Notifications    | Slide in from the trigger point + fade at `--duration-moderate`, auto-dismissing toasts fade out (never slide out) at `--duration-base`                                     |
| Page transitions | No full-page transition animation — Havelio is a data tool; instant navigation with a loading skeleton (see `UI_PATTERNS.md`) beats a decorative transition                 |

---

## Voice of the product

Havelio speaks the way a competent colleague speaks: direct, exact,
never cute, never apologetic beyond what's warranted. The same voice
applies everywhere — notifications, errors, dialogs, emails, the
Customer Portal, and the Admin Panel are one product, not four.

**Rules:**

- **State the fact, then the consequence, then the action** — in that
  order. "This rental is already returned. You can't submit another
  extension request for it." not "Oops! Something went wrong with
  your extension request."
- **Never say "Oops," "Uh oh," "Whoops," or any faux-casual filler.**
  An error is a fact, not an apology performance.
- **Errors name what's wrong and, where possible, how to fix it.**
  "Email is already in use" beats "Invalid input." "Planned end must
  be after planned start" beats "Validation failed."
- **Warnings are phrased as a heads-up, not a scold.** "This will
  cancel 2 pending extension requests." not "Warning: you are about
  to perform a destructive action!!"
- **Success messages are short and specific, past tense.** "Rental
  reserved." not "Success! Your rental has been successfully
  reserved!"
- **Buttons are verbs, not phrases.** "Reserve rental," "Send quote,"
  "Sign document" — never "Click here to reserve" or "OK."
- **Dialogs ask one clear question and offer two clear paths.** A
  confirmation dialog's title states the action; its body states the
  consequence; its buttons are the specific verb ("Delete customer")
  and "Cancel" — never generic "Yes"/"No."
- **Tooltips explain, they don't repeat the label.** A tooltip on a
  disabled button explains _why_ it's disabled, not what the button
  is called.
- **Emails match the in-app voice exactly** — the invitation email a
  customer receives should read like the same product as the portal
  they land in, not a separate marketing voice.
- **The Customer Portal is slightly warmer, never less precise.**
  Customers aren't operators, so second-person phrasing softens
  ("Your rental extension was approved") but nothing about clarity or
  directness changes — no marketing language creeps in.
- **No exclamation points**, except in genuinely celebratory,
  rare, positive confirmations (and even then, at most one).

---

## Empty states

Every empty state — no exceptions — includes:

1. **Headline** — states what's missing, plainly ("No rentals yet").
2. **Description** — one sentence of context or the "why," not
   marketing copy ("Rentals you create will appear here.").
3. **Primary action** — the single most likely next step, as a real
   button ("Create rental"), permission-gated like any other action.
4. **Secondary action** — optional; a lower-emphasis alternative
   (e.g. "Import from CSV," "Learn more") as a text link or
   ghost-variant button, never competing visually with the primary
   action.
5. **Optional illustration** — per the Illustration Style section
   above; omit entirely rather than use a generic/unrelated graphic.

See `UI_PATTERNS.md` for the empty-state component's exact layout.

---

## Document style

Visual standards for every generated document and outbound message —
these must look like they came from the same company that made the
software, not a separate print-shop template:

- **Contracts, Rental Agreements, Damage Reports, PDF exports:**
  `Surface` white background, `Text` body copy in Inter, headings in
  Semibold, a single `Primary`-colored rule under the document title,
  the Havelio wordmark + tenant company name in the header, page
  number + document number in the footer (monospace). No colored
  section backgrounds, no decorative borders — a legal/financial
  document earns trust through restraint, not decoration.
- **Invoices:** the same document chrome as contracts, plus a clearly
  isolated totals block (bordered, `Neutral-50` background) so the
  amount due is unambiguous at a glance — this is the one place a
  subtle background tint is allowed, because it serves comprehension,
  not decoration.
- **Email templates:** single-column, `Surface` background, `Primary`
  for the one call-to-action button per email, Havelio wordmark in
  the header, plain-text-equivalent tone matching "Voice of the
  product" above — no marketing banners, no stock photography.
- **Customer Portal:** the same type scale and color tokens as the
  Admin Panel, applied to a slightly more spacious layout (one step
  more generous on the Spacing System) since portal customers aren't
  processing as much data per screen as staff.

---

## Brand rules — what must never happen

- Never invent a color outside the tokens in this document — no
  one-off hex value in a component, ever.
- Never invent a spacing value outside the Spacing System.
- Never invent a typeface, weight, or size outside the Typography
  section.
- Never invent an icon style, or mix a second icon library alongside
  Lucide.
- Never mix border radii within the same component family (e.g. one
  card with `--radius-md` and another with `--radius-lg` on the same
  screen for no reason).
- Never hardcode a color value (`#0e6c8c`, `rgb(...)`) directly in a
  component — reference the Tailwind utility or `var(--token)`.
- Never hardcode a spacing value in a component — use the approved
  Tailwind spacing steps only.
- Never use a decorative gradient — gradients are not part of this
  system in any form, on buttons, backgrounds, text, or icons.
- Never create a one-off component variant that isn't documented in
  `UI_PATTERNS.md` — if a screen needs a new pattern, the pattern is
  added to that document first.
- Never bypass design tokens "just this once" for a deadline — a
  token exception left in the codebase is technical debt from the
  moment it's written, not later.

---

## Design tokens — source of truth

All visual values live in
[`packages/ui/src/styles/theme.css`](../packages/ui/src/styles/theme.css)
as CSS custom properties, grouped by category:

- **Colors** — `--color-primary*`, `--color-accent*`,
  `--color-neutral-*`, `--color-danger*`, `--color-warning*`,
  `--color-success*`, `--color-info*`, plus the semantic surface
  roles (`--background`, `--foreground`, `--card`, `--sidebar`,
  `--border`, `--muted-foreground`, etc.) that remap those raw colors
  to UI roles and flip in `.dark`.
- **Typography** — `--font-sans`, `--font-mono` (populated by
  `next/font/google` in `apps/web/src/app/layout.tsx`).
- **Radius** — `--radius-xs` through `--radius-xl`.
- **Shadows** — `--shadow-1`/`2`/`3`, `--shadow-dropdown`,
  `--shadow-popover`, `--shadow-tooltip`, `--shadow-modal`.
- **Motion** — `--duration-fast`/`base`/`moderate`/`slow`,
  `--ease-standard`.
- **Spacing** — reuses Tailwind's built-in 4px scale directly (no
  custom token layer needed — see "Spacing system" above for the
  approved subset).
- **Breakpoints** — reuses Tailwind v4's default breakpoint scale
  (`sm`/`md`/`lg`/`xl`/`2xl`) unmodified; no custom breakpoints exist
  in this product today.
- **Z-index** — `--z-sticky` (20) / `--z-overlay` (30) / `--z-drawer`
  (40) / `--z-dropdown` (50) / `--z-modal` (60) / `--z-toast` (70,
  reserved — no toast component exists yet) / `--z-tooltip` (80,
  reserved — no tooltip component exists yet), exposed as the
  `z-sticky`/`z-overlay`/`z-drawer`/`z-dropdown`/`z-modal`/`z-toast`/
  `z-tooltip` Tailwind utilities. Added in TASK-0010 Chapter 1, the
  first time dialog/dropdown/drawer patterns existed as real
  components and a genuine stacking order (header → mobile nav scrim
  → mobile nav drawer → dropdown menus/command palette → dialogs) needed
  one source of truth instead of ad hoc `z-30`/`z-40`/`z-50` values
  guessed per component. Ordering is independent of the Shadow
  System's elevation depth above — a tooltip has the lightest shadow
  (it sits close to its anchor) but the highest z-index, since it must
  still paint above a modal.

No component may define a color, spacing, radius, shadow, or
duration value that doesn't resolve to one of the tokens above.
