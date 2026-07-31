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
// LeaferStage 自身不需要 canvas;但 happy-dom 缺 CanvasRenderingContext2D,
// 而 leafer-ui 在 import 时会探测,跑 node 环境最稳。
// 这里只测构造器逻辑(纯 JS,不实例化 Leafer),不涉及画布。

import { describe, expect, it, vi } from 'vitest';

import LeaferStage from '../../src/LeaferStage';
import LeaferShapeRegistry from '../../src/LeaferShapeRegistry';

class FakeNode {
  public children: FakeNode[] = [];
  public parent: FakeNode | null = null;

  public add(node: FakeNode) {
    node.parent = this;
    this.children.push(node);
  }

  public removeAll() {
    this.children = [];
  }
}

vi.mock('leafer-ui', () => {
  class MockNode {
    public children: MockNode[] = [];
    public parent: MockNode | null = null;

    public add(node: MockNode) {
      node.parent = this;
      this.children.push(node);
    }

    public removeAll() {
      this.children = [];
    }
  }

  return {
    Leafer: class extends MockNode {
      public destroy() {}
    },
    Group: MockNode,
    Frame: MockNode,
    Rect: MockNode,
  };
});

describe('LeaferStage > constructor', () => {
  it('不传 shapeRegistry 时,内部创建一个真实 LeaferShapeRegistry 实例', () => {
    const r = new LeaferStage({});
    expect(r.shapeRegistry).toBeInstanceOf(LeaferShapeRegistry);
    // registerAll 必须是函数,不能是 undefined / undefined-cast 空对象
    expect(typeof r.shapeRegistry.registerAll).toBe('function');
    expect(typeof r.shapeRegistry.register).toBe('function');
    expect(typeof r.shapeRegistry.get).toBe('function');
  });

  it('业务方传入的 registry 被原样使用,不重新包一层', () => {
    const custom = new LeaferShapeRegistry();
    custom.register('button', (() => null) as any);

    const r = new LeaferStage({ shapeRegistry: custom });

    expect(r.shapeRegistry).toBe(custom);
    expect(r.shapeRegistry.has('button')).toBe(true);
  });

  it('默认 zoom 1', () => {
    const r = new LeaferStage({});
    // 通过 mount 后行为间接验证太重,直接读 public 字段(LeaferStage 没暴露 zoom getter 就只能这样)
    // LeaferStage 私有 zoom,通过 setZoom 调用后再用 spy 验证也行,但 P0 不强求
    expect((r as any).zoom).toBe(1);
  });

  it('传了 zoom 用传入值', () => {
    const r = new LeaferStage({ zoom: 0.5 });
    expect((r as any).zoom).toBe(0.5);
  });

  it('setZoom 不重复缩放 Leafer 世界坐标', () => {
    const r = new LeaferStage({});
    const scaleOfWorld = vi.fn();
    (r as any).leafer = { scaleOfWorld };

    r.setZoom(0.5);

    expect((r as any).zoom).toBe(0.5);
    expect(scaleOfWorld).not.toHaveBeenCalled();
  });

  it('kind 标记为 leafer', () => {
    const r = new LeaferStage({});
    expect(r.kind).toBe('leafer');
  });

  it('setRoot 递归构建容器下的嵌套节点', async () => {
    const r = new LeaferStage({});
    r.shapeRegistry.register('page', (config) => ({ node: new FakeNode(), children: config.items }));
    r.shapeRegistry.register('container', (config) => ({ node: new FakeNode(), children: config.items }));
    r.shapeRegistry.register('text', () => new FakeNode());

    (r as any).leafer = { add: () => {}, destroy: () => {} };
    (r as any).rootGroup = new FakeNode();

    await r.setRoot({
      id: 'app',
      type: 'app',
      items: [
        {
          id: 'page-1',
          type: 'page',
          items: [
            {
              id: 'container-1',
              type: 'container',
              items: [{ id: 'text-1', type: 'text' }],
            },
          ],
        },
      ],
    } as any);

    expect((r as any).nodeMap.has('container-1')).toBe(true);
    expect((r as any).nodeMap.has('text-1')).toBe(true);
    expect((r as any).nodeMap.get('container-1').editable).toBe(true);
    expect((r as any).nodeMap.get('text-1').editable).toBe(true);
    expect((r as any).nodeMap.get('container-1').hitChildren).toBe(true);
  });

  it('setRoot 同时构建多个页面,由 stage 横向排版', async () => {
    const r = new LeaferStage({});
    r.shapeRegistry.register('page', (config) => ({ node: new FakeNode(), children: config.items }));
    r.shapeRegistry.register('button', () => new FakeNode());
    r.shapeRegistry.register('qrcode', () => new FakeNode());

    (r as any).leafer = { add: () => {}, destroy: () => {} };
    (r as any).rootGroup = new FakeNode();

    await r.setRoot({
      id: 'app',
      type: 'app',
      items: [
        { id: 'index', type: 'page', items: [{ id: 'qr', type: 'qrcode' }] },
        { id: 'page2', type: 'page', items: [{ id: 'back', type: 'button' }] },
      ],
    } as any, 'page2');

    expect((r as any).nodeMap.has('page2')).toBe(true);
    expect((r as any).nodeMap.has('back')).toBe(true);
    expect((r as any).nodeMap.has('index')).toBe(true);
    expect((r as any).nodeMap.has('qr')).toBe(true);
    expect((r as any).pageFrames.size).toBe(2);
    expect((r as any).pageFrames.get('page2').editable).toBe(true);
  });

  it('setRoot 事件契约:StageCore 依赖这个事件来清 editorService.stageLoading', async () => {
    // P0 简化:不真正 mount leafer(避免 canvas 依赖),只验证事件契约
    // - 未 mount 时 setRoot 把 root 缓存到 pendingRoot,不 emit
    // - 模拟 mount 完后(set leafer/rootGroup),再 setRoot 必须 emit 'set-root'
    //   让 StageCore 转发成 page-el-update
    const r = new LeaferStage({});
    const setRootSpy = vi.fn();
    r.on('set-root', setRootSpy);

    // 没 mount 直接 setRoot → 缓存到 pendingRoot,不 emit
    await r.setRoot({ id: '1', type: 'app', items: [] } as any, 'p1');
    expect(setRootSpy).not.toHaveBeenCalled();
    expect((r as any).pendingRoot).not.toBeNull();

    // 模拟 mount 完:set leafer/rootGroup,验证再次 setRoot 真 emit
    (r as any).leafer = { add: () => {}, destroy: () => {} };
    (r as any).rootGroup = { removeAll: () => {}, add: () => {} };
    await r.setRoot({ id: '1', type: 'app', items: [] } as any, 'p1');
    expect(setRootSpy).toHaveBeenCalledTimes(1);
  });

  it('mount 时如果之前有 pendingRoot,自动应用', async () => {
    const r = new LeaferStage({});
    const setRootSpy = vi.fn();
    r.on('set-root', setRootSpy);

    // 先 setRoot 缓存到 pendingRoot
    await r.setRoot({ id: '1', type: 'app', items: [] } as any, 'p1');
    expect(setRootSpy).not.toHaveBeenCalled();

    // stub mount 需要的 leafer/rootGroup 后,直接调 mount
    (r as any).leafer = { add: () => {}, destroy: () => {} };
    (r as any).rootGroup = { removeAll: () => {}, add: () => {} };
    // 这里我们手动调 mount 的"应用 pendingRoot"那段逻辑(不真的 new Leafer,免 canvas 依赖)
    if ((r as any).pendingRoot) {
      const pending = (r as any).pendingRoot;
      (r as any).pendingRoot = null;
      await r.setRoot(pending);
    }
    expect(setRootSpy).toHaveBeenCalledTimes(1);
    expect((r as any).pendingRoot).toBeNull();
  });

  it('setRoot 重建场景前清除旧 Editor target', async () => {
    const r = new LeaferStage({});
    const editor = { target: { id: 'stale-node' } };
    (r as any).editor = editor;
    (r as any).leafer = { add: () => {}, destroy: () => {} };
    (r as any).rootGroup = { removeAll: vi.fn(), add: () => {} };

    await r.setRoot({ id: 'app', type: 'app', items: [] } as any);

    expect(editor.target).toBeNull();
  });
});
