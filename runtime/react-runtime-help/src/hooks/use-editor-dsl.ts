import { cloneDeep } from 'lodash-es';

import type TMagicApp from '@tmagic/core';
import type { Id, MApp } from '@tmagic/core';
import { getElById, replaceChildNode } from '@tmagic/core';
import type { Magic, RemoveData, SortEventData, UpdateData } from '@tmagic/stage';

declare global {
  interface Window {
    magic?: Magic;
  }
}

const parsePreviewDsl = (dsl: unknown): MApp | undefined => {
  if (typeof dsl !== 'string') return;

  try {
    // DSL 由同源编辑器生成，沿用 localStorage 预览使用的可执行序列化格式。
    // eslint-disable-next-line no-eval
    const root = eval(`(${dsl})`) as MApp;
    return root && Array.isArray(root.items) ? root : undefined;
  } catch {
    return undefined;
  }
};

export const useEditorDsl = (app: TMagicApp, renderDom: () => void) => {
  let curPageId: Id = '';

  const updateConfig = (root: MApp) => {
    app.setConfig(root, curPageId);
    renderDom();
  };

  const previewMessageHandler = (event: MessageEvent) => {
    if (event.source !== window.parent) return;

    const message = event.data;
    if (message?.type !== 'tmagic:preview:update') return;

    const root = parsePreviewDsl(message.dsl);
    if (!root) return;

    curPageId = message.pageId ?? curPageId;
    updateConfig(root);
  };

  window.addEventListener('message', previewMessageHandler);

  window.magic?.onRuntimeReady({
    getApp() {
      return app;
    },

    updateRootConfig(root: MApp) {
      app?.setConfig(root);
    },

    updatePageId(id: Id) {
      curPageId = id;
      app.setPage(curPageId);
      renderDom();
    },

    select(id: Id) {
      const el = getElById()(document, id);
      if (el) return el;
      // 未在当前文档下找到目标元素，可能是还未渲染，等待渲染完成后再尝试获取
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(getElById()(document, id));
        }, 0);
      });
    },

    add({ root }: UpdateData) {
      updateConfig(root);
    },

    update({ config, root, parentId }: UpdateData) {
      if (config.type === 'app') {
        this.updateRootConfig?.(config as MApp);
        return;
      }

      const newNode = app?.dataSourceManager?.compiledNode(config, undefined, true) || config;

      replaceChildNode(newNode, [root], parentId);
      updateConfig(cloneDeep(root));
    },

    sortNode({ root }: SortEventData) {
      root && updateConfig(root);
    },

    remove({ root }: RemoveData) {
      updateConfig(root);
    },
  });
};
