import { computed } from 'vue';

import type { Id, MNode } from '@tmagic/core';
import LeaferStage, { type LeaferEditData } from '@tmagic/leafer-stage';

import editorService from '@editor/services/editor';
import uiService from '@editor/services/ui';
import type { StageOptions } from '@editor/type';
import { buildChangeRecords } from '@editor/utils/editor';

const zoom = computed(() => uiService.get('zoom') || 1);

export const useStage = (stageOptions: StageOptions) => {
  const stage = new LeaferStage({ zoom: stageOptions.zoom ?? zoom.value, canDropIn: stageOptions.canDropIn });

  // Leafer shape 只在独立 LeaferStage 路径按需加载。注册完成后重新提交当前
  // root，覆盖 mount / setRoot / dynamic import 三者之间可能出现的竞态。
  {
    void import('@leafer-components').then(({ builtinShapes }) => {
      stage.shapeRegistry.registerAll({ ...builtinShapes });
      const currentRoot = editorService.get('root');
      if (currentRoot) {
        void stage.setRoot(currentRoot as any, editorService.get('page')?.id);
      }
    });
  }

  stage.on('page-el-update', () => {
    editorService.set('stageLoading', false);
  });

  stage.on('select', (ids: Id[]) => {
    if (ids.length === 1) {
      void editorService.select(ids[0]);
    } else if (ids.length > 1) {
      void editorService.multiSelect(ids);
    }
  });

  let latestEditSessionId = 0;
  stage.on('edit-end', ({ sessionId, configs }: LeaferEditData) => {
    void (async () => {
      latestEditSessionId = sessionId;
      const changeRecordList = configs.map(({ style }) => buildChangeRecords(style, 'style'));
      const targetParentId = configs.find((config) => config.parentId)?.parentId;
      if (targetParentId !== undefined) {
        await editorService.moveToContainer(
          configs.map(({ id, style }) => ({ id, style })),
          targetParentId,
          { historySource: 'stage' },
        );
      } else {
        await editorService.update(configs as MNode[], {
          changeRecordList,
          historySource: 'stage',
        });
      }
      if (sessionId !== latestEditSessionId) return;
      setTimeout(() => {
        if (sessionId !== latestEditSessionId) return;
        void stage.select(configs.map(({ id }) => id));
      });
    })();
  });

  return stage;
};
