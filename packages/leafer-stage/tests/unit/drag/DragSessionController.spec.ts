/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest';

import DragSessionController from '../../../src/drag/DragSessionController';

describe('DragSessionController', () => {
  it('把 pointer/editor 事件合并为一次可提交的拖拽会话', () => {
    const resolveTarget = vi.fn(() => ({
      id: 'page-2',
      kind: 'page' as const,
      node: {},
      bounds: { x: 100, y: 0, width: 320, height: 568 },
    }));
    const targetChanged = vi.fn();
    const commit = vi.fn();
    const controller = new DragSessionController({ resolveTarget, targetChanged, commit });

    controller.begin();
    controller.markChanged(['button-1']);
    controller.updatePointer({ x: 120, y: 80 });
    controller.finish();
    controller.finish();

    expect(resolveTarget).toHaveBeenCalledWith({ x: 120, y: 80 }, ['button-1']);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ['button-1'], target: expect.objectContaining({ id: 'page-2' }) }),
    );
    expect(targetChanged).toHaveBeenLastCalledWith(null);
  });

  it('新会话开始时强制清除上一会话的提示,不依赖旧事件是否完整到达', () => {
    const targetChanged = vi.fn();
    const controller = new DragSessionController({
      resolveTarget: vi.fn(() => null),
      targetChanged,
      commit: vi.fn(),
    });

    controller.begin();
    controller.markChanged(['button-1']);
    controller.updatePointer({ x: 10, y: 10 });
    controller.begin();

    expect(targetChanged).toHaveBeenCalledWith(null);
  });

  it('取消会话会丢弃节点、坐标和目标,后续 pointer 不会重新显示提示', () => {
    const resolveTarget = vi.fn(() => ({
      id: 'page-2',
      kind: 'page' as const,
      node: {},
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    }));
    const targetChanged = vi.fn();
    const controller = new DragSessionController({ resolveTarget, targetChanged, commit: vi.fn() });

    controller.begin();
    controller.markChanged(['button-1']);
    controller.updatePointer({ x: 1, y: 1 });
    controller.cancel();
    controller.updatePointer({ x: 2, y: 2 });

    expect(targetChanged).toHaveBeenLastCalledWith(null);
    expect(resolveTarget).toHaveBeenCalledTimes(1);
  });

  it('无目标提交时携带拖动开始快照,由提交层负责恢复位置', () => {
    const commit = vi.fn();
    const controller = new DragSessionController({
      resolveTarget: vi.fn(() => null),
      targetChanged: vi.fn(),
      commit,
    });

    controller.setSelection([{ id: 'button-1', style: { left: 20, top: 30 } }]);
    controller.begin();
    controller.markChanged(['button-1']);
    controller.updatePointer({ x: 900, y: 900 });
    controller.finish();

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        target: null,
        snapshots: [{ id: 'button-1', style: { left: 20, top: 30 } }],
      }),
    );
  });
});
