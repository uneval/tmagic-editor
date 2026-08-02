import type { Id } from '@tmagic/core';

import type { DragNodeSnapshot, DragPoint, DragSessionCallbacks, DropTarget } from './types';

type DragPhase = 'idle' | 'dragging' | 'committing';

/** 拖拽生命周期的唯一状态源,屏蔽 pointer/editor 事件的到达顺序。 */
export default class DragSessionController {
  private readonly callbacks: DragSessionCallbacks;
  private phase: DragPhase = 'idle';
  private sessionId = 0;
  private ids = new Set<Id>();
  private selectionSnapshots: DragNodeSnapshot[] = [];
  private sessionSnapshots: DragNodeSnapshot[] = [];
  private point: DragPoint | null = null;
  private target: DropTarget | null = null;

  public constructor(callbacks: DragSessionCallbacks) {
    this.callbacks = callbacks;
  }

  public setSelection(snapshots: DragNodeSnapshot[]): void {
    this.selectionSnapshots = snapshots;
  }

  public begin(): void {
    this.sessionId += 1;
    this.phase = 'dragging';
    this.ids.clear();
    this.sessionSnapshots = this.selectionSnapshots.map((snapshot) => ({
      id: snapshot.id,
      style: { ...snapshot.style },
    }));
    this.point = null;
    this.setTarget(null, true);
  }

  public markChanged(ids: Id[]): void {
    if (this.phase === 'idle') this.begin();
    if (this.phase !== 'dragging') return;
    ids.forEach((id) => this.ids.add(id));
    this.refreshTarget();
  }

  public updatePointer(point: DragPoint): void {
    if (this.phase === 'idle') return;
    this.point = point;
    this.refreshTarget();
  }

  public finish(): void {
    if (this.phase !== 'dragging') return;
    const commit = {
      sessionId: this.sessionId,
      ids: Array.from(this.ids),
      target: this.target,
      snapshots: this.sessionSnapshots,
    };
    this.phase = 'committing';
    this.setTarget(null, true);
    this.callbacks.commit(commit);
    this.resetAfterCommit();
  }

  public cancel(): void {
    if (this.phase === 'idle') return;
    this.sessionId += 1;
    this.phase = 'idle';
    this.ids.clear();
    this.sessionSnapshots = [];
    this.point = null;
    this.setTarget(null, true);
  }

  public dispose(): void {
    this.cancel();
  }

  public isMultiSelectDragging(): boolean {
    return this.phase === 'dragging' && this.sessionSnapshots.length > 1;
  }

  private refreshTarget(): void {
    if (!this.point || !this.ids.size || this.phase !== 'dragging') {
      this.setTarget(null);
      return;
    }
    this.setTarget(this.callbacks.resolveTarget(this.point, Array.from(this.ids)));
  }

  private setTarget(target: DropTarget | null, force = false): void {
    if (!force && this.target?.id === target?.id && this.target?.kind === target?.kind) return;
    this.target = target;
    this.callbacks.targetChanged(target);
  }

  private resetAfterCommit(): void {
    this.ids.clear();
    this.sessionSnapshots = [];
    this.point = null;
    this.target = null;
    this.phase = 'idle';
  }
}
