import { onBeforeUnmount, type Ref, ref, type ShallowRef, toRaw, watch } from 'vue';

import { cloneDeep, type Id, type MApp } from '@tmagic/core';

import { serializeConfig } from './editor';

export const PREVIEW_UPDATE_MESSAGE = 'tmagic:preview:update';

export interface PreviewUpdateMessage {
  type: typeof PREVIEW_UPDATE_MESSAGE;
  dsl: string;
  pageId?: Id;
}

export const isPreviewUpdateMessage = (message: unknown): message is PreviewUpdateMessage => {
  if (!message || typeof message !== 'object') return false;

  const value = message as Partial<PreviewUpdateMessage>;
  return value.type === PREVIEW_UPDATE_MESSAGE && typeof value.dsl === 'string';
};

export const createPreviewUpdateMessage = (root: MApp, pageId?: Id): PreviewUpdateMessage => ({
  type: PREVIEW_UPDATE_MESSAGE,
  dsl: serializeConfig(cloneDeep(toRaw(root))),
  pageId,
});

const getTargetOrigin = (iframe: HTMLIFrameElement): string => {
  try {
    return new URL(iframe.src, globalThis.location.href).origin;
  } catch {
    return globalThis.location.origin;
  }
};

export interface PreviewBridgeOptions {
  iframe: ShallowRef<HTMLIFrameElement | undefined>;
  visible: Ref<boolean>;
  root: Ref<MApp | undefined>;
  pageId: Ref<Id | undefined>;
}

export const usePreviewBridge = ({ iframe, visible, root, pageId }: PreviewBridgeOptions) => {
  const iframeLoaded = ref(false);

  const send = () => {
    const target = iframe.value?.contentWindow;
    const currentRoot = root.value;
    if (!visible.value || !iframeLoaded.value || !target || !currentRoot) return;

    target.postMessage(createPreviewUpdateMessage(currentRoot, pageId.value), getTargetOrigin(iframe.value!));
  };

  const loadHandler = () => {
    iframeLoaded.value = true;
    send();
  };

  watch(visible, (isVisible) => {
    iframeLoaded.value = false;
    if (isVisible) queueMicrotask(send);
  });

  watch([root, pageId], send, { deep: true });

  onBeforeUnmount(() => {
    iframeLoaded.value = false;
  });

  return {
    iframeLoaded,
    loadHandler,
    send,
  };
};
