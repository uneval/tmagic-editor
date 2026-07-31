/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest';

import DropTargetResolver from '../../../src/drag/DropTargetResolver';

describe('DropTargetResolver', () => {
  it('页面空白区域先命中全屏蒙层时回退到固定页面边界', () => {
    const page = { id: 'page-1', tag: 'Group', parent: null };
    const overlay = { id: 'overlay-1', tag: 'Frame', parent: page };
    const resolver = new DropTargetResolver({
      rootGroup: () => ({ pick: vi.fn(() => ({ path: { list: [overlay, page] } })) }),
      pageFrames: () => new Map([['page-1', page]]),
      pageBounds: () => new Map([['page-1', { x: 100, y: 20, width: 320, height: 568 }]]),
      containerIds: () => new Set(['overlay-1']),
    });

    expect(resolver.resolve({ x: 10, y: 10 }, ['button-1'])).toEqual({
      id: 'page-1',
      kind: 'page',
      node: page,
      bounds: { x: 100, y: 20, width: 320, height: 568 },
    });
  });

  it('命中容器内部节点时返回最近容器,不返回被拖动节点的祖先', () => {
    const page = { id: 'page-1', tag: 'Group', parent: null };
    const container = {
      id: 'container-1',
      tag: 'Group',
      parent: page,
      getBounds: vi.fn(() => ({ x: 10, y: 20, width: 200, height: 100 })),
    };
    const child = { id: 'child-1', tag: 'Rect', parent: container };
    const resolver = new DropTargetResolver({
      rootGroup: () => ({ pick: vi.fn(() => ({ path: { list: [child, container, page] } })) }),
      pageFrames: () => new Map([['page-1', page]]),
      pageBounds: () => new Map([['page-1', { x: 0, y: 0, width: 320, height: 568 }]]),
      containerIds: () => new Set(['container-1']),
    });

    expect(resolver.resolve({ x: 10, y: 10 }, ['button-1'])?.id).toBe('container-1');
    expect(resolver.resolve({ x: 10, y: 10 }, ['container-1'])).toEqual({
      id: 'page-1',
      kind: 'page',
      node: page,
      bounds: { x: 0, y: 0, width: 320, height: 568 },
    });
  });

  it('拖动页面本身时不产生页面放置目标', () => {
    const page = { id: 'page-1', tag: 'Frame', parent: null };
    const resolver = new DropTargetResolver({
      rootGroup: () => ({ pick: vi.fn(() => ({ path: { list: [page] } })) }),
      pageFrames: () => new Map([['page-1', page]]),
      pageBounds: () => new Map([['page-1', { x: 0, y: 0, width: 320, height: 568 }]]),
      containerIds: () => new Set(),
    });

    expect(resolver.resolve({ x: 10, y: 10 }, ['page-1'])).toBeNull();
  });

  it('拖出源页面后命中路径仍包含源组件时,不高亮源页面', () => {
    const page = { id: 'page-1', tag: 'Frame', parent: null };
    const movingNode = { id: 'button-1', tag: 'Rect', parent: page };
    const resolver = new DropTargetResolver({
      rootGroup: () => ({ pick: vi.fn(() => ({ path: { list: [movingNode, page] } })) }),
      pageFrames: () => new Map([['page-1', page]]),
      pageBounds: () => new Map([['page-1', { x: 0, y: 0, width: 320, height: 568 }]]),
      containerIds: () => new Set(),
      nodeMap: () => new Map([['button-1', movingNode]]),
    });

    expect(resolver.resolve({ x: 900, y: 900 }, ['button-1'])).toBeNull();
  });

  it('从 page-2 拖到 page-1 时,目标页面不受源页面祖先判断影响', () => {
    const page1 = { id: 'page-1', tag: 'Frame', parent: null };
    const page2 = { id: 'page-2', tag: 'Frame', parent: null };
    const movingNode = { id: 'button-2', tag: 'Rect', parent: page2 };
    const resolver = new DropTargetResolver({
      rootGroup: () => ({ pick: vi.fn(() => ({ path: { list: [movingNode, page1] } })) }),
      pageFrames: () =>
        new Map([
          ['page-1', page1],
          ['page-2', page2],
        ]),
      pageBounds: () =>
        new Map([
          ['page-1', { x: 0, y: 0, width: 320, height: 568 }],
          ['page-2', { x: 400, y: 0, width: 320, height: 568 }],
        ]),
      containerIds: () => new Set(),
      nodeMap: () => new Map([['button-2', movingNode]]),
    });

    expect(resolver.resolve({ x: 100, y: 100 }, ['button-2'])?.id).toBe('page-1');
  });

  it('目标页不在 pick path 中时,通过固定页面边界识别空白页', () => {
    const page1 = { id: 'page-1', tag: 'Frame', parent: null };
    const page2 = { id: 'page-2', tag: 'Frame', parent: null };
    const movingNode = { id: 'button-2', tag: 'Rect', parent: page2 };
    const resolver = new DropTargetResolver({
      rootGroup: () => ({ pick: vi.fn(() => ({ path: { list: [movingNode] } })) }),
      pageFrames: () =>
        new Map([
          ['page-1', page1],
          ['page-2', page2],
        ]),
      pageBounds: () =>
        new Map([
          ['page-1', { x: 0, y: 0, width: 320, height: 568 }],
          ['page-2', { x: 400, y: 0, width: 320, height: 568 }],
        ]),
      containerIds: () => new Set(),
      nodeMap: () => new Map([['button-2', movingNode]]),
    });

    expect(resolver.resolve({ x: 100, y: 100 }, ['button-2'])?.id).toBe('page-1');
  });

  it('拖出后回到原页面时返回 same-parent,拖到页面外时返回 null', () => {
    const page = { id: 'page-1', tag: 'Frame', parent: null };
    const movingNode = { id: 'button-1', tag: 'Rect', parent: page };
    const resolver = new DropTargetResolver({
      rootGroup: () => ({ pick: vi.fn(() => ({ path: { list: [movingNode, page] } })) }),
      pageFrames: () => new Map([['page-1', page]]),
      pageBounds: () => new Map([['page-1', { x: 0, y: 0, width: 320, height: 568 }]]),
      containerIds: () => new Set(),
      nodeMap: () => new Map([['button-1', movingNode]]),
    });

    expect(resolver.resolve({ x: 100, y: 100 }, ['button-1'])?.kind).toBe('same-parent');
    expect(resolver.resolve({ x: 900, y: 900 }, ['button-1'])).toBeNull();
  });
});
