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

import { describe, expect, it } from 'vitest';

import type { StageOptions } from '../../../src/type';
import { isStageMountable } from '../../../src/utils/stage';

describe('utils/stage > isStageMountable', () => {
  it('null / undefined 输入返回 false', () => {
    expect(isStageMountable(null)).toBe(false);
    expect(isStageMountable(undefined)).toBe(false);
  });

  it('iframe 路径(默认)需要 runtimeUrl 或 render', () => {
    expect(isStageMountable({})).toBe(false);
    expect(isStageMountable({ runtimeUrl: '' })).toBe(false);
    expect(isStageMountable({ render: undefined })).toBe(false);
    expect(isStageMountable({ renderer: 'iframe', runtimeUrl: '' })).toBe(false);
  });

  it('iframe 路径给了 runtimeUrl 就可挂载', () => {
    expect(isStageMountable({ runtimeUrl: '/runtime.html' })).toBe(true);
    expect(isStageMountable({ renderer: 'iframe', runtimeUrl: '/r.html' })).toBe(true);
  });

  it('iframe 路径给了 render 函数也可挂载', () => {
    const render = () => document.createElement('div');
    expect(isStageMountable({ render })).toBe(true);
  });

  it('leafer 路径只需 renderer 字段,不需要 runtimeUrl/render', () => {
    expect(isStageMountable({ renderer: 'leafer' })).toBe(true);
    expect(isStageMountable({ renderer: 'leafer', runtimeUrl: '' })).toBe(true);
  });

  it('完整 StageOptions 各字段组合都正确', () => {
    const fullLeafer: StageOptions = {
      renderer: 'leafer',
      runtimeUrl: undefined,
      autoScrollIntoView: true,
      zoom: 1,
      canSelect: () => true,
    };
    expect(isStageMountable(fullLeafer)).toBe(true);

    const fullIframe: StageOptions = {
      renderer: 'iframe',
      runtimeUrl: '/r.html',
      renderType: 'iframe' as any,
    };
    expect(isStageMountable(fullIframe)).toBe(true);
  });
});
