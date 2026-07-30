import { applyCommand, type Command } from './commands.js';
import type { BasementModel } from './schema.js';

/**
 * Undo/redo, stored as the inverse commands themselves rather than as model snapshots.
 * Keeping inverses instead of copies is what makes the stack cheap and what will let
 * revision diffing reuse the same data later.
 */
export interface History {
  /** Inverses of applied commands, most recent last. */
  readonly undoable: readonly Command[];
  /** Commands undone and available to redo, most recent last. */
  readonly redoable: readonly Command[];
}

export const EMPTY_HISTORY: History = { undoable: [], redoable: [] };

export interface Session {
  readonly model: BasementModel;
  readonly history: History;
}

export function createSession(model: BasementModel): Session {
  return { model, history: EMPTY_HISTORY };
}

/** Apply a command and push its inverse. Doing anything new clears the redo stack. */
export function execute(session: Session, command: Command): Session {
  const { model, inverse } = applyCommand(session.model, command);
  return {
    model,
    history: { undoable: [...session.history.undoable, inverse], redoable: [] },
  };
}

export function canUndo(session: Session): boolean {
  return session.history.undoable.length > 0;
}

export function canRedo(session: Session): boolean {
  return session.history.redoable.length > 0;
}

export function undo(session: Session): Session {
  const undoable = session.history.undoable;
  const command = undoable[undoable.length - 1];
  if (command === undefined) return session;

  const { model, inverse } = applyCommand(session.model, command);
  return {
    model,
    history: {
      undoable: undoable.slice(0, -1),
      // The inverse of the undo is the redo.
      redoable: [...session.history.redoable, inverse],
    },
  };
}

export function redo(session: Session): Session {
  const redoable = session.history.redoable;
  const command = redoable[redoable.length - 1];
  if (command === undefined) return session;

  const { model, inverse } = applyCommand(session.model, command);
  return {
    model,
    history: {
      undoable: [...session.history.undoable, inverse],
      redoable: redoable.slice(0, -1),
    },
  };
}
