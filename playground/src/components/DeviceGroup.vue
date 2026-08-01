<template>
  <TMagicRadioGroup size="small" v-model="viewerDevice" :class="viewerDevice" @change="deviceSelect">
    <TMagicRadioButton value="phone">Phone</TMagicRadioButton>
    <TMagicRadioButton value="pad">Pad</TMagicRadioButton>
    <TMagicRadioButton value="pc">PC</TMagicRadioButton>
  </TMagicRadioGroup>
</template>

<script lang="ts" setup>
import { ref } from 'vue';

import { TMagicRadioButton, TMagicRadioGroup } from '@tmagic/editor';

import { DeviceType } from '../const';

const devH: Record<DeviceType, number | string> = {
  phone: 817,
  pad: 1024,
  pc: '100%',
};

const devW: Record<DeviceType, number | string> = {
  phone: 375,
  pad: 768,
  pc: '100%',
};

const getDeviceHeight = (viewerDevice: DeviceType) => devH[viewerDevice];

const getDeviceWidth = (viewerDevice: DeviceType) => devW[viewerDevice];

const modelValue = defineModel<{
  width: number | string;
  height: number | string;
}>('modelValue', {
  default: () => ({
    width: 375,
    height: 817,
  }),
});

const viewerDevice = ref(DeviceType.Phone);

const deviceSelect = (device: DeviceType) => {
  const width = getDeviceWidth(device);
  const height = getDeviceHeight(device);
  modelValue.value = {
    width,
    height,
  };
};

defineExpose({
  viewerDevice,
});
</script>

<style lang="scss">
.m-editor-workspace {
  * {
    user-select: none;
  }

  .el-slider {
    position: absolute;
    bottom: 40px;
    left: 20px;
    width: 250px;
    opacity: 0.5;
    transition: opacity 1s;
  }

  .el-slider:hover {
    opacity: 1;
  }

  .el-radio-group {
    position: absolute;
    top: 10px;
    right: 40px;
    z-index: 10;
  }

  .viewer-scrollbar > .el-scrollbar__bar {
    display: none;
  }

  .select-component {
    text-align: center;
    transform: translate3d(0, -70px, 0);

    p {
      margin-top: 8px;
    }
  }

  .close-pop-button {
    position: absolute;
    left: 50%;
    transform: translate(-50%);
  }
}
</style>
