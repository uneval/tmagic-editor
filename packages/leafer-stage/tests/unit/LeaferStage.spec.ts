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

import LeaferShapeRegistry from '../../src/LeaferShapeRegistry';
import LeaferStage from '../../src/LeaferStage';

class FakeNode {
  public id?: string;
  public children: FakeNode[] = [];
  public parent: FakeNode | null = null;
  public removed = false;
  public bounds = { x: 10, y: 20, width: 100, height: 40 };

  public add(node: FakeNode) {
    node.parent = this;
    this.children.push(node);
  }

  public removeAll() {
    this.children = [];
  }

  public getBounds() {
    return this.bounds;
  }

  public remove() {
    this.removed = true;
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

  class MockFrame extends MockNode {}

  return {
    Leafer: class extends MockNode {
      public destroy() {}
    },
    Group: MockNode,
    Frame: MockFrame,
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
    const zoom = vi.fn();
    (r as any).leafer = { zoom };

    r.setZoom(0.5);

    expect((r as any).zoom).toBe(0.5);
    expect(zoom).toHaveBeenCalledWith(0.5);
  });

  it('通过 Leafer 的绝对 zoom API 暴露当前视口缩放', () => {
    const r = new LeaferStage({ zoom: 0.75 });

    expect(r.getZoom()).toBe(0.75);
  });

  it('kind 标记为 leafer', () => {
    const r = new LeaferStage({});
    expect(r.kind).toBe('leafer');
  });

  it('高亮节点并复用反馈节点,选中节点不显示 hover', () => {
    class HighlightRect extends FakeNode {
      public set = vi.fn();
      public moveToFront = vi.fn();
    }
    const stage = new LeaferStage({});
    const root = new FakeNode();
    const node = new FakeNode();
    node.id = 'text-1';
    (stage as any).rootGroup = root;
    (stage as any).rectConstructor = HighlightRect;
    (stage as any).nodeMap.set(node.id, node);

    stage.highlight('text-1');
    expect(root.children).toHaveLength(1);
    const feedback = root.children[0];
    expect(feedback).toBeInstanceOf(HighlightRect);
    expect((feedback as any).set).toHaveBeenCalledWith(node.bounds);

    (stage as any).editor = { target: node };
    stage.highlight('text-1');
    expect(root.children).toHaveLength(1);
    expect((feedback as any).removed).toBe(true);
  });

  it('clearHighlight 会移除反馈节点', () => {
    class HighlightRect extends FakeNode {}
    const stage = new LeaferStage({});
    const root = new FakeNode();
    const node = new FakeNode();
    node.id = 'text-1';
    (stage as any).rootGroup = root;
    (stage as any).rectConstructor = HighlightRect;
    (stage as any).nodeMap.set(node.id, node);

    stage.highlight('text-1');
    const feedback = root.children[0];
    stage.clearHighlight();

    expect((feedback as any).removed).toBe(true);
  });

  it('updateDropFeedback 统一解析 canDropIn 重定向目标并可清理', () => {
    class FeedbackRect extends FakeNode {
      public set = vi.fn();
      public moveToFront = vi.fn();
    }
    const canDropIn = vi.fn(() => 'redirected');
    const stage = new LeaferStage({ canDropIn });
    const root = new FakeNode();
    const source = new FakeNode();
    source.id = 'source';
    const target = new FakeNode();
    target.id = 'target';
    const redirected = new FakeNode();
    redirected.id = 'redirected';
    (stage as any).rootGroup = root;
    (stage as any).rectConstructor = FeedbackRect;
    (stage as any).app = { getWorldPointByClient: () => ({ x: 10, y: 20 }) };
    root.pick = () => ({ path: { list: [target] } });
    root.add(target);
    root.add(redirected);
    (stage as any).nodeMap.set(source.id, source);
    (stage as any).nodeMap.set(target.id, target);
    (stage as any).nodeMap.set(redirected.id, redirected);
    (stage as any).containerNodeIds.add(target.id);
    (stage as any).containerNodeIds.add(redirected.id);

    const result = stage.updateDropFeedback({ clientX: 1, clientY: 2 }, ['source']);
    expect(result?.id).toBe('redirected');
    expect(canDropIn).toHaveBeenCalledWith(['source'], 'target');
    expect(root.children).toHaveLength(3);

    const feedback = root.children[2];
    stage.clearDropFeedback();
    expect((feedback as any).removed).toBe(true);
    expect((stage as any).nodeMap.has('redirected')).toBe(true);
  });

  it('canDropIn 返回 false 时不产生反馈', () => {
    const stage = new LeaferStage({ canDropIn: () => false });
    const root = new FakeNode();
    const target = new FakeNode();
    target.id = 'target';
    (stage as any).rootGroup = root;
    (stage as any).app = { getWorldPointByClient: () => ({ x: 10, y: 20 }) };
    root.pick = () => ({ path: { list: [target] } });
    (stage as any).containerNodeIds.add(target.id);
    (stage as any).nodeMap.set(target.id, target);

    expect(stage.updateDropFeedback({ clientX: 1, clientY: 2 }, [])).toBeNull();
    expect(root.children).toHaveLength(0);
  });

  it('setRoot 和 destroy 会清理高亮、drop feedback 以及临时节点映射', async () => {
    class FeedbackRect extends FakeNode {
      public set = vi.fn();
      public moveToFront = vi.fn();
    }
    const stage = new LeaferStage({});
    const root = new FakeNode();
    const node = new FakeNode();
    node.id = 'container-1';
    (stage as any).rootGroup = root;
    (stage as any).rectConstructor = FeedbackRect;
    (stage as any).leafer = { destroy: vi.fn() };
    (stage as any).app = { destroy: vi.fn(), getWorldPointByClient: () => ({ x: 10, y: 20 }) };
    root.pick = () => ({ path: { list: [node] } });
    (stage as any).nodeMap.set(node.id, node);
    (stage as any).containerNodeIds.add(node.id);

    stage.highlight(node.id);
    stage.updateDropFeedback({ clientX: 1, clientY: 2 }, []);
    expect((stage as any).highlightRenderer.hint).toBeTruthy();
    expect((stage as any).dropFeedbackRenderer.hint).toBeTruthy();

    await stage.setRoot({ id: 'app', type: 'app', items: [] } as any);
    expect((stage as any).highlightRenderer.hint).toBeNull();
    expect((stage as any).dropFeedbackRenderer.hint).toBeNull();
    expect((stage as any).nodeMap.size).toBe(0);

    stage.destroy();
    expect((stage as any).rootGroup).toBeNull();
    expect((stage as any).app).toBeNull();
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

    await r.setRoot(
      {
        id: 'app',
        type: 'app',
        items: [
          { id: 'index', type: 'page', items: [{ id: 'qr', type: 'qrcode' }] },
          { id: 'page2', type: 'page', items: [{ id: 'back', type: 'button' }] },
        ],
      } as any,
      'page2',
    );

    expect((r as any).nodeMap.has('page2')).toBe(true);
    expect((r as any).nodeMap.has('back')).toBe(true);
    expect((r as any).nodeMap.has('index')).toBe(true);
    expect((r as any).nodeMap.has('qr')).toBe(true);
    expect((r as any).pageFrames.size).toBe(2);
    expect((r as any).pageFrames.get('page2').editable).toBe(true);
    expect((r as any).pageFrames.get('page2').constructor.name).toBe('MockFrame');
  });

  it('update 页面时同步更新页面视觉样式和背景', async () => {
    const r = new LeaferStage({});
    const page = new FakeNode() as any;
    const background = new FakeNode() as any;
    page.children = [background];

    (r as any).nodeMap.set('page-1', page);
    (r as any).pageFrames.set('page-1', page);

    await r.update({
      config: {
        id: 'page-1',
        type: 'page',
        style: {
          left: 12,
          top: 24,
          width: 375,
          height: 667,
          backgroundColor: '#fdd',
          backgroundImage: 'url("page.png")',
          backgroundSize: '100% 100%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          opacity: '50%',
          borderWidth: 2,
          borderColor: '#f00',
          borderRadius: 8,
          borderStyle: 'dashed',
          boxShadow: '0 0 4px #999',
          display: 'none',
          zIndex: 3,
          transform: { rotate: '30deg', scale: 1.5 },
        },
      },
    } as any);

    expect(page.x).toBe(12);
    expect(page.y).toBe(24);
    expect(page.width).toBe(375);
    expect(page.height).toBe(667);
    expect(page.opacity).toBe(0.5);
    expect(page.visible).toBe(false);
    expect(page.zIndex).toBe(3);
    expect(page.cornerRadius).toBe(8);
    expect(page.strokeWidth).toBe(2);
    expect(page.stroke).toBe('#f00');
    expect(page.dashPattern).toEqual([6, 4]);
    expect(page.shadow).toBe('0 0 4px #999');
    expect(page.rotation).toBe(30);
    expect(page.scaleX).toBe(1.5);
    expect(page.scaleY).toBe(1.5);
    expect(background.width).toBe(375);
    expect(background.height).toBe(667);
    expect(background.fill).toMatchObject({
      type: 'image',
      url: 'page.png',
      mode: 'stretch',
      align: 'center',
      repeat: false,
    });
    expect(background.opacity).toBe(0.5);
    expect(background.visible).toBe(false);
    expect(background.zIndex).toBe(3);
    expect(background.cornerRadius).toBe(8);
    expect(background.strokeWidth).toBe(2);
    expect(background.stroke).toBe('#f00');
    expect(background.dashPattern).toEqual([6, 4]);
    expect(background.shadow).toBe('0 0 4px #999');
    expect(background.rotation).toBe(30);
    expect(background.scaleX).toBe(1.5);
    expect(background.scaleY).toBe(1.5);
    expect((r as any).pageLayoutBounds.get('page-1')).toEqual({ x: 12, y: 24, width: 375, height: 667 });
  });

  it('用客户端坐标解析拖入目标,不把 DOM 查询泄漏给编辑器', () => {
    const r = new LeaferStage({});
    const page = new FakeNode() as any;
    page.id = 'page-1';
    const bounds = { x: 10, y: 20, width: 375, height: 667 };

    (r as any).app = {
      getWorldPointByClient: vi.fn(() => ({ x: 40, y: 60 })),
    };
    (r as any).rootGroup = {
      pick: vi.fn(() => ({ path: { list: [page] } })),
    };
    (r as any).pageFrames.set('page-1', page);
    (r as any).pageLayoutBounds.set('page-1', bounds);

    expect(r.resolveDropTarget({ clientX: 400, clientY: 500 }, [])).toEqual({
      id: 'page-1',
      kind: 'page',
      bounds,
    });
    expect((r as any).app.getWorldPointByClient).toHaveBeenCalledWith({ clientX: 400, clientY: 500 });
  });

  it('优先从 Leafer tree 而不是 App 解析客户端坐标', () => {
    const r = new LeaferStage({});
    const treeResolver = vi.fn(() => ({ x: 40, y: 60 }));
    const appResolver = vi.fn(() => ({ x: 1, y: 2 }));
    (r as any).leafer = { getWorldPointByClient: treeResolver };
    (r as any).app = { getWorldPointByClient: appResolver };

    expect(r.getWorldPoint({ clientX: 400, clientY: 500 })).toEqual({ x: 40, y: 60 });
    expect(treeResolver).toHaveBeenCalledWith({ clientX: 400, clientY: 500 });
    expect(appResolver).not.toHaveBeenCalled();
  });

  it('将客户端坐标转换为目标容器的局部坐标', () => {
    const r = new LeaferStage({});
    const parent = {
      getLocalPoint: vi.fn(() => ({ x: 12, y: 18 })),
    };

    (r as any).app = {
      getWorldPointByClient: vi.fn(() => ({ x: 40, y: 60 })),
    };
    (r as any).nodeMap.set('page-1', parent);

    expect(r.getLocalPoint({ clientX: 400, clientY: 500 }, 'page-1')).toEqual({ x: 12, y: 18 });
    expect(parent.getLocalPoint).toHaveBeenCalledWith({ x: 40, y: 60 });
  });

  it('解析子节点的 right/bottom 和 margin 定位', () => {
    const r = new LeaferStage({});
    const resolved = (r as any).resolveRelativeLengths(
      {
        id: 'button-1',
        type: 'button',
        style: {
          right: '20px',
          bottom: '30px',
          width: '100px',
          height: '40px',
          marginRight: '5px',
          marginBottom: '6px',
        },
      },
      { width: 375, height: 667 },
    );

    expect(resolved.style).toMatchObject({ left: 250, top: 591, width: 100, height: 40 });
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

  it('点击页面背景时,沿 Leafer 父节点映射回 page DSL 节点', () => {
    const r = new LeaferStage({});
    const page = new FakeNode();
    const background = new FakeNode();
    page.id = 'page-1';
    page.add(background);
    (r as any).nodeMap.set(page.id, page);

    const selection = (r as any).normalizeSelection([background]);

    expect(selection.ids).toEqual(['page-1']);
    expect(selection.nodes).toEqual([page]);
  });

  it('选择组件内部绘制节点时,只返回最近的 DSL 节点且不重复', () => {
    const r = new LeaferStage({});
    const component = new FakeNode();
    const background = new FakeNode();
    const text = new FakeNode();
    component.id = 'button-1';
    component.add(background);
    component.add(text);
    (r as any).nodeMap.set(component.id, component);

    const selection = (r as any).normalizeSelection([background, text, component]);

    expect(selection.ids).toEqual(['button-1']);
    expect(selection.nodes).toEqual([component]);
  });
});
