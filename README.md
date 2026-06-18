# Site Programme Viewer

A single-page, **client-side** web app for UK residential housebuilders. Over a
traced site plan it shows how each plot's build progresses and whether the
infrastructure services have progressed far enough for that plot to be safely
**occupiable** at any chosen programme week. The deliverable for monthly meetings
is an **A3 PDF snapshot** at the selected week — and that PDF embeds the full
project so re-opening it in the app restores everything.

There is **no backend**. Everything runs in the browser and deploys to GitHub
Pages.

- **Stack:** React + Vite + TypeScript, Tailwind, `pdf-lib` (PDF), `html2canvas`
  (rasterise the drawing), `papaparse` (CSV import).

---

## Quick start

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run test     # unit tests (occupation rule, week<->date, CSV logic)
```

## Two roles, one UI

A single **View / Setup** toggle (top right).

- **Setup (engineer):** upload the site plan image, tap to place numbered plot
  markers, set each service's start/end **programme week** per phase, set each
  plot's build stage and completion week. Can also bulk-load plot data from a
  CSV build programme.
- **View (everyone else):** drag the **Week slider** and tap **Export PDF**.
  Nothing else to learn.

The slider and Export button are always visible. Tap targets are ≥44px, focus
rings are always shown, and `prefers-reduced-motion` is respected. No JSON, week
maths, or coordinates are ever shown to users.

---

## The week model

The whole app is driven by **programme weeks** (integer week numbers), not
calendar months.

- The engineer sets **"Week 1 commencing"** (a calendar date) once.
- Week _N_ commences `(N-1) × 7` days after the Week-1 date.
- Dates are derived **for display only** (e.g. `w/c 12 Jan 2026`).
- `dateToWeek()` converts a calendar date (e.g. from a CSV) to the **nearest**
  programme week, clamped to ≥ 1.

See `src/weeks.ts` and `src/weeks.test.ts`.

---

## The occupation rule (strict)

Implemented as a pure, unit-tested function in `src/occupation.ts`:

```ts
occupationStatus(plot, phase, week) => { status, blockers[] }
```

A plot is **OCCUPIABLE** at the selected week only if, for that plot's phase:

1. **Road has reached Binder or better** by the selected week, **and**
2. **every service's END week is ≤ the selected week** (i.e. all services
   are "live").

Road reaches its programmed **target stage at its END week**; before that it
counts as not reached. The minimum road stage (`Binder`) and all stage/service
definitions live in one config object, `src/config.ts`, so they're easy to
change.

Plot colouring at the selected week:

| Situation | Colour |
| --- | --- |
| Completion week **not** reached | the plot's **build-stage** colour |
| Completion reached **and** rule met | **green — Occupiable** |
| Completion reached **and** rule NOT met | **red — Conflict** |

For a conflict, `blockers` lists the specific reasons, e.g.
`Foul drainage live wk 38 (after wk 30)` or `Road only reaches Base (needs Binder)`.
These appear in the side panel and in the PDF conflicts table. Colours use the
Okabe–Ito colour-blind-safe palette.

---

## CSV import (build programme)

**Setup → "Import build programme (CSV)"**. Import **updates existing plots
only** — it never creates, moves or auto-places markers. **Plot number is the
join key.**

Fixed-format headers (case-insensitive, order-independent):

```
plot_no, build_stage, completion_week | completion_date, phase
```

- `build_stage` accepts synonyms: `Super`=Superstructure, `Roof` /
  `Wind & watertight`=Watertight, `FF`=First fix, `PC` /
  `Practical completion`=Complete.
- `completion_week` is an integer; `completion_date` (DD/MM/YYYY or ISO) is
  converted to the nearest programme week.
- If the headers aren't recognised, a **column-mapping** screen lets you assign
  them; the mapping is remembered in `localStorage` for next month.

Nothing changes until you confirm. A **preview** shows: how many plots will
update, CSV rows with no matching plot, plots on the plan not in the CSV,
unrecognised build stages (skipped), unparseable dates (per-row note, stage
still applied), and duplicate plot numbers (last row wins). After **Apply**, an
**Undo last import** restores the pre-import snapshot.

A **"Download CSV template"** link emits the fixed header plus the current plot
numbers pre-filled, ready to hand to whoever owns the programme.

See `src/csv.ts` and `src/csv.test.ts`.

---

## PDF export & restore ("the PDF is the project memory")

**Export PDF** produces an **A3 landscape** PDF containing:

1. Title block — site name, `Programme Week N — w/c DD Mon YYYY`, export date.
2. The site plan rasterised (via `html2canvas`) with every plot marker in its
   week-N state.
3. A full **key/legend** — every build-stage colour, Occupiable, Conflict, and a
   services-status note.
4. A **conflicts table** for week N (plot number + blockers), if any.

The full project JSON is embedded in the PDF **two ways**:

- as an **attached file** named `project.json` (`pdf-lib` `attach`), and
- as a base64 value in a **custom PDF metadata field**.

**Restoring:** use **Project menu → "Open project from PDF"** and pick a PDF the
app exported. The app reads the embedded `project.json` (the attachment first,
then the metadata field) and fully restores state — **no OCR, no text scraping**.
If the chosen PDF has no embedded data you get:
_"This PDF has no project data — open one exported by this app."_

### Other persistence

- **Autosave:** every change is saved to `localStorage`, so a refresh restores
  your project.
- **Plain JSON fallback:** _Export project file_ / _Import project file_ (`.json`).

---

## Deploying to GitHub Pages

The Vite `base` is set to `'./'` (relative), so the build works from a project
subpath (`https://<user>.github.io/<repo>/`) without hard-coding the repo name.

Automatic (recommended): the workflow at `.github/workflows/deploy.yml` runs
tests, builds, and publishes `dist/` on every push to `main`.

1. Push to `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The site publishes to `https://<user>.github.io/<repo>/`.

Manual alternative:

```bash
npm run build         # outputs dist/
# publish the contents of dist/ to the gh-pages branch / Pages
```

---

## Assumptions & what a technical director must verify

This tool is a **planning/visualisation aid**. The occupation flag is a
programme-logic check only. It is **NOT** a determination that a plot may legally
or safely be occupied. The following are **explicitly NOT modelled** and must be
confirmed independently before relying on any green "Occupiable" flag:

- **Building Control completion / final certificate** for the dwelling.
- **Fire appliance access** — the made-up carriageway distance to the dwelling
  and hardstanding requirements (Building Regs Part B / B5).
- **S38 (highways) / S104 (sewers) adoption status** and any bonds; "Adopted" in
  this app is just a road-stage label, not legal adoption.
- **S106 / planning conditions, phasing conditions, and pre-occupation
  conditions** (e.g. landscaping, POS, drainage approvals).
- **Statutory undertaker energisation/commissioning** — this app treats a
  service as "live" at its programmed end week; it does **not** confirm that gas
  has been purged/commissioned, electric has been energised and metered, or
  water has passed bacteriological sampling.
- **Surface-water / SuDS adoption and outfall consents**, attenuation handover.
- **NHBC / warranty key-stage inspections** and any conditional sign-offs.

Other assumptions made while building this:

- A plot belongs to exactly one phase; services are defined per phase.
- Plot **number** is unique and stable — it is the CSV join key.
- "Road reaches Binder or better" is treated as the safe-occupation threshold
  (configurable in `src/config.ts` → `OCCUPATION_CONFIG.roadMinStage`); a road's
  target stage is considered reached at its programmed END week, with no partial
  progress modelled between start and end.
- Dates are handled in UTC to avoid timezone drift; ambiguous CSV dates
  (e.g. `31/02`) are rejected per-row rather than guessed.
- The site plan is a static raster image the engineer traces over; the app does
  not read any geometry or data from the underlying drawing.
