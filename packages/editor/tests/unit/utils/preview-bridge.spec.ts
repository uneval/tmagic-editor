import { describe, expect, test, vi } from 'vitest';
import { nextTick, ref, shallowRef } from 'vue';

import {
  createPreviewUpdateMessage,
  isPreviewUpdateMessage,
  PREVIEW_UPDATE_MESSAGE,
  usePreviewBridge,
} from '@editor/utils/preview-bridge';

describe('preview bridge message', () => {
  test('创建包含完整 DSL 和页面 id 的预览消息', () => {
    const root = {
      id: 'app',
      type: 'app',
      items: [{ id: 'page-1' }],
      events: { click: () => 'handled' },
    } as any;
    const message = createPreviewUpdateMessage(root, 'page-1');

    expect(message).toEqual({
      type: PREVIEW_UPDATE_MESSAGE,
      dsl: expect.any(String),
      pageId: 'page-1',
    });
    expect(message.dsl).toContain('page-1');
    expect(message.dsl).toContain('handled');
  });

  test('只接受合法的预览更新消息', () => {
    expect(isPreviewUpdateMessage({ type: PREVIEW_UPDATE_MESSAGE, dsl: '({ items: [] })' })).toBe(true);
    expect(isPreviewUpdateMessage({ type: PREVIEW_UPDATE_MESSAGE, dsl: {} })).toBe(false);
    expect(isPreviewUpdateMessage({ type: 'other', dsl: '({ items: [] })' })).toBe(false);
    expect(isPreviewUpdateMessage(null)).toBe(false);
  });

  test('iframe 加载完成后发送当前 DSL，并在 DSL 变化时同步', async () => {
    const postMessage = vi.fn();
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage } });
    iframe.src = '/runtime/vue/page/index.html';

    const root = ref({ id: 'app', type: 'app', items: [{ id: 'page-1' }] } as any);
    const bridge = usePreviewBridge({
      iframe: shallowRef(iframe),
      visible: ref(true),
      root,
      pageId: ref('page-1'),
    });

    bridge.loadHandler();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0][0]).toMatchObject({
      type: PREVIEW_UPDATE_MESSAGE,
      pageId: 'page-1',
    });
    expect(typeof postMessage.mock.calls[0][0].dsl).toBe('string');

    root.value = { id: 'app', type: 'app', items: [{ id: 'page-2' }] } as any;
    await nextTick();

    expect(postMessage).toHaveBeenCalledTimes(2);
  });
});
