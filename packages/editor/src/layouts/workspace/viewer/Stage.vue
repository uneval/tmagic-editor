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
    :infinite="true"
    :correction-scroll-size="{
      width: 60,
      height: 50,
    }"
    @click="stageWrapRef?.container?.focus()"
  >
    <div
      class="m-editor-stage-container"
      ref="stageContainer"
      @contextmenu="contextmenuHandler"
      @drop="dropHandler"
      @dragover="dragoverHandler"
    ></div>

    <NodeListMenu></NodeListMenu>

    <template #before>
      <slot name="stage-top"></slot>
    </template>

    <template #content>
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
import { computed, markRaw, onBeforeUnmount, onMounted, useTemplateRef, watch, watchEffect } from 'vue';

import type { MContainer } from '@tmagic/core';
import LeaferStage from '@tmagic/leafer-stage';

import ScrollViewer from '@editor/components/ScrollViewer.vue';
import { useServices } from '@editor/hooks';
import { useStage } from '@editor/hooks/use-stage';
import type { CustomContentMenuFunction, MenuButton, MenuComponent, StageOptions, StageSlots } from '@editor/type';
import { DragType, Layout } from '@editor/type';
import { getEditorConfig } from '@editor/utils/config';
import { KeyBindingContainerKey } from '@editor/utils/keybinding-config';

import NodeListMenu from './NodeListMenu.vue';
import ViewerMenu from './ViewerMenu.vue';

defineOptions({
  name: 'MEditorStage',
});

defineSlots<StageSlots>();

const props = defineProps<{
  stageOptions: StageOptions;
  stageContentMenu: (MenuButton | MenuComponent)[];
  customContentMenu: CustomContentMenuFunction;
}>();

let stage: LeaferStage | null = null;

const { editorService, uiService, keybindingService } = useServices();

// stageLoading 状态保留在 editorService 里(其他地方还在 set,业务可能也读),
// 只是 Stage.vue 不再 bind 到 v-loading 上 —— leafer 路径下没有 "Runtime 加载" 这个语义,
// 之前在 leafer 路径下转圈是因为 page-el-update 只从 iframe 路径 emit,
// 强迫两条路径共享同一个 el-loading 视觉本来就是设计歪的。
// 这里直接把 el-loading 摘掉,状态还在,以后真要做 "leafer canvas 初始加载态" 再说。
const stageWrapRef = useTemplateRef<InstanceType<typeof ScrollViewer>>('stageWrap');
const stageContainerEl = useTemplateRef<HTMLDivElement>('stageContainer');
const menuRef = useTemplateRef<InstanceType<typeof ViewerMenu>>('menu');

const nodes = computed(() => editorService.get('nodes'));
const isMultiSelect = computed(() => nodes.value.length > 1);
const stageRect = computed(() => uiService.get('stageRect'));
const stageContainerRect = computed(() => uiService.get('stageContainerRect'));
const page = computed(() => editorService.get('page'));
const zoom = computed(() => uiService.get('zoom'));

watchEffect(() => {
  if (stage || !page.value) return;

  if (!stageContainerEl.value) return;
  stage = useStage(props.stageOptions);

  stage.on('select', () => {
    stageWrapRef.value?.container?.focus();
  });

  stage.on('dblclick', async (event: MouseEvent) => {
    if (props.stageOptions.beforeDblclick) {
      const result = await props.stageOptions.beforeDblclick(event);
      if (result === false) return;
    }

    const ids = stage?.getNodeIdsAtPoint(event) ?? [];
    const id = ids[0];
    if (!id) return;

    const node = editorService.getNodeById(id);
    if (node?.type === 'page-fragment-container' && node.pageFragmentId) {
      await editorService.select(node.pageFragmentId);
      return;
    }

    const nextId = ids[1];
    if (nextId) {
      await editorService.select(nextId);
      editorService.get('stage')?.select(nextId);
    }
  });

  editorService.set('stage', markRaw(stage));

  void stage.mount(stageContainerEl.value);
});

onBeforeUnmount(() => {
  stage?.destroy();
  editorService.set('stage', null);
});

watch(zoom, (zoom) => {
  if (!stage || !zoom) return;
  stage.setZoom(zoom);
});

watch(page, (page) => {
  if (stage && page) {
    void stage.select(page.id);
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

  let parent: MContainer | undefined | null = page.value;
  const target = stage?.resolveDropTarget(e, []);
  if (target) {
    parent = editorService.getNodeById(target.id, false) as MContainer;
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
      }
    }

    const layout = await editorService.getLayout(parent);
    const { style = {} } = config.data;

    const localPoint = stage.getLocalPoint(e, parent.id);
    if (!localPoint) return;

    let top = localPoint.y;
    let left = localPoint.x;
    let position = 'relative';

    if (style.position === 'fixed') {
      position = 'fixed';
      top = localPoint.y;
      left = localPoint.x;
    } else if (layout === Layout.ABSOLUTE) {
      position = 'absolute';
    }

    config.data.style = {
      ...style,
      position,
      top,
      left,
    };

    config.data.inputEvent = e;

    editorService.add(config.data, parent, { historySource: 'component-panel' });
  }
};
</script>
