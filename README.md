# Two clocks · Dos relojes

Tanegashima's measured sea level during Pichincha's 1999 eruptions, as one
ceramic object — a thrown vessel whose silhouette is the tide, or a spiral wall,
or a crown for a vase — explorable in 3D, exportable as renders, meshes, 1:1
cutting templates and a spec sheet.

Two clocks run through the piece. The Moon's, which drives the island's tide, and
the volcano's, which kept its own time. **If the eruptions bunch near one angle,
the form shows it. It does not explain it, and no causal relation is claimed.**

---

## The mapping

| Dimension | Quantity | Detail |
| --- | --- | --- |
| **Angle θ** | the Moon | each hour sits at its lunar phase angle; 0° = new moon, 180° = full. One turn = one synodic month (~29.53 d). |
| **Radius r** | elapsed time | grows linearly with θ, so turns are evenly spaced — or stays constant in circle mode, where the wall closes into a ring. |
| **Wall height h** | observed sea level | Tanegashima station TJ, hourly, JMA original record. |
| **Red notches** | eruptions | cut into the top edge at the exact UTC instant, deeper for a taller plume. |

Nothing on the piece is red except the eruptions.

**The default mode swaps two of those rows.** Cylinder mode is a form of
revolution rather than a coil: the Moon runs up the AXIS, the tide becomes the
RADIUS, and the eruptions are rings cut all the way round. The quantities are
the same; which dimension carries them is not. See
[Cylinder mode](#cylinder-mode--the-form-of-revolution).

---

## Quick start

```bash
npm install
```

```bash
npm run dev
```

The data is already built and committed to `public/data/`, so the site runs
straight away. To rebuild it from the raw files:

```bash
npm run build:data
```

To re-download the raw JMA files and refresh their hashes:

```bash
npm run fetch:jma
```

Other scripts: `npm test`, `npm run typecheck`, `npm run build` (static output
in `dist/`, deployable to GitHub Pages or Netlify — no server).

### Deploying

`.github/workflows/deploy.yml` typechecks, tests, builds and publishes `dist/`
to GitHub Pages on every push to `main`. Vite's `base` is `./`, so the build
works at a project-pages subpath without further configuration.

Pages has to be switched on once, by hand, before the first run:
**Settings → Pages → Build and deployment → Source: GitHub Actions**. The
`enablement: true` option of `actions/configure-pages` exists to do this from
the workflow, but it needs a token that can administer the repository, which
the default `GITHUB_TOKEN` is not — so it fails with a 404 on a repository
whose Pages site does not exist yet.

The built data in `public/data/` is committed, so CI never needs to reach
`data.jma.go.jp`. Pages publishes from a private repository only on GitHub Pro,
Team or Enterprise; on a Free account the repository has to be public.

---

## Data

### Sources

| What | Where | Status |
| --- | --- | --- |
| Observed hourly sea level | `hry1999MMTJ.txt`, months 09–12 | downloaded, hashed |
| Hourly anomaly (observed − astronomical) | `dep1999MMTJ.txt`, months 09–12 | downloaded, hashed |
| Observation datum | JMA month page header, 観測基準面の標高 | **read for all four months: −374.5 cm** |
| Pichincha eruptions | `data/raw/events.csv`, hand-curated | 5 events |

Base URL: `https://www.data.jma.go.jp/kaiyou/data/db/tide/genbo/1999/1999MM/`.
Format reference: <https://ds.data.jma.go.jp/kaiyou/db/tide/genbo/format.html>.

`data/raw/jma/` holds the eight raw files **exactly as served and never edited**.
`data/raw/MANIFEST.json` records, per file, the URL, the retrieval timestamp, the
byte count and the SHA-256 — plus the datum and which months it was verified for.
If this machine cannot reach `data.jma.go.jp`, put the eight files in
`data/raw/jma/` by hand and run `npm run fetch:jma` again: it hashes whatever is
on disk, writes the manifest and marks the entries it did not fetch itself.

> The brief treated −374.5 cm as verified for October 1999 only. All four month
> pages were reachable and all four report −374.5 cm, so the datum is now
> verified for the whole window. `build-meta.json` carries `datumVerified`, and
> the site shows an asterisk beside the datum if it was ever assumed. The wall's
> *shape* does not depend on the datum; only the elevation labels do.

### The fixed-column format, and why it matters

These files are column-oriented, not whitespace-delimited. Adjacent values touch:

```
4103763453223133203413704004244364364264093923783733773894074254394444389910 1TJ1028437215844499999999999999 4 531316 437399999999999999
```

That line is 1 October 1999. The first twelve characters are `410 376 345 322` —
four hourly readings, not one number. Splitting on whitespace silently merges
values and is the single most likely way to corrupt this dataset, so every field
is sliced by its documented column range and nothing else.

```
hry1999MMTJ.txt — 136 characters per line
  cols   1– 72   24 × 3-char hourly values, cm above the datum, 00–23 h JST
  cols  73– 78   YYMMDD, space-padded  ("9910 1" = 1999-10-01)
  cols  79– 80   station code "TJ"
  cols  81–108   up to 4 high waters, 7 chars each: HH MM CCC
  cols 109–136   up to 4 low waters,  7 chars each
                 "9999999" = no such extremum; all-blank = missing value

dep1999MMTJ.txt — 106 characters per line
  cols   1– 96   24 × 4-char hourly anomalies, cm
  cols  97–104   YYYYMMDD
  cols 105–106   "TJ"
```

A blank field is a missing value and returns `null`. A field that is neither
blank nor a signed integer is a **hard error** — the parser never quietly
downgrades an unreadable value to "missing".

### Events

`data/raw/events.csv` is hand-curated, one row per eruption, with an explicit
precision flag so that imprecision is drawn rather than hidden:

| id | UTC | Precision | Event | Plume | Lunar phase at the instant |
| --- | --- | --- | --- | --- | --- |
| e1 | 1999-09-26 | day | first magmatic eruption | — | 187° (full moon) |
| e2 | 1999-10-05 22:25 | advisory | subplinian, 2 mm ash on Quito | 15 km | 318° |
| e3 | 1999-10-07 12:06 | minute | subplinian, pyroclastic flow | 14 km | 337° |
| e4 | 1999-11-10 | day | vulcanian, ends a month of quiet | — | 20° |
| e5 | 1999-12-10 22:13 | minute | large eruption | — | 32° |

e2's 22:25 UTC is the *advisory* time, not the onset — the eruption began earlier
that afternoon. e3's plume is reported as 13–15 km; 14 km is recorded as the
midpoint. e1 and e4 are known only to the day and are therefore drawn as 24-hour
intervals, never as instants.

**Not yet included:** the roughly weekly dome-destroying eruptions that Wright et
al. 2023 describe through Nov–Dec 1999, and the phase-2 IG-EPN daily event counts.
Both need the paper's eruption table and the ReliefWeb archive transcribed by
hand; the CSV and the whole pipeline take extra rows without any code change.

---

## Data handling: `scripts/build-data.ts`

Deterministic — the same inputs give byte-identical outputs, apart from the build
timestamp recorded in `build-meta.json`. It runs eight steps in order and refuses
to write anything if a check fails.

**1 · Parse by fixed columns.** Line lengths (136 / 106) and day counts
(30, 31, 30, 31) are asserted, not assumed.

**2 · Timestamp every value.** `UTC = JST − 9 h`. Japan has no daylight saving,
so the offset is constant across the window. The series origin is
1999-09-01 00 h JST = 1999-08-31 15:00 UTC.

**3 · Join and derive.** Observed and anomaly are joined on the timestamp; a slot
present in one file and absent from the other is a hard error.

```
astro(t) = obs(t) − dep(t)            the Moon-and-Sun tide, on the same datum
elev(t)  = obs(t) + d_1999            d_1999 = −374.5 cm
```

**4 · Fill gaps.** 41 of the 2928 hours have no observation, in two blocks:

| Gap (UTC) | Hours | |
| --- | --- | --- |
| 1999-09-13 21:00 → 1999-09-15 00:00 | 28 | before the default window |
| 1999-10-13 18:00 → 1999-10-14 06:00 | 13 | entirely on 14 Oct JST |

`astro` is filled from the harmonic fit, `dep` by linear interpolation, and then
`obs = astro + dep`. The split is deliberate: a 13-hour gap spans a whole tidal
cycle, so linear interpolation across it would flatten a crest and a trough that
certainly happened — the harmonic fit knows where they were. The anomaly, by
contrast, is weather-driven and smooth on that timescale, so a straight line
through it is honest. **Every filled hour carries `filled = 1`**, the timeline
strip shades it, and the readout says "hora reconstruida".

**5 · Harmonic fit (gap filling only).** Ordinary least squares of a mean plus
six constituents over all 2887 hours that have an observation:

```
astro(t) ≈ a₀ + Σ_k [ a_k cos(ω_k t) + b_k sin(ω_k t) ],  k ∈ {M2, S2, N2, K1, O1, Q1}
```

Solving for the `(a_k, b_k)` *pair* keeps the problem linear, so one normal-equation
solve gives the exact optimum; amplitude is `hypot(a, b)` and phase is `atan2(b, a)`.
The normal equations are accumulated in a single pass (13×13, never a 2887×13
matrix) and solved by Gauss–Jordan with partial pivoting, which refuses a singular
system rather than returning noise.

Why these six and no others: two constituents can only be told apart over a record
longer than their Rayleigh period `1/|f₁ − f₂|`. The 122 days of Sep–Dec 1999
separate M2/S2/N2 and K1/O1/Q1 comfortably; K2 (against S2) and P1 (against K1)
need about 183 days, so including them would trade a real signal for an
unidentifiable one. Measured result:

| | M2 | S2 | N2 | K1 | O1 | Q1 |
| --- | --- | --- | --- | --- | --- | --- |
| amplitude (cm) | 55.15 | 24.21 | 10.39 | 19.18 | 14.47 | 2.88 |
| phase (°) | 306.8 | 202.1 | 276.0 | 305.9 | 178.2 | 135.9 |

Mean 381.54 cm, **residual RMS 9.25 cm, R² 0.962** against a ~271 cm range — the
expected residual for six constituents without the shallow-water and long-period
terms. A held-out test in `tests/harmonic.test.ts` removes a 13-hour block the
size of the real October gap and checks that the fit reconstructs it.

**6 · Moon phase.** `astronomy-engine`'s `MoonPhase(date)` gives the Moon's
ecliptic elongation from the Sun: 0° new, 180° full. That is exactly the angle the
piece uses, so no phase convention is invented. The hourly series is then
**unwrapped** into a monotonic angle — each step adds the smallest rotation
consistent with the change, so 359° → 1° reads as +2°, not −358°. Hourly sampling
moves the phase about 0.5°, far below the 180° ambiguity threshold.

Quarter-phase instants are found by root-finding on the elongation, not by a mean
-period formula, so the ±14 h libration of the real lunation is respected. They are
checked against PyEphem to ±5 min — all seven reference instants in the brief pass,
e.g. the new moon of 1999-10-09 11:34 UTC is found at 11:35:04.

**7 · Events.** Each row becomes a UTC instant and a *fractional* hour index. The
series is interpolated there: `elev`, `obs` and `astro` with Catmull-Rom (cubic),
because a straight chord between hourly samples visibly flattens the crest of a
tide and would misreport the sea level at an eruption; `dep` and the phase
linearly, since both are near-linear at that scale. Day-precision events become
24-hour intervals.

**8 · Write.** `public/data/series.json` (window, and the arrays `t, obs, dep,
astro, elev, phase, filled`, plus JMA's own high/low waters and the quarter-phase
instants), `events.json` and `build-meta.json` (input hashes, datum, fit
coefficients and residual, gap list, counts, and all 23 provenance checks with
their expected and actual values).

### Provenance checks, run on every build

All 23 pass. They are stored in `build-meta.json` and surfaced in the spec sheet.

- line counts 30/31/30/31; every `hry` line 136 characters
- missing hourly values: Sep 28, Oct 13, Nov 0, Dec 0
- `hry` and `dep` for 1999-10-07, all 24 hours, against values read from JMA by hand
- 1999-10-06 07 h JST = obs 379 / dep 3; 1999-12-11 07 h JST = obs 413 / dep −10
- first line of `hry199910TJ.txt`: 0 h = 410 cm, date 1999-10-01, first high
  10:28 at 437 cm, first low 04:05 at 313 cm
- daily ranges: 26 Sep 181 cm, 7 Oct 151 cm, minimum 68 cm on 19 Sep, maximum
  228 cm on 24 Dec
- seven new/full moons against PyEphem, ±5 min

---

## Geometry

All model dimensions are **fired** sizes in mm. Shrinkage is applied only at export.

### Clock — `src/geom/clock.ts`

| Mode | θ(t) | Turns | Radius | What lines up |
| --- | --- | --- | --- | --- |
| **Cylinder** (default) | unwrapped moon phase, driving HEIGHT | one per synodic month | r₀ + the tide — θ is not an angle here | every lunation the same slice of the axis |
| Circle | lunar phase, scaled to one turn | 1 | constant, r₀ | the seam; a one-lunation window puts new moon on it |
| Synodic | unwrapped moon phase | one per synodic month | r₀ → r₁ | new moons at 0°, full moons at 180° |
| Spring–neap | 2 × unwrapped phase | two per month | r₀ → r₁ | new *and* full moon both at 0° |
| Linear | uniform in time | user-set | r₀ → r₁ | nothing — the control version |

The Moon's angular speed varies by about ±12% over its orbit, so synodic mode is
slightly uneven in time. That unevenness is the Moon's, not an error, and it is
kept. Whatever the mode, the readout always reports the *real* lunar phase, so the
interface never lies about where the Moon was.

### Circle mode — the crown of a vase

Circle mode is one turn, constant radius, and the two ends of the wall joined,
so the piece is a closed ring rather than an outward spiral. r₁ has nowhere to
grow to, so it is ignored and the panel disables it; r₀ alone sets the size. It
was the site's default until the revolved form took that place, and it is still
the mode for a **crown to sit on the rim of a thrown vase**.

At the shipped numbers:

| | |
| --- | --- |
| Window | **4–10 October 1999** — the 5 Oct and 7 Oct subplinian eruptions |
| Ring radius r₀ | **90 mm** → 186 mm fired outer diameter, 211 mm green |
| Around | 565 mm, 13 tidal cycles |
| Crown | 16 mm collar rising to 29 mm at the spring tide |
| Tide | 42 mm per cycle — wide teeth, easily carved |

The window is what decides whether the tide can be cut at all. One tidal cycle
occupies `circumference × 12.42 / window hours` of arc, and the circumference is
fixed by the vase, so a long window packs the tide into teeth too fine to cut.
Seven days on a 90 mm ring gives 42 mm teeth; twelve days gives about 13 mm, at
a 3.2 : 1 height-to-width ratio, still carvable by hand; the brief's full 97
days on the same ring gives 2 mm teeth at 18 : 1, which no method can make.
A taller crown wants a larger `k` than the revolved form's 0.08 — the shipped
numbers are chosen for the default mode, and this is the one place they show it.

`Registro completo` restores the brief's 97 days for looking at all five
eruptions at once; the tide-wavelength check will say, correctly, that it cannot
be built at this size.

The angle is still lunar. It is the elapsed moon phase, scaled so the window
covers exactly one turn — which means a window of **one synodic month is
literally the lunar phase**, with new moon on the seam, and a longer window is
the same progression compressed into a single turn. The readout reports the true
phase either way.

Closing the loop is a real change to the geometry, not a cosmetic one:

- The angle wraps on the hour *after* the last sample, so the step from the last
  station back to the first is one hour like every other step and no sample is
  drawn twice.
- The Catmull-Rom spline indexes its control points modulo the count instead of
  clamping at the ends, and the arc-length resampler leaves out the station at
  `s = length`, which is the station at `s = 0`.
- Arc length becomes modular: `sampleAtArcLength(length + 5)` is the sample 5 mm
  past the seam, not the clamped end of a spiral.
- The mesh wraps the quad strip from the last station to the first and leaves off
  the end caps.

A tube bent into a ring is a torus, so the closed wall has **Euler characteristic
0** where the spiral has 2 — and `tests/geometry.test.ts` asserts exactly that,
along with watertightness, for both. At the defaults the ring is 16 240 triangles,
320.8 cm³, with no boundary and no non-manifold edges.

The turn-spacing check is left out entirely in circle mode: one turn has no
neighbour to be spaced from.

**A ring and a spiral want very different radii.** The ring has one turn to fit
the whole record into, so it has to be wide; the spiral has to stay small enough
that three turns of wall are a buildable length. r₀ serves both, so it is set for
the default mode. Switching to a spiral mode raises checks, each with a one-click
fix — including a *lower r₀* lever for when the kiln will not allow a wider r₁.

### Cylinder mode — the form of revolution

This is what the site opens on, and it is the one mode that is not a coil at
all. Time runs **up the axis** and the tide becomes the **radius**, so the piece
is a surface of revolution: a thrown vessel whose silhouette is the record.
Every tide crest is a full circle of its own diameter, identical on every side
of the piece — which is exactly what a profile pulled against a turning wheel
makes, and the reason the mode exists.

| Dimension | Carries |
| --- | --- |
| Height z | the Moon — `pitchMm` of rise per synodic month |
| Radius R(z) | the tide — `r₀ + h_base + k × (level − min)` |
| Ring grooves | the eruptions, cut all the way round at their own height |

Because the angle is the real unwrapped lunar phase, one lunation is always the
same slice of the axis: the Moon's own uneven pace shows as rings spaced a few
per cent further apart near perigee. The piece is `turns × pitchMm` tall, and
nothing stands on top of it.

#### The defaults

| | |
| --- | --- |
| Window | **4–10 October 1999** — both subplinian eruptions, two days of margin |
| Fired | **324 mm tall**, 184 mm across at the low waters, 237 mm at the high ones |
| Green | 270 × 368 mm — inside a 400 mm kiln in both directions |
| Tide | 24 mm of height and 26 mm of relief per cycle, about thirteen swells |
| Profile slope | 1.65 : 1, so at most 11 mm of clay on a 6 mm wall |
| Clay | ~1 980 cm³ |

**The window binds the opposite way round from the ring.** On a ring the tide has
to fit *around* a fixed circumference, so a long window makes it too fine. Here
the tide has to fit *up* a height the kiln limits, and what gives out is the
profile's slope. Seven days is about as much as a 400 mm kiln will carry at a
relief worth looking at; the twelve-day crown window would need `k` down near
0.05, which is a 5 mm ripple on a 300 mm pot.

#### The path is the axis

`buildSpiral` hands off to `buildProfile` when the clock is revolved, and there
is no spline and no plan walk there, because the path is a straight line. Arc
length up it is plain height in mm, which is what makes a notch width and a
smoothing wavelength mean the same thing here as on a coil. Every station
reports a radial normal at `thetaRefDeg`, so the cursor, the notch labels and
the rib template all have one meridian to live on; nothing about the solid
depends on which one.

#### The wall is eroded, not offset

The inner surface is **not** the outer one offset inward by the wall thickness.
That model fails outright: offsetting `R(z)` inward by `t` folds through itself
wherever the silhouette turns tighter than `t`, which a tide on a vessel does
constantly. It is not what a potter's hand does either — a hand leaves the clay
*thicker* at a tight crest. That is precisely a morphological erosion:

```
R_in(z) = min over |dz| ≤ t of [ R(z + dz) − √(t² − dz²) ]
```

the set of points a disc of radius `t` still fits inside. The `dz = 0` term is
`R(z) − t`, so the wall is never thinner than nominal; and because the result is
an erosion it can never self-intersect, whatever the tide does. Past the two
rims there is no material to constrain anything, so the window is clipped there
and a cut rim keeps its nominal thickness — which is what a cut rim is.

#### Slope, not curvature

The check that replaces radial turn spacing is the **profile slope**, `max |dR/dz|`
on the hourly curve. It is what a rib has to follow on the wheel, and it also
bounds the erosion above:

```
clay(z) ≤ t · √(1 + maxSlope²)
```

so 2 : 1 is a steep flute that still comes out at 2.2 walls of clay — ordinary
thrown thickness — and past 3 : 1 the clay is over three walls thick in places,
which is a drying crack waiting to happen. Both levers move the slope *exactly*:
it goes as `k` and as `1 / pitchMm`, so the advice needs no approximation.

The slope is measured on the **hourly** relief, not on the mesh's own 0.5 mm
stations. Reading it off the stations made it a measure of the sampling rather
than of the form: squash the piece until one station spans several hours and the
interpolation flattens the tide away, so a badly squashed profile reported a
*gentle* slope and the fix solved from it landed nowhere near the limit. The
record is hourly; the form it asks for is the same whatever the mesh does.

#### The kiln limits the height, and the window is the lever

`wallLength` does not apply — there is no strip of wall to build — so it is
replaced by **piece height**: `turns × pitch ÷ (1 − shrinkage)` against the same
kiln measure as the diameter. Its fix shortens the window rather than dropping
the pitch, because the pitch is what fixes the mm per hour: fewer hours is a
shorter piece **with the tide unchanged**. A lower pitch would squash it.

Two details make that one click actually land:

- The piece rises with the Moon's phase rather than with the clock, so the same
  number of hours is up to about 12% taller near perigee. The suggestion keeps
  15% in hand.
- The panel edits dates as whole days and stores the end at 23:00, so a
  suggestion landing mid-day would be rounded *forward* by up to 23 hours the
  moment the panel refreshed — enough to push the piece straight back out of the
  kiln. Suggested ends are floored to the last whole day that fits.

#### The mesh

A revolved solid costs stations × segments × 2 vertices. 128 segments give 2.8°
facets — 0.06 mm of sag at a 200 mm radius, a hundredth of the smallest feature
any clay body holds. But the stations follow the piece's *height*, and the whole
97-day record at 0.5 mm steps is nine thousand of them: 2.4 million vertices,
which WebGL refuses to draw outright. So the segment count is budgeted to
600 000 vertices and falls back toward a floor of 16 for pieces that have
already failed their kiln check.

The solid is a sleeve — two surfaces joined by annular rims — so it is
topologically a torus, **Euler characteristic 0**, the same as the closed ring.
Faces are wound outward by hand here rather than left to the global volume flip,
because that flip reverses every triangle together and so cannot repair a
surface whose faces disagree with each other.

#### What the templates print

There is no plan to set out: every turn projects onto the same circle and the
piece is the same on every side. So `planSheet` prints the **rib** instead — the
silhouette at 1:1 green size with the axis of revolution down the left edge, the
eroded bore dashed, the eruptions in red and the dates up the axis. Cut it out
of ply or sheet plastic and it is the tool that makes the pot. The strip sheet
is the same profile cut into page lengths, for a profile too long to fit on one
piece.

**The turns are only yours in linear mode.** In synodic and spring–neap the window
sets them, so the `turns` slider is disabled there — it would otherwise look live
and respond to nothing — and the panel shows the turns the configuration actually
produces above the checks. To change the turns in those modes, move the window
dates; to change the *spacing* of the turns, move r₁ − r₀.

### Acceptable values per mode

Two limits bracket the turn count, and both are computed live from the current
radii, wall thickness, clearance, minimum feature and window length:

```
turns ≤ (r₁ − r₀) / (t_wall + clearance)      the turns must not crowd
turns ≥ the turns that make the spiral long enough that one tidal
        cycle is at least minFeature wide
```

The bracket applies to the three coiled spiral modes. **The revolved form is not
in it at all**: its turns are slices of the axis, so what brackets it is the
profile's slope against the kiln's height, which the mode's own section covers.

Measured, at a 6 mm wall, 12 mm clearance and a 5 mm minimum feature. The
spiral rows use the brief's own radii (r₀ = 30, r₁ = 140) and gain (k = 0.25),
where the bracket is **1.74 to 6.11 turns**; the two constant-radius rows use
the shipped numbers.

| Configuration | Turns | Length | Turn spacing | Tide wavelength | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Cylinder, defaults (7 days)** | 0.23 | 324 mm tall | n/a | 24.1 mm | the shipped default; all green |
| Cylinder, 97 days | 3.29 | 4.61 m tall | n/a | 24.7 mm | **fails**: 5.2 m green, no kiln takes it |
| **Circle, defaults (7 days)** | 1 | 0.57 m | n/a | 42.1 mm | a crown; wide teeth, easily carved |
| Circle, 97 days at r₀ = 100 | 1 | 0.63 m | n/a | 3.4 mm | unmakeable — teeth 2 mm wide |
| Synodic, 97 days, r₀ = 30, r₁ = 140 | 3.29 | 1.76 m | 33.4 mm | 9.4 mm | passes; long to build |
| Spring–neap, 97 days | 6.59 | 3.52 m | **16.7 mm** | 18.9 mm | **fails**: turns crowd, 3.5 m of wall |
| **Spring–neap, 7-day window** | 0.46 | 0.27 m | n/a | 20.4 mm | all green |
| Linear, 2.23 turns, 97 days | 2.23 | 1.20 m | 49.3 mm | 6.4 mm | 1.2 m, tide getting fine |
| Linear, 6.11 turns, 97 days | 6.11 | 3.27 m | 18.0 mm | 17.5 mm | at the spacing limit, 3.3 m of wall |

So, in short: **spring–neap wants a shorter window, not bigger radii.** Doubling
the turns doubles the wall, and 3.5 m of slab is not a sensible object; the
seven-day window brings it to half a turn and 0.27 m, where every check passes.

Linear mode shows the real trade-off plainly. Below about 1.74 turns the spiral is
too short and a tidal cycle narrows past the minimum feature; above 6.11 the turns
crowd closer than the wall plus its clearance. Inside that bracket, fewer turns
means a shorter wall but a finer tide, and 2.23 turns is exactly 1.2 m.

### Spiral — `src/geom/spiral.ts`

```
r(θ) = r₀ + (r₁ − r₀)·(θ − θ_start)/(θ_end − θ_start)
P(θ) = ( r·cos(θ + θ_ref), r·sin(θ + θ_ref) )
```

θ_ref defaults to −90°, which points new moon at the viewer.

The hourly points are threaded on a **centripetal** Catmull-Rom spline (α = 0.5,
which cannot form cusps or self-intersections between samples — it matters on the
tight inner turns) and then **resampled by arc length** at a 0.5 mm step. Arc-length
resampling is not cosmetic: the inner turns cover far less distance per hour than
the outer ones, so an hourly mesh would be dense at the middle and coarse at the
rim; and a notch has to be a fixed width in millimetres, which is only meaningful
against arc length. Normals are taken from central-difference tangents and flipped
where needed so that every normal points outward — a consistent outward normal is
what keeps the offset walls from crossing where the spiral curves hardest.

### Wall — `src/geom/wall.ts`

```
h(t) = h_base + k · ( s(t) − s_min )
```

`s(t)` is the chosen signal (`elev` by default, or `obs`, `astro`, `dep`), and
`s_min` is its minimum over the window, so the lowest water sits at `h_base` and
everything above it is the tide. `k` is in mm per cm.

The optional low-pass is a moving average **along arc length**, not along samples,
so its cut-off wavelength is the same everywhere on the piece; prefix sums keep it
O(n) at any window width.

The solid is the centerline offset by ±t_wall/2 along its plan normal, closed by
an outer face, an inner face, a top that follows h, a flat bottom and two end caps.
Four vertices per station are **shared** between neighbouring quads, so every
interior edge belongs to exactly two triangles by construction. Geometry is computed
in plan (x, y) with height upward and mapped to three.js's Y-up space as
`(x, h, −y)` — a rotation, so handedness and face winding are preserved. The whole
index buffer is flipped once if the signed volume comes out negative, which is
cheaper and safer than reasoning about the sign of every face by hand.

### Notches — `src/geom/notches.ts`

| | width | depth |
| --- | --- | --- |
| instant event | `notchWidth` (3 mm) | `d₀ + k_e · plume_km` (4 mm + 1.5 mm/km) |
| unknown plume | `notchWidth` | `d₀`, plus a "plume unknown" flag |
| day precision | the arc length of that 24 h | `d₀ / 2` |

Imprecision therefore reads as a wide, shallow cut rather than a sharp one in the
wrong place. At the default size a day is ~7 mm of arc on the innermost turn and
~30 mm on the outermost.

The notch sides are kept vertical by inserting **four exact samples per notch** —
at each edge, and 0.01 mm inside it. The outer pair carries the full top edge, the
inner pair carries the notch floor, so the side of the cut spans 0.01 mm of arc:
vertical for every practical purpose, and still watertight. Geometry is built in two
passes for this reason: a provisional centerline locates the notches, then the real
centerline is built with those edge positions forced into the sample set.

A cut deeper than the wall is clamped to leave 1 mm of floor, and the event is
reported in `clampedNotches` and flagged in the panel rather than silently thinned.

### Validation — `src/geom/validate.ts`

Live in the panel, and carried into the spec sheet.

| Check | Rule | At the defaults | Lever when it fails |
| --- | --- | --- | --- |
| Turn spacing | ≥ t_wall + clearance (6 + 12 mm) | *not shown — the revolved form has no neighbouring turn* | r₁, r₀, clearance, turns |
| Profile slope | max \|dR/dz\| ≤ 2 : 1 (revolved only) | **1.65 : 1** ✓ | pitch, k |
| Green diameter | fired ÷ (1 − shrinkage) ≤ kiln limit | **269.8 mm** ≤ 400 ✓ | the outer radius, shrinkage, kiln limit |
| Tide wavelength | one M2 cycle ≈ length × 12.42 / window hours, ≥ min feature | **24.1 mm** ≥ 5 ✓ | pitch (revolved), radius, turns, window, smoothing |
| Tide relief | between h_base and the maximum | **2.4 – 28.7 mm** ≤ 90 ✓ | k, h_base, maximum height |
| Piece height | green height ≤ kiln limit (revolved only) | **368.4 mm** ≤ 400 ✓ | the window |
| Wall length | handwork budget | *not shown — nothing is built as a strip here* | window, radii, turns |
| Notches | none clamped | 2 of 2 ✓ | depth per km, d₀, k, h_base |
| Eruptions in the window | all of them get a notch | **2/5** — warn | the window dates — no button |

The rows a mode cannot act on are left out rather than shown as a meaningless
pass: `turnSpacing` and `wallLength` belong to the coiled forms, `profile` and
`pieceHeight` to the revolved one.

The default carries one amber row, and it is a choice rather than a fault: the
twelve-day window leaves e1, e4 and e5 off the piece. The check says so in those
words and offers no button, because the only lever is the dates and only the
maker knows whether those eruptions belong on this object.

**A failing check says what to change, to what, and will do it for you.** Every
limit is a one-line inequality, so `advice.ts` solves each one for the parameter
easiest to move. The panel prints the result under the row — "Raise r₁ to 149 mm
(now 140.0), or drop the clearance to 10.7 mm; in this mode the Moon fixes the
turns, so the radius is the lever" — followed by a button that applies it:
`→ r₁ → 149 mm`.

The button and the words cannot disagree, because the advice sentence is
*composed from* the fix object rather than written beside it. Five rules govern
what a fix may do, each with a test over eleven deliberately broken
configurations:

- **It clears its own check.** Always, in every configuration.
- **It never turns a green check red.** Where widening r₁ would push the piece
  out of the kiln, the suggestion is capped at the largest r₁ the kiln takes and
  the lever moves to whatever is still free — dropping the turns in linear mode,
  or accepting a smaller clearance. Where even that cannot work, there is no
  button and the advice says to shorten the window, thin the wall or find a
  bigger kiln.
- **It never cascades.** At most one other check may be unsettled, only ever to
  a warning, and that check must then offer its own way out. Real trade-offs are
  allowed to show: the short window shortens the wall but squeezes two notches
  against a lower crest, and the notch row says so.
- **It proposes a value the panel can hold.** Slider bounds and fix values both
  come from `PARAM_RANGES`, one table. Keeping them apart was a bug: "r₁ → 148.6"
  fed into a 1 mm slider came back as 149, and a fix that rounded the other way
  would have silently undone itself. Every proposed value is snapped to its
  parameter's own step, toward the side that keeps it valid, and a test rounds
  each one through the slider's arithmetic and asserts the check still passes.
- **It is undoable.** Applying a fix pushes a history entry, so the browser's
  Back button restores the previous configuration exactly — the one action that
  changes several parameters at once without the user having touched them.

`tests/advice.test.ts` also takes the number each warning *prints*, feeds it
back in and asserts the check then passes, so the prose cannot drift from the
rule it is advising about.

Two pieces of arithmetic make this exact rather than approximate. The spiral's
length is needed before it is built, and is computed in closed form for an
Archimedean spiral r = a + bθ:

```
L = ∫ √(r² + b²) dθ = (1/2b)[ r√(r² + b²) + b² ln(r + √(r² + b²)) ]  from r₀ to r₁
```

Mean circumference × turns is the b → 0 limit of that and is off by 2–3% when the
radius grows fast relative to the turn spacing; the closed form agrees with the
resampled centerline to the millimetre. The turn count for a target length is then
found by bisection on it.

The mesh is checked for watertightness by counting **directed** edges: a closed,
consistently oriented surface uses every undirected edge exactly twice, once in
each direction, so one pass catches both holes (an edge used once) and flipped
faces (an edge used twice the same way). The default mesh is 28 364 triangles,
Euler characteristic 2, signed volume +550.5 cm³.

### Measured values, against the brief's hand estimates

| | brief | measured |
| --- | --- | --- |
| turn spacing | ~34 mm | 33.4 mm |
| wall length | ~1.7 m | 1.763 m |
| tide wavelength | ~9 mm | 9.4 mm |
| fired diameter | ~286 mm | 286.0 mm |
| green diameter @12% | ~325 mm | 325.0 mm |
| wall rise above h_base | ~57 mm | **67.6 mm** |

The last one is a real correction. The brief's ~57 mm came from the largest *daily*
range, 228 cm. The window's full minimum-to-maximum range is 271 cm, so the wall
rises ~68 mm above h_base and stands 82.6 mm tall at the spring tide of 24 December.

**One consequence worth seeing before you commit clay.** At the brief's `k = 0.25`
the tide swings most of that 68 mm every 12.4 hours — which is 9.4 mm of arc. The
object is therefore a very fine comb, not a gently undulating wall: about 190
tooth-pairs over 1.76 m. That is a faithful rendering of the record and the
fabrication checks pass, but it is a lot of work in clay. The `smoothing` parameter
(low-pass along the arc) and a lower `k` are there to trade fidelity for
buildability, and the seven-day window preset is there to trade duration for the
same. The shipped defaults take the second road: `k = 0.08` over seven days,
which is why they look nothing like these numbers.

---

## Making it in clay

A sequence that works with the exports:

1. **Measure your own shrinkage** on a test tile and put it in the panel before
   exporting. 12% is a placeholder, and every dimension on the templates scales
   by 1/(1 − shrinkage).
2. Roll the slab to green thickness (6.8 mm at 12%) and compress both faces.
3. Stiffen to soft leather-hard: firm enough to stand, soft enough to bend.
4. Cut the base line and the whole top profile **flat**, blade held vertical,
   against the 1:1 wall-strip template. Leave the eruption notches.
5. Wrap on the former, join the single seam, paddle true, and get the former out
   before drying shrinkage grips it.
6. **Cut the notches at leather-hard on the standing wall.** Their vertical
   sides are the point; cutting them flat and then bending distorts them.
7. Dry slowly, one to two weeks, with the top edge tented. Thin teeth dry far
   faster than the collar and crack at the roots.
8. Lute the 15 mm collar to the vase rim at leather-hard, both parts at the same
   moisture.

Paper clay or a grogged stoneware. The red belongs *in* the cut — underglaze or
slip inlaid and wiped back — so the colour reads as a notch rather than a mark.

One trap worth knowing: **smoothing does not widen the teeth.** It attenuates
their height while leaving every zero crossing in place, so smoothing a comb
leaves the same number of peaks, merely shorter — a ripple, not a form. Only a
shorter window, a larger ring or (on the revolved form) a taller pitch gives
each tide more room.

---

## The site

Full-bleed 3D view, a timeline strip along the bottom, a collapsible parameter
panel on the right, a readout at top left. Desktop first; on a phone the readout
becomes a scrollable strip and the panel starts folded away.

- **3D view** — matte clay, one soft key light plus hemisphere fill, no environment
  reflections, ACES tone mapping, soft shadow on a ground plane, slow auto-rotate
  after 4 s of idle. Orbit, pan and zoom. Notch overlays glow red, and the bloom
  pass is *selective*: it touches that overlay and nothing else, so the clay can
  never bloom.
- **Timeline strip** — the ground-truth view of the same data. Observed sea level
  is the solid line, the astronomical tide the faint line beneath it, and the shaded
  band between them *is* the anomaly, because `obs − astro = dep`. Reconstructed
  hours are shaded, hours outside the current window are dimmed, new and full moons
  are glyphs along the top, eruptions are red verticals (and red bands for the
  day-precision pair).
- **Scrubber and window selector** — the strip does three jobs at once, told
  apart by what the pointer does rather than by a mode switch:
  - **Hover** travels the piece. A blade follows the wall and the readout shows
    UTC, Quito (UTC−5) and Tanegashima (UTC+9) time, sea elevation, anomaly, moon
    phase and illumination, wall height, position along the wall, the nearest
    eruption, and whether the hour was observed or reconstructed. Looking changes
    nothing. ←/→ and PgUp/PgDn do the same from the keyboard.
  - **Click the start, then click the end** to set the window. The first click
    plants a dashed edge and the readout line says what to do next; Escape backs
    out. The window is never allowed below 24 h, and a pair of picks closer than
    that grows around the midpoint rather than snapping to one side.
  - **Drag inside the window** to slide it along the record, keeping its length.
    The window's own edges and a grip bar along its top make the draggable band
    explicit, and the cursor changes over it.

  A click is a press and release that travelled less than 4 px, so it can never
  be confused with a drag. Drag updates are coalesced to one per animation frame
  — rebuilding the wall on every `pointermove` would do the same work three or
  four times a frame — and the URL is held still for the duration, so a drag
  leaves exactly one history entry and Back undoes the whole move.
- **Events list** — click one and the camera eases to its notch (300–600 ms ease-out,
  skipped under `prefers-reduced-motion`); the card gives the source, the precision
  and the plume height.
- **Parameters** (Tweakpane) — clock mode, window dates, r₀/r₁, θ_ref, signal,
  h_base, k, smoothing, wall thickness, notch scales, shrinkage, kiln limit,
  clearance, minimum feature, strip length, page size.
- **ⓘ on everything** — every control, every section heading and every check
  carries a help icon. The text says what the control does *and* what values are
  worth setting it to, each dropdown explains all of its options, and the ones
  that depend on the configuration quote the live numbers: the clock-mode tooltip
  names the turns each mode would give and the bracket they have to fall in; the
  k tooltip says how many mm of wall the present gain produces and how fine that
  makes the comb; the shrinkage tooltip gives the current green diameter. A
  failing check's tooltip leads with the limit and the fix. Hover, or tab to the
  icon; Escape closes it; on a touch screen it toggles on tap.
- **A measured summary** above the checks — turns, centerline length and fired
  diameter — so the turns the configuration actually produces are always visible,
  whichever clock mode is in charge of them.
- **One-click fixes** — a check that is not passing carries a button with the
  exact change it will make (`→ r₁ → 149 mm`, `→ ventana corta`, `→ k → 0.27
  mm/cm`). Applying one pushes a history entry, so Back undoes it.
- **URL hash** — every non-default parameter is in the hash, so any configuration
  is a shareable, reproducible link, and pasting one back restores it exactly.
- **Language** — Spanish by default, English from the `EN` button or the panel.

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| bg | `#0E0E0F` | page and 3D background |
| fg | `#ECE9E3` | text, clay base |
| muted | `#8B8881` | secondary text, the `astro` line |
| rule | `#26262A` | grid lines, dividers |
| accent | `#FF2A2A` | eruptions only |
| print bg / ink | `#FFFFFF` / `#141414` | templates and spec sheet |

---

## Exports

Every export carries the parameter set and an 8-character config hash (FNV-1a over
the canonically sorted parameters), so a template, a render and a spec sheet can
always be matched. Filenames are `two-clocks_<what>_<hash>.<ext>`.

1. **Render (PNG)** — the current view at 1×, 2× or 4×, on off-black or transparent
   background, with plan / three-quarter / elevation presets.
2. **Mesh** — binary STL and GLB, in mm, at fired size or green size. The STL writer
   is hand-written rather than taken from three.js so the bytes are deterministic
   for a given parameter set and the vertices are the geometry module's own numbers.
   The optional base disc is exported as its own closed solid, so the wall stays
   watertight.
3. **1:1 templates (SVG, and tiled PDF)**, scaled up by 1/(1 − shrinkage):
   - *Plan sheet* — centerline, inner and outer wall lines, notch outlines in red
     with their event ids, the new-moon direction, day ticks every 7 days, centre
     cross. **On the revolved form this sheet is the rib instead**: the silhouette
     at 1:1 with the axis of revolution down the left edge, the eroded bore dashed,
     the eruptions in red and the dates up the axis — cut it out and it is the tool
     that makes the pot.
   - *Wall strips* — the wall unrolled along its centerline (x = arc length,
     y = height), split into strips no longer than `stripMaxMm` **at green size**,
     with numbered joints, 10 mm overlap tabs, the date range on each strip, and the
     notches outlined in red so a cut is never mistaken for a tide. On the revolved
     form the same sheet reads as the rib's own profile cut into page lengths,
     since there arc length is height and height is radius.
   - Every sheet carries a **100 mm calibration square**, a "print at 100%" note and
     the config hash. SVG roots use real units — `width`/`height` in mm with a
     matching viewBox in mm — so files print at true size; the square is there to
     catch the viewers that ignore units.
   - The PDF lays each sheet over a grid of A4/A3/Letter pages with 10 mm margins,
     corner crop marks, edge-midpoint registration ticks, row/column labels and
     "page n of N". At the defaults that is 7 A4 pages: 3 for the rib
     (197 × 536 mm) and 4 for the strips (404 × 229 mm).
4. **Spec sheet (JSON and one-page PDF)** — parameters, equations, data sources with
   URLs and SHA-256 hashes, the datum and whether it was verified, the gap list with
   the fit residual, the event table with precision flags and notch depths, the
   fabrication checks, build date and code version, and the framing sentence. This is
   the label that makes the piece verifiable.

---

## Tests

```bash
npm test
```

199 tests in six files.

- `parseJma.test.ts` (20) — file shape, missing-value counts, every hand-read value
  from the brief, the daily-range extremes, extremum blocks, and the error paths:
  a short line, a wrong station code, an unreadable field. One test asserts directly
  that column slicing and whitespace splitting disagree, so the format can never
  quietly regress to the wrong one.
- `harmonic.test.ts` (16) — the linear solver against a known system and against a
  singular one; Rayleigh separation for the six chosen constituents and against the
  two excluded ones; recovery of a synthetic M2+K1 tide to 3 decimal places;
  constituent ordering and residual on the real record; a held-out 13-hour block.
- `moon.test.ts` (16) — the phase convention, all seven PyEphem reference instants
  to ±5 min, unwrapping forwards and backwards, ~360° per synodic month over the real
  series, and the phase labels.
- `geometry.test.ts` (70) — the built data's own invariants, the three clock modes,
  arc-length resampling and forced sample positions, notch depths and widths, vertical
  notch sides, "cuts only inside notches and nowhere else", **watertightness and Euler
  characteristic 2**, green-size scaling, the fabrication checks passing at defaults
  and failing when they should, the short-window preset, and URL-hash round-tripping.
  Circle mode gets its own block: one turn whatever the window, a constant radius
  that ignores r₁ entirely, 2πr₀ around, no duplicated sample at the seam, arc
  length that wraps rather than clamps, outward normals, a watertight torus of
  Euler characteristic 0, and the turn-spacing check correctly absent. The
  revolved form gets another: arc length equal to height with no direction in
  plan at all, the tide coming out of the circumference rather than the top, one
  radius per station all the way round (the surface-of-revolution property
  itself), a bore that is never thinner than nominal and never folds — checked
  at four settings including ones that would turn a plain offset inside out —
  with the clay inside the `t·√(1 + slope²)` bound, a watertight sleeve of Euler
  characteristic 0, a diameter taken from the crest rather than r₀, the slope
  scaling exactly as `1/pitch` and as `k`, the right checks present and the coil
  ones absent, a squashed profile failing and its fix clearing it, the piece-height
  fix shortening the window while leaving the tide's shape alone, eruptions cut as
  rings reaching every quadrant, and `z`, `profile` and `bore` staying empty in
  all four other modes.
- `export.test.ts` (35) — STL byte layout, triangle count, unit normals and bounds;
  strips summing back to the centerline within 0.5 mm with no gaps and a 10 mm tab on
  all but the last; SVG mm units matching the viewBox 1:1, the 100 mm square, the
  config hash, well-formed XML; and the spec sheet's contents.
- `advice.test.ts` (42) — the closed-form spiral length against the real centerline
  to within 1%; the turn bracket; that advice is present exactly when a check is not
  passing and always names a number; and, for each lever in turn, that **the number
  the warning printed makes that check pass when fed back in**. The one-click fixes
  are checked against thirteen broken configurations, revolved, circle and spiral, for all
  five rules above —
  clears its own check, breaks no green one, cascades at most one warning, lands on
  a value the sliders can hold (including a round trip through their rounding), and
  is idempotent. Plus the help registry: an entry for every control the panel wires
  up and none it does not, substantial text in both languages, every dropdown option
  named, and the tooltips that quote live numbers actually changing when the
  configuration does.

The acceptance tests from the brief are all covered: parser values, astronomy to
±5 min, a watertight mesh, notch count equal to event count, strip lengths summing
to the centerline within 0.5 mm, and a 100 mm square that measures 100 mm.

---

## Project layout

```
data/raw/jma/          8 JMA text files, never edited
data/raw/events.csv    curated Pichincha event list
data/raw/MANIFEST.json URL, retrieval date, SHA-256, bytes per file; datum
scripts/fetch-jma.ts   download the raw files and refresh the manifest
scripts/build-data.ts  raw → public/data/*.json, deterministic, checked
scripts/dev/            report.ts (measured geometry per parameter set)
                        advice.ts (warning text for failing configurations)
                        fixes.ts  (applies every one-click fix and reports it)
public/data/           series.json, events.json, build-meta.json (committed)
src/data/              parseJma.ts  harmonic.ts  moon.ts  series.ts
src/geom/              params.ts (incl. PARAM_RANGES)  clock.ts  spiral.ts
                       wall.ts  notches.ts  validate.ts  advice.ts
src/export/            png.ts  mesh.ts  templates.ts  pdf.ts  spec.ts  download.ts
src/ui/                scene.ts  timeline2d.ts  scrubber.ts  panel.ts  tooltip.ts
src/i18n/              strings.ts (interface)  help.ts (tooltips)
tests/                 six suites, 199 tests
```

Stack: Vite + TypeScript, three.js (OrbitControls, GLTFExporter), `postprocessing`
for the selective bloom, `astronomy-engine` for the Moon, Tweakpane v4,
jsPDF + svg2pdf.js, `@fontsource` (Inter, JetBrains Mono), Vitest, `tsx`.

---

## Limitations and open questions

- **Event coverage.** Five curated events. Wright et al. 2023's roughly weekly
  dome-destroying eruptions through Nov–Dec 1999 are not in the CSV, and neither are
  the phase-2 IG-EPN daily counts. Adding rows needs no code change.
- **Event times.** e1 and e4 are known only to the day; e2's 22:25 UTC is an advisory
  time, not the onset. The IG-EPN reports for 26 Sep, 5 Oct and 10 Nov have not been
  checked against the CSV.
- **The harmonic fit is for gap filling only.** Six constituents over 122 days,
  residual RMS 9.25 cm. It is never used for any hour that has an observation, and
  it is not a tidal prediction.
- **e2 and e3 cut deep.** At 15 km and 14 km of plume their notches are 26.5 and
  25.0 mm — a third of the wall's height, and in the short-window preset they clamp
  against the 1 mm floor near the inner turns. `notchDepthPerKm` is the control.
- **The datum is verified, the station position is approximate.** The latitude and
  longitude in `series.json` are Tanegashima's tide station to about a hundred metres;
  nothing in the geometry depends on them.
- **Each form wants different numbers.** r₀ is the ring's radius, the spiral's
  inner radius and the revolved form's core all at once, and k is a height on
  three of the modes and a radius on the fourth. No single set suits them all,
  so the shipped numbers suit the default mode — and they are chosen to leave
  every other mode green as well, so changing mode is a change of form rather
  than a wall of red. Where a mode does want something different, it raises a
  check with a fix rather than silently resizing the piece.
- **The revolved form cannot carry a long window.** Its height is what the kiln
  caps, and the tide has to fit up that height: past about a week the profile's
  slope goes past 2 : 1 and the clay at the crests runs to three times the wall.
  The 97-day record comes out 4.6 m tall. The ring has the mirror-image problem
  — it cannot be both long in time and coarse in the clay — for the opposite
  reason.
- **A ring cannot be both long in time and coarse in the clay.** The kiln caps
  the radius at r₀ = 173 mm, which is 1 087 mm around; at 97 days that is a
  5.8 mm tidal cycle at best. A circle that clears the minimum-feature check
  comfortably wants a window of about two months or less.
- **Framing.** The site says, in Spanish and English, that the Moon alignment is
  *shown*, not explained. Four of the five eruptions fall between 318° and 32° — within
  about 75° of new moon — and the fifth at 187°, near full. That is five events. It is
  a shape in the data, not a finding, and the piece should not be read as one.

---

## Sources

- [JMA observed tide data, Tanegashima](https://www.data.jma.go.jp/kaiyou/db/tide/genbo/genbo.php?stn=TJ)
- [JMA observed tide file format](https://ds.data.jma.go.jp/kaiyou/db/tide/genbo/format.html)
- [Wright et al. 2023, *Bulletin of Volcanology*: Guagua Pichincha 1999–2001](https://link.springer.com/10.1007/s00445-023-01626-3)
- [IG-EPN reports on ReliefWeb, 7 Oct 1999](https://response.reliefweb.int/latin-america-and-caribbean/reports?page=11519)
- [IG-EPN reports on ReliefWeb, 10 Dec 1999](https://response.reliefweb.int/latin-america-and-caribbean/reports?page=11488)
- [CIMSS: GOES-8 imagery of the 7 Oct 1999 eruption](https://cimss.ssec.wisc.edu/goes/misc/991007_volcano.html)
- [NOAA OSEI: Guagua Pichincha, 5 Oct 1999 (archived)](https://webarchive.library.unt.edu/web/20130216070607/http://www.osei.noaa.gov/guagua.html)
- [Smithsonian GVP: Guagua Pichincha](https://volcano.si.edu/volcano.cfm?vn=352020)
