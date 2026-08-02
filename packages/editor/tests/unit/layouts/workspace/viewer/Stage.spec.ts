import { beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';

import Stage from '@editor/layouts/workspace/viewer/Stage.vue';

const { stageInstance, stageHandlers } = vi.hoisted(() => {
  const handlers: Record<string, any[]> = {};
  return {
    stageHandlers: handlers,
    stageInstance: {
      on: vi.fn((event: string, callback: any) => {
        handlers[event] = handlers[event] || [];
        handlers[event].push(callback);
      }),
      mount: vi.fn(),
      destroy: vi.fn(),
      setZoom: vi.fn(),
      select: vi.fn(),
      getNodeIdsAtPoint: vi.fn(() => []),
      resolveDropTarget: vi.fn(() => null),
      getLocalPoint: vi.fn(() => ({ x: 80, y: 60 })),
    },
  };
});

vi.mock('@editor/hooks/use-stage', () => ({ useStage: vi.fn(() => stageInstance) }));

const editorService = {
  get: vi.fn(),
  set: vi.fn(),
  getNodeById: vi.fn(),
  getLayout: vi.fn(async () => 'relative'),
  add: vi.fn(),
  select: vi.fn(),
};
const uiService = { get: vi.fn(), set: vi.fn() };
const keybindingService = { registerEl: vi.fn(), unregisterEl: vi.fn() };

vi.mock('@editor/hooks', () => ({ useServices: () => ({ editorService, uiService, keybindingService }) }));
vi.mock('@editor/utils/config', () => ({
  getEditorConfig: vi.fn(() => (source: string) => JSON.parse(source.slice(1, -1))),
}));
vi.mock('@editor/components/ScrollViewer.vue', () => ({
  default: defineComponent({
    name: 'ScrollViewer',
    setup(_props, { slots, expose }) {
      expose({ container: { focus: vi.fn() } });
      return () => h('div', { class: 'fake-scroll-viewer' }, [slots.before?.(), slots.default?.(), slots.content?.()]);
    },
  }),
}));
vi.mock('@editor/layouts/workspace/viewer/NodeListMenu.vue', () => ({
  default: defineComponent({ name: 'NodeListMenu', setup: () => () => h('div') }),
}));
vi.mock('@editor/layouts/workspace/viewer/ViewerMenu.vue', () => ({
  default: defineComponent({
    name: 'ViewerMenu',
    setup(_props, { expose }) {
      expose({ show: vi.fn() });
      return () => h('div');
    },
  }),
}));

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = FakeResizeObserver;

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(stageHandlers).forEach((key) => delete stageHandlers[key]);
  uiService.get.mockImplementation((key: string) => {
    if (key === 'stageRect' || key === 'stageContainerRect') return { width: 800, height: 600 };
    if (key === 'zoom') return 1;
    return null;
  });
  editorService.get.mockImplementation((key: string) => {
    if (key === 'nodes') return [{ id: 'n1' }];
    if (key === 'page') return { id: 'p1' };
    if (key === 'node') return { id: 'n1' };
    if (key === 'stageLoading') return false;
    return null;
  });
  editorService.getNodeById.mockReturnValue(null);
});

const mountIt = (props: any = {}) =>
  mount(Stage, {
    props: {
      stageOptions: {},
      stageContentMenu: [],
      customContentMenu: (menus: any[]) => menus,
      ...props,
    } as any,
    attachTo: document.body,
  });

describe('Stage', () => {
  test('挂载并创建 LeaferStage', async () => {
    const wrapper = mountIt();
    await nextTick();
    expect(stageInstance.mount).toHaveBeenCalled();
    expect(editorService.set).toHaveBeenCalledWith('stage', expect.anything());
    wrapper.unmount();
  });

  test('卸载时销毁 stage', async () => {
    const wrapper = mountIt();
    await nextTick();
    wrapper.unmount();
    expect(stageInstance.destroy).toHaveBeenCalled();
  });

  test('组件列表拖入使用 Stage 坐标边界并写入 DSL', async () => {
    const wrapper = mountIt();
    await nextTick();
    const event: any = new Event('drop');
    event.dataTransfer = { getData: vi.fn(() => '{"dragType":"component-list","data":{"name":"text","style":{}}}') };
    event.clientX = 100;
    event.clientY = 100;
    event.preventDefault = vi.fn();

    wrapper.find('.m-editor-stage-container').element.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(stageInstance.getLocalPoint).toHaveBeenCalledWith(event, 'p1');
    expect(editorService.add).toHaveBeenCalledWith(
      expect.objectContaining({ style: expect.objectContaining({ left: 80, top: 60, position: 'relative' }) }),
      { id: 'p1' },
      { historySource: 'component-panel' },
    );
  });

  test('canDropIn 返回 false 时取消拖入', async () => {
    const canDropIn = vi.fn(() => false);
    stageInstance.resolveDropTarget.mockReturnValueOnce(null);
    const wrapper = mountIt({ stageOptions: { canDropIn } });
    await nextTick();
    const event: any = new Event('drop');
    event.dataTransfer = { getData: vi.fn(() => '{"dragType":"component-list","data":{"style":{}}}') };
    event.preventDefault = vi.fn();
    wrapper.find('.m-editor-stage-container').element.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(canDropIn).not.toHaveBeenCalled();
    expect(editorService.add).not.toHaveBeenCalled();
  });

  test('双击通过 Stage 命中 DSL 节点并支持 beforeDblclick', async () => {
    const beforeDblclick = vi.fn(() => true);
    stageInstance.getNodeIdsAtPoint.mockReturnValue(['node-1', 'node-2']);
    mountIt({ stageOptions: { beforeDblclick } });
    await nextTick();
    await stageHandlers.dblclick[0]({ clientX: 10, clientY: 20 });
    expect(beforeDblclick).toHaveBeenCalled();
    expect(editorService.select).toHaveBeenCalledWith('node-2');
  });
});
