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

// @vitest-environment node
//
// LeaferRender 自身不需要 canvas;但 happy-dom 缺 CanvasRenderingContext2D,
// 而 leafer-ui 在 import 时会探测,跑 node 环境最稳。
// 这里只测构造器逻辑(纯 JS,不实例化 Leafer),不涉及画布。

import { describe, expect, it } from 'vitest';

import LeaferRender from '../../src/LeaferRender';
import LeaferShapeRegistry from '../../src/LeaferShapeRegistry';

describe('LeaferRender > constructor', () => {
  it('不传 shapeRegistry 时,内部创建一个真实 LeaferShapeRegistry 实例', () => {
    const r = new LeaferRender({});
    expect(r.shapeRegistry).toBeInstanceOf(LeaferShapeRegistry);
    // registerAll 必须是函数,不能是 undefined / undefined-cast 空对象
    expect(typeof r.shapeRegistry.registerAll).toBe('function');
    expect(typeof r.shapeRegistry.register).toBe('function');
    expect(typeof r.shapeRegistry.get).toBe('function');
  });

  it('业务方传入的 registry 被原样使用,不重新包一层', () => {
    const custom = new LeaferShapeRegistry();
    custom.register('button', (() => null) as any);

    const r = new LeaferRender({ shapeRegistry: custom });

    expect(r.shapeRegistry).toBe(custom);
    expect(r.shapeRegistry.has('button')).toBe(true);
  });

  it('默认 zoom 1', () => {
    const r = new LeaferRender({});
    // 通过 mount 后行为间接验证太重,直接读 public 字段(LeaferRender 没暴露 zoom getter 就只能这样)
    // LeaferRender 私有 zoom,通过 setZoom 调用后再用 spy 验证也行,但 P0 不强求
    expect((r as any).zoom).toBe(1);
  });

  it('传了 zoom 用传入值', () => {
    const r = new LeaferRender({ zoom: 0.5 });
    expect((r as any).zoom).toBe(0.5);
  });

  it('kind 标记为 leafer', () => {
    const r = new LeaferRender({});
    expect(r.kind).toBe('leafer');
  });
});
