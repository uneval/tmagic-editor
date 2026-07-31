<template>
  <ScrollViewer
    class="m-editor-stage"
    ref="stageWrap"
    tabindex="-1"
    :width="stageRect?.width"
    :height="stageRect?.height"
    :wrap-width="stageContainerRect?.width"
    :wrap-height="stageContainerRect?.height"
    :zoom="zoom"
    :infinite="stageOptions.renderer === 'leafer'"
    :correction-scroll-size="{
      width: 60,
      height: 50,
    }"
    @click="stageWrapRef?.container?.focus()"
  >
    <div
      class="m-editor-stage-container"
      ref="stageContainer"
      :style="stageOptions.renderer === 'leafer' ? undefined : `transform: scale(${zoom});`"
      @contextmenu="contextmenuHandler"
      @drop="dropHandler"
      @dragover="dragoverHandler"
    ></div>

    <NodeListMenu></NodeListMenu>

    <template #before>
      <slot name="stage-top"></slot>
    </template>

    <template #content>
      <StageOverlay v-if="!disabledStageOverlay"></StageOverlay>

      <Teleport to="body">
        <ViewerMenu
          ref="menu"
          :is-multi-select="isMultiSelect"
          :stage-content-menu="stageContentMenu"
          :custom-content-menu="customContentMenu"
        ></ViewerMenu>
      </Teleport>
    </template>
  </ScrollViewer>
</template>

<script lang="ts" setup>
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch, watchEffect } from 'vue';

import type { MContainer } from '@tmagic/core';
import StageCore, { getOffset, Runtime } from '@tmagic/stage';
import { calcValueByFontsize, getIdFromEl } from '@tmagic/utils';

import ScrollViewer from '@editor/components/ScrollViewer.vue';
import { useServices } from '@editor/hooks';
import { useStage } from '@editor/hooks/use-stage';
import type { CustomContentMenuFunction, MenuButton, MenuComponent, StageOptions, StageSlots } from '@editor/type';
import { DragType, Layout } from '@editor/type';
import { getEditorConfig } from '@editor/utils/config';
import { KeyBindingContainerKey } from '@editor/utils/keybinding-config';
import { isStageMountable } from '@editor/utils/stage';

import NodeListMenu from './NodeListMenu.vue';
import StageOverlay from './StageOverlay.vue';
import ViewerMenu from './ViewerMenu.vue';

defineOptions({
  name: 'MEditorStage',
});

defineSlots<StageSlots>();

const props = withDefaults(
  defineProps<{
    stageOptions: StageOptions;
    stageContentMenu: (MenuButton | MenuComponent)[];
    disabledStageOverlay?: boolean;
    customContentMenu: CustomContentMenuFunction;
  }>(),
  {
    disabledStageOverlay: false,
  },
);

let stage: StageCore | null = null;
let runtime: Runtime | null = null;

const { editorService, uiService, keybindingService, stageOverlayService } = useServices();

// stageLoading 状态保留在 editorService 里(其他地方还在 set,业务可能也读),
// 只是 Stage.vue 不再 bind 到 v-loading 上 —— leafer 路径下没有 "Runtime 加载" 这个语义,
// 之前在 leafer 路径下转圈是因为 page-el-update 只从 iframe 路径 emit,
// 强迫两条路径共享同一个 el-loading 视觉本来就是设计歪的。
// 这里直接把 el-loading 摘掉,状态还在,以后真要做 "leafer canvas 初始加载态" 再说。
const stageLoading = computed(() => editorService.get('stageLoading'));
void stageLoading.value;

const stageWrapRef = useTemplateRef<InstanceType<typeof ScrollViewer>>('stageWrap');
const stageContainerEl = useTemplateRef<HTMLDivElement>('stageContainer');
const menuRef = useTemplateRef<InstanceType<typeof ViewerMenu>>('menu');

const nodes = computed(() => editorService.get('nodes'));
const isMultiSelect = computed(() => nodes.value.length > 1);
const stageRect = computed(() => uiService.get('stageRect'));
const stageContainerRect = computed(() => uiService.get('stageContainerRect'));
const root = computed(() => editorService.get('root'));
const page = computed(() => editorService.get('page'));
const zoom = computed(() => uiService.get('zoom'));
const node = computed(() => editorService.get('node'));

/**
 * 判断元素是否被非页面级的滚动容器裁剪（未完整显示）
 *
 * 从元素向上遍历祖先节点，跳过页面/页面片容器，
 * 检查是否存在设置了 overflow 的滚动容器将该元素裁剪，
 * 只有元素未被完整显示时才需要打开 overlay 以展示完整内容
 */
const isClippedByScrollContainer = (el: HTMLElement): boolean => {
  const win = el.ownerDocument.defaultView;
  if (!win) return false;

  // 收集所有页面和页面片的 id
  const root = editorService.get('root');
  const pageIds = new Set(root?.items?.map((item) => `${item.id}`) ?? []);

  // el 本身就是页面或页面片，无需判断
  const elId = getIdFromEl()(el);
  if (elId && pageIds.has(elId)) return false;

  let parent = el.parentElement;

  while (parent && parent !== el.ownerDocument.documentElement) {
    const parentId = getIdFromEl()(parent);

    // 到达页面或页面片层级，不再继续向上查找
    if (parentId && pageIds.has(parentId)) {
      return false;
    }

    const { overflowX, overflowY } = win.getComputedStyle(parent);

    if (
      ['auto', 'scroll', 'hidden'].includes(overflowX) ||
      ['auto', 'scroll', 'hidden'].includes(overflowY) ||
      parent.scrollWidth > parent.clientWidth ||
      parent.scrollHeight > parent.clientHeight
    ) {
      // 比较元素与容器的可视区域，判断元素是否被裁剪
      const elRect = el.getBoundingClientRect();
      const containerRect = parent.getBoundingClientRect();
      if (
        elRect.top < containerRect.top ||
        elRect.left < containerRect.left ||
        elRect.bottom > containerRect.bottom ||
        elRect.right > containerRect.right
      ) {
        return true;
      }
    }
    parent = parent.parentElement;
  }
  return false;
};

watchEffect(() => {
  if (stage || !page.value) return;

  if (!stageContainerEl.value) return;
  // 单一来源:isStageMountable 把"leafer 路径直接过 + iframe 路径要 runtimeUrl/render"封装成一个函数,
  // 避免在多处重复写 if-else。注意 root 是 iframe 路径才需要的(dep 收集等),leafer 路径不强求。
  if (!isStageMountable(props.stageOptions)) return;
  if (props.stageOptions?.renderer !== 'leafer' && !root.value) return;

  stage = useStage(props.stageOptions);

  stage.on('select', () => {
    stageWrapRef.value?.container?.focus();
  });

  stage.on('dblclick', async (event: MouseEvent) => {
    if (props.stageOptions.beforeDblclick) {
      const result = await props.stageOptions.beforeDblclick(event);
      if (result === false) return;
    }

    const el = (await stage?.actionManager?.getElementFromPoint(event)) || null;
    if (!el) return;

    const id = getIdFromEl()(el);

    if (id) {
      const node = editorService.getNodeById(id);
      if (node?.type === 'page-fragment-container' && node.pageFragmentId) {
        await editorService.select(node.pageFragmentId);
        return;
      }
    }

    if (!props.disabledStageOverlay && isClippedByScrollContainer(el)) {
      stageOverlayService.openOverlay(el);
      return;
    }

    const nextEl = (await stage?.actionManager?.getNextElementFromPoint(event)) || null;
    if (nextEl) {
      const nextId = getIdFromEl()(nextEl);
      if (nextId) {
        await editorService.select(nextId);
        editorService.get('stage')?.select(nextId);
      }
    }
  });

  editorService.set('stage', markRaw(stage));

  stage.mount(stageContainerEl.value);

  if (!node.value?.id) {
    return;
  }

  stage.on('runtime-ready', (rt) => {
    runtime = rt;
  });
});

onBeforeUnmount(() => {
  stage?.destroy();
  editorService.set('stage', null);
});

watch(zoom, (zoom) => {
  if (!stage || !zoom) return;
  stage.setZoom(zoom);
});

let timeoutId: ReturnType<typeof setTimeout> | null = null;
watch(page, (page) => {
  if (runtime && page) {
    editorService.set('stageLoading', true);

    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }

    timeoutId = globalThis.setTimeout(() => {
      editorService.set('stageLoading', false);
      timeoutId = null;
    }, 3000);

    runtime.updatePageId?.(page.id);

    const unWatch = watch(
      stageLoading,
      () => {
        if (stageLoading.value) {
          return;
        }

        nextTick(() => {
          stage?.select(page.id);
          unWatch();
        });
      },
      {
        immediate: true,
      },
    );
  }
});

const resizeObserver = new globalThis.ResizeObserver((entries) => {
  for (const { contentRect } of entries) {
    uiService.set('stageContainerRect', {
      width: contentRect.width,
      height: contentRect.height,
    });
  }
});

onMounted(() => {
  if (stageWrapRef.value?.container) {
    resizeObserver.observe(stageWrapRef.value.container);
    keybindingService.registerEl(KeyBindingContainerKey.STAGE, stageWrapRef.value.container);
  }
});

onBeforeUnmount(() => {
  stage?.destroy();
  stage = null;
  resizeObserver.disconnect();
  editorService.set('stage', null);
  keybindingService.unregisterEl('stage');
});

const parseDSL = getEditorConfig('parseDSL');

const contextmenuHandler = (e: MouseEvent) => {
  e.preventDefault();
  menuRef.value?.show(e);
};

const dragoverHandler = (e: DragEvent) => {
  if (!e.dataTransfer) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};

const dropHandler = async (e: DragEvent) => {
  if (!e.dataTransfer) return;

  const data = e.dataTransfer.getData('text/json');

  if (!data) return;

  const config = parseDSL(`(${data})`);

  if (!config || config.dragType !== DragType.COMPONENT_LIST) return;

  e.preventDefault();

  const doc = stage?.renderer?.contentWindow?.document;
  const parentEl: HTMLElement | null | undefined = doc?.querySelector(
    `.${props.stageOptions?.containerHighlightClassName}`,
  );

  let parent: MContainer | undefined | null = page.value;
  let resolvedParentEl: HTMLElement | null | undefined = parentEl;
  const parentId = getIdFromEl()(parentEl);
  if (parentId) {
    parent = editorService.getNodeById(parentId, false) as MContainer;
  }

  if (parent && stageContainerEl.value && stage) {
    // 通过用户配置的钩子再次确认当前拖入的新组件是否允许放入命中的高亮容器，
    // 防止 delayedMarkContainer 的延迟/异步未生效或残留高亮导致命中错误容器
    //   - 返回 false：取消此次拖入
    //   - 返回 Id  ：将父节点重定向到该 id 对应的节点（layout 坐标也基于其 DOM 重新计算）
    //   - 其他    ：使用原命中节点
    // 从组件列表拖入新组件时 sourceIds 为空数组（尚无 id）
    if (props.stageOptions.canDropIn) {
      const result = props.stageOptions.canDropIn([], parent.id);
      if (result === false) {
        return;
      }
      if (typeof result === 'string' || typeof result === 'number') {
        const redirectedNode = editorService.getNodeById(result, false) as MContainer | undefined;
        if (!redirectedNode) {
          return;
        }
        parent = redirectedNode;
        resolvedParentEl = stage.renderer?.getTargetElement(result) ?? null;
      }
    }

    const layout = await editorService.getLayout(parent);

    const containerRect = stageContainerEl.value.getBoundingClientRect();
    const { scrollTop, scrollLeft } = stage.mask!;
    const { style = {} } = config.data;

    let top = 0;
    let left = 0;
    let position = 'relative';

    if (style.position === 'fixed') {
      position = 'fixed';
      top = e.clientY - containerRect.top;
      left = e.clientX - containerRect.left;
    } else if (layout === Layout.ABSOLUTE) {
      position = 'absolute';
      top = e.clientY - containerRect.top + scrollTop;
      left = e.clientX - containerRect.left + scrollLeft;

      if (resolvedParentEl) {
        const { left: parentLeft, top: parentTop } = getOffset(resolvedParentEl);
        left = left - parentLeft * zoom.value;
        top = top - parentTop * zoom.value;
      }
    }

    config.data.style = {
      ...style,
      position,
      top: calcValueByFontsize(doc, top / zoom.value),
      left: calcValueByFontsize(doc, left / zoom.value),
    };

    config.data.inputEvent = e;

    editorService.add(config.data, parent, { historySource: 'component-panel' });
  }
};
</script>
