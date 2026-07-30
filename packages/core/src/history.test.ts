import { feet, inches, vec2 } from '@basement/geometry';
import { describe, expect, it } from 'vitest';

import { assemblyCommand } from './commands.js';
import { canRedo, canUndo, createSession, execute, redo, undo } from './history.js';
import { createModel, getWall, listWalls } from './model.js';
import { createWall } from './walls.js';

const wallA = createWall({
  id: 'w1',
  start: vec2(feet(0), feet(0)),
  end: vec2(feet(12), feet(0)),
});

function seededSession() {
  return createSession(createModel([wallA]));
}

describe('history', () => {
  it('starts empty', () => {
    const session = seededSession();
    expect(canUndo(session)).toBe(false);
    expect(canRedo(session)).toBe(false);
  });

  it('undoes back to the starting model', () => {
    const start = seededSession();
    const added = execute(start, {
      kind: 'add-wall',
      wall: createWall({
        id: 'w2',
        start: vec2(feet(12), feet(0)),
        end: vec2(feet(12), feet(9)),
      }),
    });
    expect(listWalls(added.model)).toHaveLength(2);
    expect(canUndo(added)).toBe(true);

    const back = undo(added);
    expect(back.model).toEqual(start.model);
    expect(canUndo(back)).toBe(false);
    expect(canRedo(back)).toBe(true);
  });

  it('redoes what it undid', () => {
    const start = seededSession();
    const changed = execute(start, {
      kind: 'set-wall-thickness',
      wallId: 'w1',
      thickness: inches(8),
    });
    const again = redo(undo(changed));
    expect(again.model).toEqual(changed.model);
    expect(getWall(again.model, 'w1').thickness).toBe(inches(8));
  });

  it('survives a long round trip through every command kind', () => {
    let session = seededSession();
    const start = session.model;

    session = execute(session, {
      kind: 'add-wall',
      wall: createWall({
        id: 'w2',
        start: vec2(feet(12), feet(0)),
        end: vec2(feet(12), feet(9)),
      }),
    });
    session = execute(session, {
      kind: 'move-wall',
      wallId: 'w1',
      start: vec2(feet(1), feet(1)),
      end: vec2(feet(13), feet(1)),
    });
    session = execute(session, assemblyCommand('w1', 'foundation'));
    session = execute(session, {
      kind: 'set-wall-thickness',
      wallId: 'w2',
      thickness: inches(12),
    });
    session = execute(session, { kind: 'remove-wall', wallId: 'w2' });

    const end = session.model;

    for (let i = 0; i < 5; i += 1) session = undo(session);
    expect(session.model).toEqual(start);
    expect(canUndo(session)).toBe(false);

    for (let i = 0; i < 5; i += 1) session = redo(session);
    expect(session.model).toEqual(end);
    expect(canRedo(session)).toBe(false);
  });

  it('clears the redo stack when new work happens', () => {
    let session = seededSession();
    session = execute(session, {
      kind: 'set-wall-thickness',
      wallId: 'w1',
      thickness: inches(8),
    });
    session = undo(session);
    expect(canRedo(session)).toBe(true);

    session = execute(session, {
      kind: 'set-wall-thickness',
      wallId: 'w1',
      thickness: inches(6.5),
    });
    expect(canRedo(session)).toBe(false);
    expect(getWall(session.model, 'w1').thickness).toBe(inches(6.5));
  });

  it('is a no-op at the ends of the stack', () => {
    const session = seededSession();
    expect(undo(session)).toBe(session);
    expect(redo(session)).toBe(session);
  });
});
