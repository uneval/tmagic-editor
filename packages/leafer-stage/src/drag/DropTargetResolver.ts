import type { Id } from '@tmagic/core';

import type { DragPoint, DropBounds, DropTarget } from './types';

interface DropTargetResolverOptions {
  rootGroup: () => any;
  pageFrames: () => Map<Id, any>;
  pageBounds: () => Map<Id, DropBounds>;
  containerIds: () => Set<Id>;
  nodeMap?: () => Map<Id, any>;
}

/** 只负责把画布坐标解析为可接收目标,不修改节点和提示层。 */
export default class DropTargetResolver {
  private readonly options: DropTargetResolverOptions;

  public constructor(options: DropTargetResolverOptions) {
    this.options = options;
  }

  public resolve(point: DragPoint, ids: Id[]): DropTarget | null {
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
        if (bounds) pageTarget = { id, kind: 'page', node: element, bounds };
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
      if (bounds) return { id, kind: 'container', node: element, bounds };
    }

    if (pageTarget) return pageTarget;

    const sameParentTarget = this.resolveSameParent(point, ids, pages, rootGroup);
    if (sameParentTarget) return sameParentTarget;

    // 空白页或透明背景可能不会出现在 pick path 中,用页面的固定排版边界
    // 做几何兜底,避免不同页面因内容结构不同而出现单向拖入失败。
    for (const [id, bounds] of this.options.pageBounds()) {
      if (!this.containsPoint(bounds, point)) continue;
      const page = pages.get(id);
      if (!page || this.isSourceAncestor(page, ids)) continue;
      return { id, kind: 'page', node: page, bounds };
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
}
