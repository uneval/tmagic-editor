import type { Id } from '@tmagic/core';

export interface DragPoint {
  x: number;
  y: number;
}

export interface DropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DropTargetKind = 'page' | 'container' | 'same-parent';

export interface DropTarget {
  id: Id;
  kind: DropTargetKind;
  node: any;
  bounds: DropBounds;
}

export interface DragCommit {
  sessionId: number;
  ids: Id[];
  target: DropTarget | null;
  snapshots: DragNodeSnapshot[];
}

export interface DragNodeSnapshot {
  id: Id;
  style: Record<string, unknown>;
}

export interface DragSessionCallbacks {
  resolveTarget: (point: DragPoint, ids: Id[]) => DropTarget | null;
  targetChanged: (target: DropTarget | null) => void;
  commit: (data: DragCommit) => void;
}
