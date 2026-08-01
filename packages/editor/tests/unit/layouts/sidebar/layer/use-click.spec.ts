/*
 * Tencent is pleased to support the open source community by making TMagicEditor available.
 *
 * Copyright (C) 2025 Tencent.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';

import { useClick } from '@editor/layouts/sidebar/layer/use-click';
import { updateStatus } from '@editor/utils/tree';

vi.mock('@editor/utils/tree', () => ({
  updateStatus: vi.fn(),
}));

const mkServices = () => {
  const stage = { select: vi.fn(), multiSelect: vi.fn(), highlight: vi.fn() };
  const editorState: Record<string, any> = {
    disabledMultiSelect: false,
    alwaysMultiSelect: false,
    nodes: [],
    stage,
  };
  const editorService = {
    get: vi.fn((k: string) => editorState[k]),
    select: vi.fn(),
    multiSelect: vi.fn(),
    highlight: vi.fn(),
  };
  const uiService = {
    get: vi.fn(() => false),
  };
  return { editorService, uiService, editorState, stage };
};

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const mouseEv = {} as MouseEvent;

const nodeData = (extra: any = {}): any => ({ ...extra });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useClick', () => {
  test('select 单选: 调用 editorService.select / stage.select', async () => {
    const services = mkServices();
    const isCtrl = ref(false);
    const nodeStatusMap = computed(() => new Map());
    const menuRef = shallowRef(null);
    const { nodeClickHandler } = useClick(services as any, isCtrl, nodeStatusMap, menuRef);
    nodeClickHandler(mouseEv, nodeData({ id: 'a', items: [], type: 'node' }));
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(services.editorService.select).toHaveBeenCalled();
    expect(services.stage.select).toHaveBeenCalledWith('a');
  });

  test('uiSelectMode 模式 触发自定义事件', () => {
    const services = mkServices();
    services.uiService.get = vi.fn(() => true);
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent');
    const { nodeClickHandler } = useClick(
      services as any,
      ref(false),
      computed(() => new Map()),
      shallowRef(null),
    );
    nodeClickHandler(mouseEv, nodeData({ id: 'a', type: 'node' }));
    expect(dispatchSpy).toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  test('多选模式 切换 multiSelect', async () => {
    const services = mkServices();
    services.editorState.alwaysMultiSelect = true;
    services.editorState.nodes = [{ id: 'b', type: 'node' }];
    const { nodeClickHandler } = useClick(
      services as any,
      ref(false),
      computed(() => new Map()),
      shallowRef(null),
    );
    nodeClickHandler(mouseEv, nodeData({ id: 'a', type: 'node' }));
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(services.editorService.multiSelect).toHaveBeenCalled();
  });

  test('多选模式 + isPage data 时不操作', async () => {
    const services = mkServices();
    services.editorState.alwaysMultiSelect = true;
    const { nodeClickHandler } = useClick(
      services as any,
      ref(false),
      computed(() => new Map()),
      shallowRef(null),
    );
    nodeClickHandler(mouseEv, nodeData({ id: 'p', type: 'page', items: [] }));
    await nextTick();
    expect(services.editorService.multiSelect).not.toHaveBeenCalled();
  });

  test('node items 存在且非多选 则展开节点', () => {
    const services = mkServices();
    const map = new Map();
    const { nodeClickHandler } = useClick(
      services as any,
      ref(false),
      computed(() => map),
      shallowRef(null),
    );
    nodeClickHandler(mouseEv, nodeData({ id: 'a', items: [{ id: 'b' }], type: 'node' }));
    expect(updateStatus).toHaveBeenCalledWith(map, 'a', { expand: true });
  });

  test('nodeDblclickHandler 切换展开状态', () => {
    const services = mkServices();
    const map: any = new Map([['a', { expand: false }]]);
    const { nodeDblclickHandler } = useClick(
      services as any,
      ref(false),
      computed(() => map),
      shallowRef(null),
    );
    nodeDblclickHandler(mouseEv, nodeData({ id: 'a', items: [{ id: 'b' }] }));
    expect(updateStatus).toHaveBeenCalledWith(map, 'a', { expand: true });
  });

  test('nodeContextMenuHandler 显示菜单', () => {
    const services = mkServices();
    const menuRef: any = shallowRef({ show: vi.fn() });
    const { nodeContentMenuHandler } = useClick(
      services as any,
      ref(false),
      computed(() => new Map()),
      menuRef,
    );
    const ev: any = { preventDefault: vi.fn() };
    nodeContentMenuHandler(ev, nodeData({ id: 'a', type: 'node' }));
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(menuRef.value.show).toHaveBeenCalledWith(ev);
  });

  test('select 抛错: data 没有 id', async () => {
    const services = mkServices();
    services.editorState.alwaysMultiSelect = false;
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    const { nodeClickHandler } = useClick(
      services as any,
      ref(false),
      computed(() => new Map()),
      shallowRef(null),
    );
    nodeClickHandler(mouseEv, nodeData({ type: 'node' }));
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', onUnhandled);
    expect(services.editorService.select).not.toHaveBeenCalled();
  });

  test('highlightHandler 被节流但最终触发', async () => {
    const services = mkServices();
    const { highlightHandler } = useClick(
      services as any,
      ref(false),
      computed(() => new Map()),
      shallowRef(null),
    );
    highlightHandler(mouseEv, nodeData({ id: 'a' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(services.editorService.highlight).toHaveBeenCalled();
  });
});
