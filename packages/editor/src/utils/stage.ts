/*
 * Tencent is pleased to support the open source community by making TMagicEditor available.
 *
 * Copyright (C) 2025 Tencent.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { StageOptions } from '../type';

/**
 * 判断 StageOptions 是否足够创建一个可挂载的 StageCore。
 *
 * 不同渲染器需要的最小配置:
 * - 'iframe'(默认):runtimeUrl 或 自定义 render 至少一个
 * - 'leafer':只需 renderer 字段(业务方可另外传 shapeRegistry,但 stage core 创建不依赖)
 *
 * 这是单一来源,Workspace.vue / Stage.vue / useStage 都用它做 mount gate,
 * 避免在多处重复写 `runtimeUrl || render || renderer === 'leafer'`。
 */
export const isStageMountable = (options?: StageOptions | null): boolean => {
  if (!options) return false;
  if (options.renderer === 'leafer') return true;
  return Boolean(options.runtimeUrl) || typeof options.render === 'function';
};
