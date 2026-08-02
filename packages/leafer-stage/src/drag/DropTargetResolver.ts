import type { Id } from '@tmagic/core';

import type { DragPoint, DropBounds, DropTarget } from './types';

interface DropTargetResolverOptions {
  rootGroup: () => any;
  pageFrames: () => Map<Id, any>;
  pageBounds: () => Map<Id, DropBounds>;
  containerIds: () => Set<Id>;
  nodeMap?: () => Map<Id, any>;
  canDropIn?: (sourceIds: Id[], targetId: Id) => Id | boolean | void;
}

/** 只负责把画布坐标解析为可接收目标,不修改节点和提示层。 */
export default class DropTargetResolver {
  private readonly options: DropTargetResolverOptions;
  private readonly rejectedTargetIds = new Set<string>();

  public constructor(options: DropTargetResolverOptions) {
    this.options = options;
  }

  public resolve(point: DragPoint, ids: Id[]): DropTarget | null {
    this.rejectedTargetIds.clear();
    const rootGroup = this.options.rootGroup();
    if (!rootGroup) return null;

    const selectedIds = new Set(ids.map((id) => `${id}`));
    const picked = rootGroup.pick?.(point, { through: true });
    const path = picked?.path?.list ?? picked?.path ?? [];
    const elements = Array.from(path as any[]);
    const pages = this.options.pageFrames();
    if (ids.some((id) => pages.has(id))) return null;
    const containers = this.options.containerIds();
    let pageTarget: DropTarget | null = null;

    for (const [pathIndex, element] of elements.entries()) {
      const id = element?.id as Id | undefined;
      if (id === undefined || id === null) continue;

      if (pages.has(id)) {
        if (this.isSourceAncestor(element, ids)) continue;
        const bounds = this.options.pageBounds().get(id);
        if (bounds) pageTarget = this.applyCanDrop({ id, kind: 'page', node: element, bounds }, ids);
        continue;
      }

      if (!containers.has(id) || selectedIds.has(`${id}`)) continue;
      if (this.isSourceAncestor(element, ids)) continue;
      if (pathIndex === 0 && (element.tag === 'Frame' || element.tag === 'Group')) continue;

      let parent = element?.parent;
      let containsSelected = false;
      while (parent) {
        if (selectedIds.has(`${parent.id}`)) {
          containsSelected = true;
          break;
        }
        parent = parent.parent;
      }
      if (containsSelected) continue;

      const bounds = element.getBounds?.('box', rootGroup);
      if (bounds) {
        const target = this.applyCanDrop({ id, kind: 'container', node: element, bounds }, ids);
        if (target) return target;
      }
    }

    if (pageTarget) return pageTarget;

    const sameParentTarget = this.resolveSameParent(point, ids, pages, rootGroup);
    if (sameParentTarget) {
      const target = this.applyCanDrop(sameParentTarget, ids);
      if (target) return target;
    }

    // 空白页或透明背景可能不会出现在 pick path 中,用页面的固定排版边界
    // 做几何兜底,避免不同页面因内容结构不同而出现单向拖入失败。
    for (const [id, bounds] of this.options.pageBounds()) {
      if (!this.containsPoint(bounds, point)) continue;
      const page = pages.get(id);
      if (!page || this.isSourceAncestor(page, ids)) continue;
      const target = this.applyCanDrop({ id, kind: 'page', node: page, bounds }, ids);
      if (target) return target;
    }

    return null;
  }

  private resolveSameParent(point: DragPoint, ids: Id[], pages: Map<Id, any>, rootGroup: any): DropTarget | null {
    const nodeMap = this.options.nodeMap?.();
    if (!nodeMap || ids.length === 0) return null;
    const parents = ids.map((id) => nodeMap.get(id)?.parent).filter(Boolean);
    if (parents.length !== ids.length || parents.some((parent) => parent !== parents[0])) return null;

    const parent = parents[0];
    const parentId = parent.id as Id | undefined;
    if (parentId === undefined) return null;
    const bounds = pages.has(parentId) ? this.options.pageBounds().get(parentId) : parent.getBounds?.('box', rootGroup);
    if (!bounds || !this.containsPoint(bounds, point)) return null;
    return { id: parentId, kind: 'same-parent', node: parent, bounds };
  }

  private containsPoint(bounds: DropBounds, point: DragPoint): boolean {
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }

  private isSourceAncestor(candidate: any, ids: Id[]): boolean {
    const nodeMap = this.options.nodeMap?.();
    if (!nodeMap) return false;

    return ids.some((id) => {
      let node = nodeMap.get(id);
      while (node) {
        if (node === candidate || `${node.id}` === `${candidate.id}`) return true;
        node = node.parent;
      }
      return false;
    });
  }

  private applyCanDrop(target: DropTarget, ids: Id[]): DropTarget | null {
    if (this.rejectedTargetIds.has(`${target.id}`)) return null;
    const result = this.options.canDropIn?.(ids, target.id);
    if (result === false) {
      this.rejectedTargetIds.add(`${target.id}`);
      return null;
    }
    if (result === undefined || result === true || `${result}` === `${target.id}`) return target;

    const redirectedId = result as Id;
    const nodeMap = this.options.nodeMap?.();
    const pages = this.options.pageFrames();
    if (!pages.has(redirectedId) && !this.options.containerIds().has(redirectedId)) {
      this.rejectedTargetIds.add(`${target.id}`);
      return null;
    }
    const node = nodeMap?.get(redirectedId) ?? pages.get(redirectedId);
    if (!node) {
      this.rejectedTargetIds.add(`${target.id}`);
      return null;
    }
    if (this.isSourceAncestor(node, ids)) {
      this.rejectedTargetIds.add(`${target.id}`);
      return null;
    }
    const bounds = pages.has(redirectedId)
      ? this.options.pageBounds().get(redirectedId)
      : node.getBounds?.('box', this.options.rootGroup());
    if (!bounds) {
      this.rejectedTargetIds.add(`${target.id}`);
      return null;
    }
    const kind = pages.has(redirectedId) ? 'page' : 'container';
    return { id: redirectedId, kind, node, bounds };
  }
}
