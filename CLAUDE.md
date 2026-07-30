# CLAUDE.md

Working agreement for this repository. Read [README.md](./README.md) first for what the
product is; this file is about how to build it without breaking it.

## Current state

The repo is greenfield — docs only. Phase 1 (monorepo scaffold, `geometry`, `core`) is
the next thing to land. Until it does, treat the architecture and invariants below as
decided: they exist so that the first thousand lines don't have to be rewritten.

If you are asked to implement a feature that has no home yet, create the package the
architecture calls for rather than putting it somewhere convenient.

## Commands

```bash
pnpm install
pnpm dev              # studio app on :5173
pnpm test             # vitest, whole workspace
pnpm test -- <file>   # single file
pnpm test:e2e         # playwright
pnpm typecheck        # tsc --noEmit across all packages
pnpm lint             # eslint + prettier check
pnpm build            # build every package and app
```

Run `pnpm typecheck` and `pnpm test` before committing. Both must be clean.

## Architecture and dependency direction

```
geometry  ←  core  ←  codes
                  ←  render  ←  sheets  ←  export
                  ←  estimate
                          ↑
                     apps/studio, apps/cli
```

Dependencies point left. Enforce it:

- **`geometry`** is pure math. It must not know what a wall or a room is. If a function
  needs a building concept, it belongs in `core`.
- **`core`** owns the building model, the `.bsmt` schema, migrations, and the command
  stack. It must not import React, canvas, DOM, or anything that draws.
- **`codes`** reads the model and emits findings. Rules are pure functions of
  `(model, context) → Finding[]`. No side effects, no I/O, no rendering.
- **`render`** turns the model into an abstract 2D scene. It must not mutate the model.
- **`sheets`** composes scenes into paper. It must not query the model directly — it
  consumes what `core` and `render` expose.
- **`export`** writes bytes. It contains no layout logic.
- **`apps/*`** are the only places allowed to touch the DOM, the filesystem, or global
  state.

A change that needs an upward import is a design problem, not an import problem. Say so
instead of adding the import.

## Non-negotiable invariants

**1. Lengths are integers in 1/32 inch.** The canonical unit is the branded type
`Length = number & { __brand: 'Length' }`, an integer count of 1/32". Reasons: floats
accumulate error across boolean operations and wall joins until a room loop fails to
close; 1/32" represents every dimension US residential construction uses exactly (3½"
stud, 16" o.c., 7¾" riser, 5.7 sq ft egress computed from exact edges); and integer
equality makes snapping and dedup trivial. Convert at the UI boundary and nowhere else.
Never store a length as feet, inches, millimeters, or a float. Angles are radians as
doubles; areas are computed in Length² and converted for display.

**2. The model is immutable and every change is a command.** All edits go through
`core`'s command stack — `applyCommand(model, cmd) → { model, inverse }`. Undo/redo,
revision diffing, and collaborative editing all depend on this. Never mutate an entity in
place, not even in a test.

**3. Entities live in a flat id-keyed map.** References are ids, never object pointers.
No nesting, no cycles. Deleting an entity requires resolving its referents explicitly.

**4. Schema changes ship with a migration and a fixture.** Bump `schemaVersion`, add a
migration in `core/src/migrations/`, add a fixture file of the old version to the corpus,
and add a test that the old fixture loads. A file written by any released version must
open forever.

**5. Model space is y-up, in Length, origin at the level's reference corner.** Canvas and
SVG are y-down. The flip happens once, in `render`'s viewport transform. If you find
yourself negating a y anywhere else, you've found a bug.

**6. Walls are centerline + thickness.** Faces are derived. Openings are positioned along
the wall's centerline parameter, not in world coordinates, so moving a wall carries its
doors. Room boundaries are derived from wall faces, not centerlines — an area that says
"70 sq ft" must be the clear floor area a reviewer would measure.

**7. Code rules cite their source.** Every `Finding` carries `{ ruleId, codeSection,
severity, message, entityIds, remedy? }`. A rule that can't name the section it enforces
doesn't ship. Never let a compliance sheet report a pass that the rule engine didn't
actually produce.

**8. Sheets are generated, never hand-authored.** Dimension strings, tags, marks, and
schedules derive from the model. If a number appears on a sheet that isn't traceable to
an entity, that's a defect.

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess` on. No `any`; use `unknown` and narrow.
- Zod schemas are the single source of truth for persisted shapes — derive TS types with
  `z.infer`, don't hand-write a parallel interface.
- Discriminated unions over class hierarchies for entities and commands.
- Named exports only. No default exports.
- Files are `kebab-case.ts`; types and components are `PascalCase`; functions and values
  are `camelCase`; rule ids are `irc.r310.net-clear-area` style.
- Errors: throw `AppError` subclasses; never throw bare strings. The base class lives in
  `geometry` rather than `core`, because `geometry` sits upstream and may not import from
  `core`; `core` extends it. Findings are data, not exceptions — a code violation is a
  normal result, not an error.
- Comments explain _why_. The geometry and code-rule packages are the exception: cite the
  code section or the algorithm by name, because the next reader will need it.

## Testing

- **`geometry`**: property-based tests (fast-check) for the invariants that matter —
  offsets round-trip, polygon booleans preserve area, joins stay closed. Degenerate inputs
  (zero-length segments, collinear points, self-touching loops) are required cases.
- **`core`**: every command tested for apply-then-inverse identity. Every migration tested
  against a real old-version fixture.
- **`codes`**: each rule gets a passing fixture, a failing fixture, and a boundary fixture
  at the exact code threshold. The boundary case is the point — 5.7 sq ft must pass and
  5.69 must fail.
- **`sheets`/`export`**: golden-file SVG snapshots. Regenerate deliberately with
  `pnpm test -- -u` and read the diff before accepting it; a silently changed drawing is
  the worst failure mode this project has.
- **`apps/studio`**: Playwright for the draw → check → export path.

Fixture plans live in `fixtures/` and are shared across packages. Add to them rather than
inventing one-off models inline.

## Gotchas specific to this domain

- **Clear height is a field, not a number.** A basement with 7'-2" joists and a 12" duct
  is non-compliant under that duct and compliant beside it. Model it as a height field
  over the floor plan; never reduce it to a single value.
- **Net clear opening ≠ window size.** R310 measures the actual openable area with the
  sash in its fully open position. A 36×48 window does not give a 36×48 opening.
- **Stair uniformity is a tolerance, not an average.** The largest and smallest riser must
  be within 3/8". Solving rise/run by division will pass a check that the field will fail.
- **Existing conditions are load-bearing information.** Never silently "clean up" an
  out-of-square foundation into a rectangle. Basements are not square, and a squared plan
  is a wrong plan.
- **Line weight carries meaning.** Cut walls, walls beyond, hidden work above, and
  demolition each have a conventional weight and dash pattern. Getting these wrong makes a
  drawing unreadable to the person reviewing it, even if the geometry is perfect.
- **Scale is real.** Sheets print at true scale. Never scale a viewport to make something
  fit — change the sheet size or the scale, and update the graphic scale bar with it.

## What not to do

- Don't add a CAD, geometry, or PDF dependency without checking it against the invariants
  above — most emit floats and assume y-down.
- Don't put domain logic in React components.
- Don't weaken or delete a code rule to make a fixture pass. If the rule is wrong, fix the
  rule and its citation, and say why in the commit.
- Don't generate a compliance summary from anything but a live rule-engine run.
- Don't commit generated PDFs, DXFs, or build output.
- Don't create a pull request unless asked.

## Git

Work on the branch you were given. Conventional-commit subjects
(`feat(codes): add R310 net clear opening rule`), imperative mood, body explaining why.
`pnpm typecheck && pnpm test` before every commit.
