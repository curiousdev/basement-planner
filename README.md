# Basement Planner

Design a basement finish, and get a permit-ready drawing set out the other side.

Basement Planner is a local-first design tool for finished-basement projects. You draw
the existing foundation, lay out the rooms you want, and the app maintains a single
coordinated building model behind the scenes. From that one model it generates the
**multilayer architectural drawing set** a building department expects — floor plan,
egress plan, electrical, plumbing, mechanical, framing sections, and a code compliance
summary — all at real scale, on real sheets, with a real title block.

The goal is that the thing you hand the plan reviewer is generated, not redrawn.

---

## Project status

**Greenfield.** This repository currently contains the design documents that define the
project; the application scaffold has not landed yet. This README describes the target
system so that the architecture, file format, and drawing semantics are settled before
code is written. See [Roadmap](#roadmap) for what is built vs. planned, and
[CLAUDE.md](./CLAUDE.md) for the working agreement any contributor (human or agent)
should follow inside this repo.

If you are picking this up cold: read this file, then CLAUDE.md, then start at
`packages/core` — every other package is downstream of the data model.

---

## Why this exists

Finishing a basement is one of the most commonly permitted residential projects and one
of the most commonly rejected. The rejections are boring and repetitive: the egress
window is 5.3 sq ft instead of 5.7, the ceiling clears 7'-0" everywhere except under the
main beam, the new bedroom has no smoke alarm shown, receptacle spacing violates the
12-foot rule, the stair headroom got eaten by the new soffit, or the drawings simply
don't show enough to review.

Every one of those is a computable check against a geometric model. So the model does
the checking, continuously, while you draw — and the drawing set is a projection of the
model rather than a separate artifact that drifts away from it.

---

## What it does

### Model the existing basement

- Trace the foundation from a photo, a scan, a PDF survey, or typed dimensions
- Foundation walls (poured, block, ICF, stone) with thickness, height, and bearing role
- Existing conditions: beams, posts, columns, bulkheads, chases, floor drains, sump pit,
  furnace/water heater/panel clearances, window wells, walkout and stair locations
- Slab elevation, joist direction and depth, underside-of-joist and underside-of-duct
  heights — the two numbers that decide whether a space is habitable at all

### Lay out the finished space

- Interior partitions with real framing (2x4/2x6, 16" or 24" o.c., steel stud, furring)
- Rooms auto-detected from enclosed wall loops; area, perimeter, and minimum dimension
  computed live
- Doors, windows, egress windows, window wells, pass-throughs, and openings with swing,
  clear width, and rough opening
- Stairs with rise/run solved from floor-to-floor height, plus landings, headroom
  envelope, and handrail geometry
- Fixtures, appliances, casework, and furniture from a parametric catalog
- Soffits, dropped ceilings, bulkheads, and chases modeled as real volumes so they
  actually intrude on clear height

### Coordinate the trades

Each discipline is a layer over the same geometry, not a separate drawing:

| Layer | Contents |
| --- | --- |
| Architectural | Walls, rooms, openings, dimensions, finish schedule |
| Egress & life safety | Escape openings, egress path, travel distance, alarms, extinguishers |
| Electrical | Panel, circuits, receptacles, switches, luminaires, GFCI/AFCI zones, homeruns |
| Plumbing | Supply, DWV, vents, riser diagram, fixture units, backwater valve, ejector pit |
| Mechanical | Supply/return registers, ducts, dryer and bath exhaust, combustion/makeup air |
| Framing & structure | Stud layout, headers, beam pockets, posts, footings, fire blocking |
| Insulation & envelope | Assembly R-values, vapor retarder class, rim joist detail |
| Demolition | Existing-to-remain vs. removed vs. new, drawn with the conventional line weights |

Layers are independently visible, printable, and checkable, and they cross-check each
other — a bedroom added on the architectural layer demands a smoke alarm on the life
safety layer and an AFCI circuit on the electrical layer.

### Check the code while you draw

A rule engine evaluates the model continuously and reports findings inline, ranked
`error` / `warning` / `info`, each linked to the element that caused it and the code
section that governs it. The bundled rule pack targets the **2021 IRC** with the checks
that actually decide basement permits:

- **R305** minimum ceiling height, including the reduced clearance allowed at beams and
  ducts, evaluated as a clear-height field across the floor rather than a single number
- **R310** emergency escape and rescue openings: net clear area, minimum width and
  height, sill height, window well size, projection, and ladder requirement
- **R311.7** stairs: riser/tread limits, uniformity tolerance, width, headroom, landings,
  handrail height and grip, guards
- **R302** fire separation: garage separation, under-stair protection, fire blocking,
  draftstopping
- **R314 / R315** smoke and carbon monoxide alarm placement and interconnection
- **R303** light, ventilation, and the mechanical alternative
- **R306 / P2708** minimum fixture clearances and shower size
- **E3901 / E3902 / E3903** receptacle spacing, GFCI and AFCI coverage, required lighting
  and switching
- **M1505 / M1507** bath exhaust rates and whole-house ventilation
- **N1102 / IECC** basement wall and rim joist insulation by climate zone
- Habitable room minimum area and minimum horizontal dimension
- Egress door, hallway width, and door clear-width requirements

Jurisdictions differ, so rule packs are **data plus pure predicates**, and a jurisdiction
overlay can tighten, relax, or replace any rule without forking the base pack. Every
finding cites its source, and the compliance summary sheet is generated from the same
evaluation — so the sheet cannot claim compliance the model doesn't have.

### Produce the drawing set

One command turns the model into a sheet set:

```
A0.0  Cover, project data, code summary, sheet index
A1.0  Existing / demolition plan
A2.0  Proposed floor plan, fully dimensioned
A2.1  Reflected ceiling plan and clear-height map
A3.0  Wall sections, rim joist detail, soffit detail
A4.0  Door, window, room finish, and fixture schedules
LS1.0 Egress and life safety plan
E1.0  Electrical plan, panel schedule, load calculation
P1.0  Plumbing plan and DWV riser diagram
M1.0  Mechanical plan and duct layout
S1.0  Framing plan and structural notes
```

Sheets are composed at true scale (1/4" = 1'-0" by default) on standard sizes
(ANSI A–D, ARCH A–D, ISO A4–A1), with a configurable title block, revision block, north
arrow, graphic scale, drawing notes, and automatic sheet cross-references. Dimension
strings, room tags, door/window marks, and schedules are generated from the model, so
renumbering a door updates the plan, the schedule, and the callout together.

Exports: **PDF** (vector, multi-sheet, layered), **DXF** for the surveyor or engineer,
**SVG** and **PNG** for the web, **glTF** for the 3D walkthrough, **IFC** for
interoperability, and **CSV/XLSX** for schedules and takeoffs.

### Everything else it gets you

- **3D preview** — the 2D model extrudes to a walkable 3D view, including soffits and
  the clear-height envelope, so head-bump problems are visible before framing
- **Materials takeoff and cost estimate** — studs, plates, sheet goods, fasteners, drywall,
  insulation, flooring, trim, fixtures, with waste factors and a regional cost book
- **Version history and revisions** — named revisions, revision clouds, delta drawings
  between any two versions, and a revision block that fills itself in
- **Permit packet** — sheet set plus code summary, product data, and the jurisdiction's
  application form fields, bundled into a single submission PDF
- **Local-first storage** — projects are plain versioned JSON on your disk; no account
  required, no cloud dependency, and the format is documented and diffable
- **Headless CLI** — regenerate any sheet or the full packet in CI, or diff two revisions
- **Import** — DXF/DWG underlays, PDF underlays with scale calibration, LiDAR room scans,
  and photo-based tracing

---

## Architecture

A TypeScript monorepo. The dependency direction is strict and one-way: geometry knows
nothing about the building, the building model knows nothing about drawing, and drawing
knows nothing about the UI.

```
packages/
  geometry/   Vectors, segments, polygons, boolean ops, offsets, wall joins,
              room-loop detection. Pure math, no domain concepts.
  core/       The building model: entities, the .bsmt schema, migrations, the
              command stack (undo/redo), selection, and derived queries.
  codes/      Rule engine, IRC rule pack, jurisdiction overlays, findings.
  render/     2D scene graph, snapping, hit testing, line weights, hatches,
              symbol library. Canvas and SVG backends share one scene.
  sheets/     Sheet layout, title blocks, viewports, dimension strings,
              tags, callouts, schedules, the compliance summary.
  export/     PDF, DXF, SVG, PNG, glTF, IFC, CSV writers.
  estimate/   Quantity takeoff and cost roll-up.

apps/
  studio/     The React application: canvas editor, layer panel, properties,
              findings inspector, 3D preview, sheet set preview.
  cli/        Headless generation: `basement render`, `basement check`,
              `basement diff`, `basement takeoff`.
```

**Stack:** TypeScript (strict), pnpm workspaces, Vite, React, Zustand for UI state, Zod
for schema and validation, three.js for the 3D preview, Vitest for unit tests, Playwright
for end-to-end, and a hand-rolled DXF writer because DXF R12 ASCII is simpler than any
dependency that emits it.

**Canonical units:** all lengths are integers in **1/32 inch**. Feet-inches, decimal feet,
and metric are display formats only. This is not negotiable — see CLAUDE.md for why.

---

## Getting started

> Not yet runnable — the scaffold is the first roadmap item. These are the commands the
> repo is being built to support.

```bash
pnpm install
pnpm dev            # launch the studio app
pnpm test           # unit tests
pnpm test:e2e       # Playwright
pnpm typecheck
pnpm lint
pnpm build
```

Headless:

```bash
pnpm basement check    myhouse.bsmt                       # code findings, non-zero exit on errors
pnpm basement render   myhouse.bsmt --sheets all --out permit.pdf
pnpm basement takeoff  myhouse.bsmt --out materials.csv
pnpm basement diff     rev-a.bsmt rev-b.bsmt --out delta.pdf
```

---

## The `.bsmt` file format

A single JSON document, versioned and migrated forward, designed to be readable in a
diff:

```jsonc
{
  "schemaVersion": 1,
  "project": { "name": "…", "address": "…", "jurisdiction": "us.co.denver" },
  "settings": { "displayUnits": "ft-in", "climateZone": "5B", "codeEdition": "irc-2021" },
  "levels":   [ { "id": "…", "name": "Basement", "elevation": -2880, "floorToFloor": 3072 } ],
  "entities": { /* walls, openings, rooms, fixtures, circuits, ducts, … keyed by id */ },
  "layers":   [ /* visibility, print state, line weight overrides */ ],
  "sheets":   [ /* sheet set definition, viewports, title block data */ ],
  "revisions":[ /* named revisions with clouds and descriptions */ ]
}
```

Entities are a flat, id-keyed map with explicit references — no nesting, no cycles, no
implicit ordering. Every schema change ships with a migration and a fixture.

---

## Roadmap

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Design docs, architecture, file format | ✅ this commit |
| 1 | Monorepo scaffold, `geometry`, `core` model + schema + undo | ⬜ |
| 2 | 2D editor: walls, openings, rooms, snapping, dimensions | ⬜ |
| 3 | Rule engine + IRC pack, findings inspector | ⬜ |
| 4 | Sheet composition, title blocks, schedules, PDF export | ⬜ |
| 5 | Trade layers: electrical, plumbing, mechanical, framing | ⬜ |
| 6 | 3D preview, clear-height map | ⬜ |
| 7 | Takeoff and estimate, DXF/IFC export, revisions and deltas | ⬜ |
| 8 | Import: PDF/DXF underlay, scan and photo tracing | ⬜ |

---

## A necessary disclaimer

Basement Planner generates drawings and flags likely code problems. It is not a licensed
design professional, it does not know your local amendments, and it does not know what
your plan reviewer had for breakfast. Structural modifications, underpinning, egress
cutting into foundation walls, and service changes need a licensed engineer or architect.
Check the output. Submit it as your own work, because it is.

---

## License

MIT. The `LICENSE` file lands with the phase 1 scaffold.
