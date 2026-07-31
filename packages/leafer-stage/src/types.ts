import type { Id, MApp, MContainer, MNode } from '@tmagic/core';

export interface Point {
  clientX: number;
  clientY: number;
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
