# UI kit, standard errors and breakpoints

How screens are built so that look, wording and accessibility stay the same everywhere. Background and the
original findings: [`ACCESSIBILITY_AUDIT.md`](ACCESSIBILITY_AUDIT.md).

## Components (`components/ui/`)
Use these instead of writing markup by hand. Each has the accessibility behaviour built in.

| Component | Use it for | What it does for you |
|---|---|---|
| `PageShell`, `Container` | the page and its content width | `<main id="main-content">` (the skip link's target); widths follow the breakpoint scale below |
| `PageHeader` | the green bar on patient pages | a labelled **Home** link (or **Back** with `onBack`), `h1`, subtitle, right-hand control |
| `Alert` | any message about what just happened | `error`/`warning` are announced immediately (`role="alert"`), `success`/`info` politely (`role="status"`) |
| `Field`, `TextField`, `TextAreaField`, `SelectField` | every form control | label tied to the control, hint and error read with it, `aria-invalid`, `aria-required`, unique ids |
| `Button`, `LinkButton` | actions and links that look like buttons | 44 px (small: 36 px) targets, `loading` blocks double clicks and announces busy |
| `Switch` | on/off settings | a real `role="switch"` button: Tab, Space/Enter, announced on/off |
| `ConfirmDialog`, `useConfirm()` | "Are you sure?" (replaces `confirm()`) | focus moves in and is trapped, Escape cancels, focus returns, page scroll locked |
| `useFocusTrap` | anything that overlays the page (the mobile menu uses it) | same behaviour for custom overlays |
| `Card`, `Section` | panels and titled groups | consistent padding and heading level |
| `Badge`, `StatusBadge` | status labels | always text, same colour for the same status everywhere |
| `Spinner`, `LoadingBlock` | loading | named for screen readers |
| `EmptyState` | "nothing here yet" | title, hint, optional action |
| `ResponsiveTable` | tabular data | a table from 768 px, cards below it, so nothing scrolls sideways on a phone |
| `LangText` | user-entered text (names, notes) | adds `lang="gu"`/`lang="hi"` so screen readers pronounce it correctly |

Rules that tests and CI enforce:
- No `alert()`, `confirm()` or `prompt()` (use `Alert` / `useConfirm`).
- Every input has an accessible name; error text is announced; no text under 12 px; fields are 16 px.
- Colour tokens meet WCAG AA (`tests/a11y.test.ts` checks the ratios).
- `npm run lint:a11y` (jsx-a11y rules) must stay at zero errors.

## Colours (`app/globals.css`)
Pick a **role**, not a palette colour:

| Token | For |
|---|---|
| `--color-charcoal`, `--color-charcoal-mid` | body text |
| `--color-sage` | muted text, hints, captions (AA on the page background and on cards) |
| `--color-placeholder` | placeholder text |
| `--color-link` | text links and text-style actions |
| `--color-danger`, `--color-success`, `--color-warning`, `--color-info` | status text and `Alert` |
| `--color-border-input` | form control outlines (3:1) |
| `--color-forest`, `--color-gold` | brand: headers and the primary button |

`--color-sage-light` and `--color-gold` are for decoration only (icons, borders), never for text.

## Errors and wording
- **Server:** every failure is `apiError(code)` from `lib/errors.ts`: one status, one wording and one `code` per problem
  (`SERVER_ERROR`, `CLINIC_NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `VALIDATION`). The body keeps the
  `{ error: string }` shape and adds `{ code }`. For a case with its own wording use `apiError('VALIDATION', { message })`.
- **Client:** show a failed call with `readFailure(res, 'Could not save the notes.')` or `failureText(data, fallback)` from
  `lib/clientErrors.ts`, inside an `Alert`. A request that never got an answer is `networkFailureText()`.
- **Wording lives in `lib/messages/`.** `en.ts` is the source; `hi.ts` and `gu.ts` must define the same keys
  (`tests/errors.test.ts` fails if a key is missing). To add a language: copy `en.ts`, translate, register it in
  `lib/messages/index.ts` (`Lang`, `LANGS`, `catalogues`). Hindi and Gujarati are present but have not been reviewed by a native
  speaker, and the app does not yet let a user choose a language; until it does, everything shows in English.

## Breakpoints
Mobile first, Tailwind's default scale: **sm 640 · md 768 · lg 1024 · xl 1280**.
- `Container width="narrow"` (forms, lists): 640 px, 720 px from md, 760 px from lg.
- `Container width="wide"` (dashboards): up to 1200 px, with more padding from md and lg.
- The patient home page (`.container-split`) is one column up to 1023 px, then booking beside the clinic details; the bottom tab bar is
  shown only below lg.
- The doctor shell shows the sidebar from lg and a menu drawer below it. The calendar opens on the agenda view on phones.

## Checking a change
```powershell
npm run lint:a11y                 # accessibility lint (also runs in CI)
npm test                          # includes the accessibility and component tests
npm run a11y:check -- --host <staging host>   # axe + sideways-scroll + screenshots at 360 / 768 / 1280 px on a live site
```
