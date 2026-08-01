import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useStage } from '@editor/hooks/use-stage';
import editorService from '@editor/services/editor';

const { stageInstance, LeaferStageCtor } = vi.hoisted(() => {
  const handlers: Record<string, ((...args: any[]) => any)[]> = {};
  const fakeStage = {
    shapeRegistry: { registerAll: vi.fn() },
    on: vi.fn((event: string, handler: (...args: any[]) => any) => {
      handlers[event] ||= [];
      handlers[event].push(handler);
    }),
    select: vi.fn(),
    setRoot: vi.fn(),
    handlers,
  };
  const ctor: any = vi.fn(function (this: any, options: any) {
    Object.assign(this, fakeStage, { options });
    return this;
  });
  return { stageInstance: fakeStage, LeaferStageCtor: ctor };
});

vi.mock('@tmagic/leafer-stage', () => ({ default: LeaferStageCtor }));
vi.mock('@leafer-components', () => ({ builtinShapes: {} }));

const editorState: Record<string, any> = {
  root: { id: 'r1' },
  page: { id: 'p1' },
  node: { id: 'n1' },
  nodes: [{ id: 'n1' }],
  parent: { id: 'parent1' },
};

vi.mock('@editor/services/editor', () => ({
  default: {
    get: (key: string) => editorState[key],
    set: vi.fn((key: string, value: any) => {
      editorState[key] = value;
    }),
    select: vi.fn(),
    multiSelect: vi.fn(),
    moveToContainer: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@editor/services/ui', () => ({
  default: { get: (key: string) => (key === 'zoom' ? 1 : undefined) },
}));

vi.mock('@editor/utils/editor', () => ({
  buildChangeRecords: vi.fn((style: Record<string, any>) => Object.keys(style).map((key) => ({ key }))),
}));

beforeEach(() => {
  LeaferStageCtor.mockClear();
  Object.keys(stageInstance.handlers).forEach((key) => delete stageInstance.handlers[key]);
  vi.clearAllMocks();
  editorState.node = { id: 'n1' };
  editorState.nodes = [{ id: 'n1' }];
});

describe('useStage', () => {
  test('始终创建 LeaferStage 并注册内置 shape', async () => {
    const stage = useStage({ zoom: 0.8 } as any);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(stage).toBeDefined();
    expect(LeaferStageCtor).toHaveBeenCalledWith({ zoom: 0.8 });
    expect(stageInstance.shapeRegistry.registerAll).toHaveBeenCalled();
    expect(stageInstance.on).toHaveBeenCalledWith('select', expect.any(Function));
    expect(stageInstance.on).toHaveBeenCalledWith('edit-end', expect.any(Function));
    expect(stageInstance.on).toHaveBeenCalledWith('page-el-update', expect.any(Function));
  });

  test('单选和多选事件直接同步 DSL id', () => {
    useStage({} as any);
    stageInstance.handlers.select[0](['node-1']);
    stageInstance.handlers.select[0](['node-1', 'node-2']);

    expect(editorService.select).toHaveBeenCalledWith('node-1');
    expect(editorService.multiSelect).toHaveBeenCalledWith(['node-1', 'node-2']);
  });

  test('画布编辑提交走一次 editorService.update 并恢复选择', async () => {
    useStage({} as any);
    stageInstance.handlers['edit-end'][0]({
      sessionId: 7,
      configs: [{ id: 'node-1', style: { left: 12, top: 18 } }],
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(editorService.update).toHaveBeenCalledWith(
      [{ id: 'node-1', style: { left: 12, top: 18 } }],
      expect.objectContaining({ historySource: 'stage' }),
    );
    expect(stageInstance.select).toHaveBeenCalledWith(['node-1']);
  });

  test('跨容器提交走 moveToContainer', async () => {
    useStage({} as any);
    stageInstance.handlers['edit-end'][0]({
      sessionId: 8,
      configs: [{ id: 'node-1', parentId: 'container-1', style: { left: 2, top: 3 } }],
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editorService.moveToContainer).toHaveBeenCalledWith(
      [{ id: 'node-1', style: { left: 2, top: 3 } }],
      'container-1',
      { historySource: 'stage' },
    );
  });

  test('页面更新完成后清除 stageLoading', () => {
    useStage({} as any);
    stageInstance.handlers['page-el-update'][0]();
    expect(editorService.set).toHaveBeenCalledWith('stageLoading', false);
  });
});
