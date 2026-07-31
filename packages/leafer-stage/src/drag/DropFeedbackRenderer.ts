import type { DropTarget } from './types';

interface DropFeedbackRendererOptions {
  rootGroup: () => any;
  rectConstructor: () => any;
}

/** 只负责绘制目标提示,提示节点永远不进入 DSL 和命中树。 */
export default class DropFeedbackRenderer {
  private readonly options: DropFeedbackRendererOptions;
  private hint: any = null;

  public constructor(options: DropFeedbackRendererOptions) {
    this.options = options;
  }

  public render(target: DropTarget | null): void {
    if (!target || target.kind === 'same-parent') {
      this.clear();
      return;
    }

    const rootGroup = this.options.rootGroup();
    const RectConstructor = this.options.rectConstructor();
    if (!rootGroup || !RectConstructor) {
      this.clear();
      return;
    }

    if (!this.hint) {
      this.hint = new RectConstructor({
        fill: '#5b8ff908',
        stroke: '#5b8ff9',
        strokeWidth: 2,
        dashPattern: [6, 4],
        hitTest: false,
        hitFill: 'none',
        hitStroke: 'none',
      });
      rootGroup.add(this.hint);
    }

    this.hint.set?.(target.bounds);
    this.hint.x = target.bounds.x;
    this.hint.y = target.bounds.y;
    this.hint.width = target.bounds.width;
    this.hint.height = target.bounds.height;
    this.hint.moveToFront?.();
  }

  public clear(): void {
    this.hint?.remove?.();
    this.hint = null;
  }
}
