import { ref } from 'vue';

import { asyncLoadJs } from '@tmagic/editor';

const { VITE_ENTRY_PATH, MODE } = import.meta.env;

// Keep the playground usable when Vite is started without loading its mode env
// file. An undefined entry path otherwise becomes a valid-looking URL such as
// `/undefined/config/index.umd.cjs`, which silently prevents all preset
// configs from being registered.
const entryPath = (VITE_ENTRY_PATH || (MODE === 'react' ? './entry/react' : './entry/vue')).replace(/\/$/, '');

export const useEditorRes = () => {
  const propsValues = ref<Record<string, any>>({});
  const propsConfigs = ref<Record<string, any>>({});
  const eventMethodList = ref<Record<string, any>>({});
  const datasourceConfigs = ref<Record<string, any>>({});
  const datasourceValues = ref<Record<string, any>>({});

  const datasourceEventMethodList = ref<Record<string, any>>({
    base: {
      events: [],
      methods: [],
    },
  });

  asyncLoadJs(`${entryPath}/config/index.umd.cjs`).then(() => {
    propsConfigs.value = (globalThis as any).magicPresetConfigs;
  });
  asyncLoadJs(`${entryPath}/value/index.umd.cjs`).then(() => {
    propsValues.value = (globalThis as any).magicPresetValues;
  });
  asyncLoadJs(`${entryPath}/event/index.umd.cjs`).then(() => {
    eventMethodList.value = (globalThis as any).magicPresetEvents;
  });
  asyncLoadJs(`${entryPath}/ds-config/index.umd.cjs`).then(() => {
    datasourceConfigs.value = (globalThis as any).magicPresetDsConfigs;
  });
  asyncLoadJs(`${entryPath}/ds-value/index.umd.cjs`).then(() => {
    datasourceValues.value = (globalThis as any).magicPresetDsValues;
  });

  return {
    propsValues,
    propsConfigs,
    eventMethodList,
    datasourceConfigs,
    datasourceValues,
    datasourceEventMethodList,
  };
};
