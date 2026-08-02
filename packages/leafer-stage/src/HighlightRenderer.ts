import type { Id } from '@tmagic/core';

interface HighlightRendererOptions {
  rootGroup: () => any;
  rectConstructor: () => any;
  nodeMap: () => Map<Id, any>;
  isSelected: (node: any) => boolean;
  isMultiSelectDragging: () => boolean;
}

/** 编辑器 hover 高亮层。它是临时视觉节点，不进入 DSL 节点映射和命中树。 */
export default class HighlightRenderer {
  private readonly options: HighlightRendererOptions;
  private hint: any = null;
  private highlightedId: Id | null = null;

  public constructor(options: HighlightRendererOptions) {
    this.options = options;
  }

  public render(id: Id): void {
    const node = this.options.nodeMap().get(id);
    if (!node || this.options.isSelected(node) || this.options.isMultiSelectDragging()) {
      this.clear();
      return;
    }

    const rootGroup = this.options.rootGroup();
    const rectConstructor = this.options.rectConstructor();
    const bounds = node.getBounds?.('box', rootGroup) ?? node.bounds;
    if (!rootGroup || !rectConstructor || !bounds) {
      this.clear();
      return;
    }

    if (!this.hint) {
      // eslint-disable-next-line new-cap
      this.hint = new rectConstructor({
        fill: '#5b8ff908',
        stroke: '#5b8ff9',
        strokeWidth: 2,
        hitTest: false,
        hitFill: 'none',
        hitStroke: 'none',
      });
      rootGroup.add(this.hint);
    }

    this.hint.set?.(bounds);
    this.hint.x = bounds.x;
    this.hint.y = bounds.y;
    this.hint.width = bounds.width;
    this.hint.height = bounds.height;
    this.hint.moveToFront?.();
    this.highlightedId = id;
  }

  public clear(): void {
    this.hint?.remove?.();
    this.hint = null;
    this.highlightedId = null;
  }

  public get id(): Id | null {
    return this.highlightedId;
  }
}
