import type { Id, MApp, MContainer, MNode } from '@tmagic/core';

export interface Point {
  clientX: number;
  clientY: number;
}

export interface WorldPoint {
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

export interface LeaferDropTarget {
  id: Id;
  kind: DropTargetKind;
  bounds: DropBounds;
}

export interface UpdateData {
  config: MNode;
  parent?: MContainer;
  parentId?: Id;
  root: MApp;
}

export interface RemoveData {
  id: Id;
  parentId: Id;
  root: MApp;
}

export interface LeaferEditConfig {
  id: Id;
  style: Record<string, unknown>;
  parentId?: Id;
}

export interface LeaferEditData {
  sessionId: number;
  configs: LeaferEditConfig[];
  parentId?: Id;
}

export interface LeaferStageEvents {
  'set-root': [root: MApp];
  'page-el-update': [el: HTMLDivElement];
  select: [ids: Id[]];
  'edit-end': [data: LeaferEditData];
}
