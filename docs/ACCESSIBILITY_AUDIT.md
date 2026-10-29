# Accessibility, responsiveness and modularity audit

Audited 30 Oct 2026 against `main` at `7432233` (plus the register-page fix in PR #12), standard **WCAG 2.2 level AA**.
Scope: the whole app: patient pages, doctor dashboard, operator console.

## How it was checked, and what was not
| Done | Method |
|---|---|
| Static scan of all 36 `.tsx` files and `globals.css` | counts and patterns below, from the source |
| Colour contrast of every design token pair | computed from the hex values (WCAG formula) |
| Live probe of the patient pages on staging at 360, 768 and 1280 px | horizontal overflow, tap-target sizes, text under 12 px, unlabeled fields, landmarks, zoom setting |
| Visual check at phone and desktop width | screenshots of home and register |

**Not done, so treat the corresponding findings as unverified:**
- The doctor and operator pages need a login, so they were reviewed from the source only, not rendered at each width.
- No screen reader (NVDA/VoiceOver/TalkBack) pass and no automated axe run. Both belong in the follow-up plan (section 6).
- Keyboard-only walkthrough of every flow was reasoned from the code, not performed.

## 1. Summary
| Area | Verdict |
|---|---|
| Mobile layout | **Good.** No horizontal overflow at 360 px on the patient pages. The doctor shell collapses to a drawer below 1024 px. |
| Tablet and desktop | **Works, not adapted.** Patient pages are a 640 px column on every screen; 15 of 36 page files have no responsive rules at all; the calendar shows a 7-day grid on phones. |
| Accessibility | **Needs work.** Pinch-zoom is blocked, the secondary text colour fails contrast, and 60 of 92 form fields on doctor/operator pages have no programmatic label. |
| Modularity | **Weak.** There is no shared UI kit. 377 inline `style` blocks, two competing styling systems, 161 hard-coded API error strings in 56 variants. |

What is already good: `<html lang="en">`; image alt text present; reduced-motion respected; no clickable `div`s; every icon-only button has a name; one `h1` per page; clear shared tokens and button/card/badge/form classes in `globals.css`.

## 2. Accessibility findings

| # | Severity | Finding | Evidence | WCAG |
|---|---|---|---|---|
| A1 | **Critical** | Pinch-zoom is disabled. Patients are often elderly; this is the one setting they need most. | `app/layout.tsx:35` sets `maximumScale: 1`; the probe reports `zoomBlocked: true` | 1.4.4, 1.4.10 |
| A2 | **High** | Secondary text, hints, placeholders and gold links fail contrast. | see table below | 1.4.3 |
| A3 | **High** | 60 of 92 form controls on doctor/operator pages have no programmatic label (no `id`/`htmlFor`, no `aria-label`). Settings 29, appointment detail 12, new appointment 6, team 5, others 8. Of 73 `<label>` elements only 23 have `htmlFor`. Public pages are fine (probe: 0 unlabeled). | static scan | 1.3.1, 3.3.2, 4.1.2 |
| A4 | **High** | Tap targets too small. "Forgot your PIN?" 278x20, "Forgot password?" 262x20, "View or cancel my appointments" 278x36, "Someone else" 278x38, password toggle **16x16**. `.btn` is about 34 px tall; `.btn-sm` smaller. | probe on staging | 2.5.8 (24 px minimum; the toggle fails); 44 px is the target for elderly users |
| A5 | Medium | No `<main>` landmark on any patient page; no skip link anywhere. | probe: `hasMain: false` on 4 of 4 patient pages | 1.3.1, 2.4.1 |
| A6 | Medium | Navigation drawer and confirmations: the mobile drawer has no Escape-to-close, no focus trap or focus return, no `aria-expanded` on the hamburger and no `role="dialog"`/`aria-modal`. Nine native `alert()`/`confirm()` calls (settings 7, blocked slots 1, PIN reset 1) can be blocked silently by the browser, which is exactly what made the WhatsApp button look dead. | `DoctorSidebar.tsx:177-210`; `grep alert( confirm(` | 2.1.1, 2.4.3, 4.1.2 |
| A7 | Medium | Errors and status changes are not announced. Only 3 `role="alert"`, 0 `aria-live`; the 12 `.form-error` paragraphs are not linked to their field (`aria-describedby`/`aria-invalid`). | static scan | 3.3.1, 4.1.3 |
| A8 | Medium | Small text. 20 uses of text under 12 px (14 in `PatientPortal.tsx`); the home page has 6 text nodes under 12 px. Form inputs are 14 px, which makes iOS Safari zoom in on focus. | scan and probe | 1.4.4 (readability) |
| A9 | Low | Focus indicator on inputs is a 10% glow plus a border colour change; buttons and links rely on the browser default. | `globals.css:273-277` | 2.4.7, 2.4.11 |
| A10 | Low | No language marking for Hindi/Gujarati text (patient names, prescription notes). | n/a | 3.1.2 |

### Contrast (computed)
| Pair | Ratio | Need | Where used |
|---|---|---|---|
| `--color-sage` #7A8B7F on linen | **3.25** | 4.5 | labels, hints, captions, subtitles: both sides of the app |
| same on white cards | **3.60** | 4.5 | |
| `--color-sage-light` #B5C2B9 on linen (input placeholders) | **1.66** | 4.5 | every placeholder |
| `--color-gold-dark` #A88040 on linen (text links) | **3.25** | 4.5 | "Forgot your PIN?", links |
| `--color-gold` #C9A15D on linen | **2.17** | 4.5 | accents used as text |
| slate-400 #94A3B8 on white | **2.56** | 4.5 | doctor pages captions |
| red-400 #F87171 on white (delete icons) | **2.77** | 3 | doctor pages |
| white on WhatsApp green #25D366 | **1.98** | 4.5 | the share button |
| Passing: white on forest 12.2; header subtitle 6.8; header caption 4.84; charcoal-mid 8.0; error red #B54A3C 4.72; forest on gold button 5.06; slate-500 4.76 | | | |

Replacement values that pass (computed): muted text **#5C6B61** (5.07 on linen, 5.63 on white); placeholder **#6B786F** (4.58); gold link **#7A5A1E** (5.72); danger icon **#DC2626** (4.83); WhatsApp button **white on #0E7C6B** (5.10) or dark text #0B3D2E on #25D366 (6.15).

## 3. Breakpoints and responsiveness

| # | Finding | Evidence |
|---|---|---|
| B1 | **Patient pages are one 640 px column on every screen.** At 1280 px the home page uses half the width and the mobile bottom tab bar stays full-width. Usable, but it reads as a stretched phone app. | `.page-container-sm` (640 px); probe at 1280: content 640 px |
| B2 | **15 of 36 page/component files have no responsive rules** (`sm: md: lg: xl:`), including: PatientPortal (629 lines), calendar, RegisterClient, doctor login, My Appointments, patient list and patient detail, audit, PinReset, home. The doctor shell itself is responsive (sidebar at 1024 px, padding grows at md/lg). | scan |
| B3 | **The calendar defaults to the 7-day grid on every device** (`useState('week')`, `min-w-[600px]`), so phones scroll sideways. An agenda view exists but is not chosen for small screens. | `calendar/page.tsx:32, 288` |
| B4 | Tablets: under 1024 px the doctor dashboard uses the phone layout (hamburger, single column), so a tablet in landscape gets no extra benefit. | `DoctorSidebar.tsx` uses only `lg:` |
| B5 | Only one data table (audit log) and it scrolls inside a card; good, but patient and WhatsApp logs lists are custom grids that were not width-tested. | static |
| B6 | Mobile-first is respected where tested: no horizontal overflow on `/`, `/register`, `/appointments`, `/doctor/login` at 360 px. | probe |
| B7 | No breakpoints are documented; each page invents its own widths (`max-w-3xl`, `max-w-5xl`, 640 px, 1200 px). | scan |

## 4. Modularity

| # | Finding | Evidence |
|---|---|---|
| M1 | **No shared UI kit.** `components/` holds 7 files (portal, register, PIN input, sidebar, footer). Everything else is rebuilt per page: **377 inline `style={{…}}` blocks** (book 60, PatientPortal 51, dashboard 36, WhatsApp logs 30, …), **15 copies of the green page-header bar**, 16 inline spinners, 6 hand-written empty states. | scan |
| M2 | **Two styling systems side by side.** The patient UI uses the brand tokens (`var(--color-…)`); the doctor UI mixes 139 Tailwind `slate-*` classes and 55 blue/red/green/amber utility classes with 356 token uses, plus 31 hard-coded hex colours. A rebrand or per-clinic colour change misses the Tailwind ones. | scan |
| M3 | **Error text is not standard.** API: **161 inline error strings, 56 distinct**, e.g. "Internal server error" x32 (and once "Internal Server Error"), "Clinic not found" x30, "Unauthorized" x24; no shared helper, no machine-readable code except for PIN errors, so the UI cannot map or translate them. Client: wordings "Could not" (17), "Failed to" (6), "Something went wrong" (3), "Error saving" (1); **three different visual treatments** (`.form-error` 12, red box 3, inline red-tint box 23) plus 9 native dialogs. | scan |
| M4 | No message catalogue: all user-facing copy is hard-coded in JSX, so adding Hindi/Gujarati means touching every page. | scan |
| M5 | The label + input + hint + error group is hand-written 92 times, which is also the cause of A3 and A7. | scan |
| M6 | Very large page files: settings 970 lines, patient portal 629, appointment detail 581, book 390. | `wc -l` |
| M7 | Already good, build on it: tokens (colour, radius, shadow, type) in `globals.css`; shared `.btn`, `.card`, `.badge-*`, `.form-*` classes used widely; shared response helpers for PDFs and PIN errors; per-clinic theming via the theme tokens. | `globals.css` |

## 5. Target design (what "standard and reusable" should mean)

**Tokens (`globals.css`)**: add semantic names so pages stop choosing colours: `--text-muted`, `--text-placeholder`, `--link`, `--danger`, `--success`, `--warning`, `--info`, `--focus-ring`; fix the failing values using section 2. One documented breakpoint scale: sm 640, md 768, lg 1024, xl 1280, with two container classes (`.container-narrow` for forms, `.container-wide` for dashboards) that grow with the screen.

**Components (`components/ui/`)**, each with accessibility built in so pages cannot get it wrong:
`Button`/`LinkButton` (44 px minimum, loading and disabled states) · `Field` + `TextInput`/`Select`/`Textarea` (label, hint, error, `aria-describedby`, `aria-invalid`) · `Alert` (error/warn/success/info, correct `role`/`aria-live`) · `Card`, `Section` · `Badge`, `StatusPill` · `Spinner`/`LoadingBlock` · `EmptyState` · `PageHeader` (the green bar, with the Home/back control) · `PageShell` (`<main>`, skip link, container) · `Modal`/`ConfirmDialog` (focus trap, Escape, focus return) replacing `alert()`/`confirm()` · `Drawer` · `Tabs` · `ResponsiveTable` (table on wide screens, cards on phones).

**Errors**: one catalogue, `lib/errors.ts`, mapping a code to a message (`CLINIC_NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `VALIDATION`, `SERVER_ERROR`, …) and an `apiError(code, extra?)` helper that returns `{ error, code }` with the right status. The client reads the `code`, shows the catalogue text through `Alert`, and one tone ("Could not …, please try again"). Keep today's `{ error: string }` shape so nothing existing breaks. The same catalogue is the seed for translations.

**Guardrails**: `eslint-plugin-jsx-a11y`; a lint rule against `alert`/`confirm` and raw hex colours in TSX; an axe + screenshot check at 360/768/1280 px in CI on the public pages.

## 6. Recommended order of work
| Phase | Scope | Effort | Fixes |
|---|---|---|---|
| 1 Quick wins | remove `maximumScale`; new contrast tokens (muted text, placeholder, gold link, danger, WhatsApp); global `:focus-visible` ring; 16 px inputs; `<main>` and skip link on patient pages; 44 px tap targets in `.btn` and the text links; label wiring on the 60 fields (mechanical); `role="alert"` on error text | 1 day | A1 A2 A3 A4 A5 A7 A8 A9 |
| 2 Foundation | `components/ui` primitives; `lib/errors.ts` + `apiError`; replace the 9 native dialogs with `ConfirmDialog`; migrate the patient pages first | 2-3 days | A6 M1 M3 M5 |
| 3 Responsive | container scale; two-column patient home and a top nav instead of the bottom bar at `lg`; calendar defaults to agenda below `md`; tablet layouts for the doctor pages; split the 970-line settings page into sections | 2-3 days | B1-B4 M2 M6 |
| 4 Guardrails | jsx-a11y, axe and screenshot checks in CI; Hindi/Gujarati message files and `lang` marking | 1 day | A10 M4 B7 |

Phases 1 and 2 are independent of the clinics' data and safe to ship behind normal PR review. Phase 3 changes how every screen looks and should be checked on staging at three widths before production.
