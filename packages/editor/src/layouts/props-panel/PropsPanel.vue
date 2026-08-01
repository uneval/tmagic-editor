<template>
  <div class="m-editor-props-panel" v-show="nodes.length === 1">
    <slot name="props-panel-header"></slot>
    <FormPanel
      ref="propertyFormPanel"
      class="m-editor-props-property-panel"
      :config="curFormConfig"
      :values="values"
      :disabledShowSrc="disabledShowSrc"
      :extendState="extendState"
      @submit="(v, eventData, error) => submit(v, eventData, error, 'props')"
      @submit-error="errorHandler"
      @form-error="errorHandler"
      @mounted="mountedHandler"
      @unmounted="unmountedHandler"
    ></FormPanel>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, ref, useTemplateRef, watchEffect } from 'vue';

import { type MNode } from '@tmagic/core';
import type { ContainerChangeEventData, FormState, FormValue } from '@tmagic/form';
import { setValueByKeyPath } from '@tmagic/utils';

import { ENABLE_PROPS_FORM_VALIDATE } from '@editor/editorProps';
import { useServices } from '@editor/hooks/use-services';
import type { NodeInvalidSource, PropsPanelSlots } from '@editor/type';

import FormPanel from './FormPanel.vue';

defineSlots<PropsPanelSlots>();

defineOptions({
  name: 'MEditorPropsPanel',
});

defineProps<{
  disabledShowSrc?: boolean;
  extendState?: (_state: FormState) => Record<string, any> | Promise<Record<string, any>>;
}>();

const emit = defineEmits<{
  'submit-error': [e: any];
  'form-error': [e: any];
  mounted: [internalInstance: InstanceType<typeof FormPanel>];
  unmounted: [];
}>();

const { editorService, propsService } = useServices();

const enablePropsFormValidate = inject(ENABLE_PROPS_FORM_VALIDATE, false);

const values = ref<FormValue>({});
// ts类型应该是FormConfig， 但是打包时会出错，所以暂时用any
const curFormConfig = ref<any>([]);
const node = computed(() => editorService.get('node'));
const nodes = computed(() => editorService.get('nodes'));

// 用单调递增序号标记每次 init 调用，只让"最新一次"的 await 结果落到 ref 上。
// 避免节点快速切换时多个 init 并发 + 解析顺序错乱导致 stale config 覆盖最新选中节点，
// 以及组件已卸载 / FormPanel 正在 remount 的中间态下写 ref 触发 Vue setRef 把 __vnode
// 设到 null 上的报错（TypeError: Cannot set properties of null (setting '__vnode')）。
let initSeq = 0;
let mounted = true;

const init = async () => {
  initSeq += 1;
  const seq = initSeq;

  if (!node.value) {
    if (seq !== initSeq || !mounted) return;
    curFormConfig.value = [];
    return;
  }

  const type = node.value.type || (node.value.items ? 'container' : 'text');
  const config = await propsService.getPropsConfig(type, { node: node.value });

  // 期间被新一次 init 取代 / 组件已卸载，丢弃本次结果
  if (seq !== initSeq || !mounted) return;
  if (!node.value) return;

  curFormConfig.value = config;
  values.value = node.value;
};

watchEffect(init);
propsService.on('props-configs-change', init);

onBeforeUnmount(() => {
  mounted = false;
  propsService.off('props-configs-change', init);
});

const submit = async (
  v: MNode,
  eventData?: ContainerChangeEventData,
  error?: any,
  source: NodeInvalidSource = 'props',
) => {
  try {
    const isStyleChange = eventData?.changeRecords?.some(
      ({ propPath }) => propPath === 'style' || propPath?.startsWith('style.'),
    );
    const invalidInfoSource = source === 'props' && isStyleChange ? 'style' : source;

    if (!v.id) {
      v.id = values.value.id;
    }

    const newValue: MNode = {
      ...v,
      style: {},
    };

    if (v.style) {
      // 空字符串样式值表示「清除该样式」，需保留才能在 doUpdate 的 mergeWith 中覆盖旧值。
      if (eventData) {
        // 表单编辑：先过滤掉空字符串（避免表单默认空值污染 DSL），
        // 再按 changeRecords 恢复被主动清空的字段。
        Object.entries(v.style).forEach(([key, value]) => {
          if (value !== '' && newValue.style) {
            newValue.style[key] = value;
          }
        });

        eventData.changeRecords?.forEach((record) => {
          if (record.propPath?.startsWith('style') && record.value === '') {
            setValueByKeyPath(record.propPath, record.value, newValue);
          }
        });
      } else {
        // 源码编辑器保存（无 eventData）：style 原样保留，其中的空字符串视为用户主动清除该样式。
        newValue.style = { ...v.style };
      }
    }

    // 区分操作途径：表单字段编辑（MForm @change）会带上 eventData（含 changeRecords）；
    // 源码编辑器（CodeEditor @save → saveCode）保存时不带 eventData，据此标记为「源码编辑器」。
    const historySource = eventData ? 'props' : 'code';

    editorService.update(newValue, {
      changeRecords: eventData?.changeRecords,
      historySource,
      // 启用校验联动时，仅校验失败（error 存在）才把错误信息随更新传入 editorService 记录；
      // 其余情况（含表单校验成功、CodeEditor 源码保存）不携带 invalidInfo，由 editorService 在执行 update 时统一清除该节点错误。
      ...(enablePropsFormValidate && error
        ? { invalidInfo: { id: newValue.id, source: invalidInfoSource, error: error?.message } }
        : {}),
    });
  } catch (e: any) {
    emit('submit-error', e);
  }
};

const errorHandler = (e: any) => {
  emit('form-error', e);
};

const mountedHandler = () => {
  if (propertyFormPanelRef.value) {
    emit('mounted', propertyFormPanelRef.value);
  }
};

const unmountedHandler = () => {
  emit('unmounted');
};

const propertyFormPanelRef = useTemplateRef<InstanceType<typeof FormPanel>>('propertyFormPanel');
defineExpose({
  getFormState() {
    return propertyFormPanelRef.value?.configForm?.formState;
  },
  submit,
});
</script>
