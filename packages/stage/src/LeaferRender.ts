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

import { EventEmitter } from 'events'

import type { IUI } from 'leafer-ui'

import type { Id, MApp, MNode } from '@tmagic/core'

import { DEFAULT_ZOOM } from './const'
import LeaferShapeRegistry from './LeaferShapeRegistry'
import type { Point, RemoveData, Render, RenderEvents, UpdateData } from './types'

/**
 * editor 端 canvas 渲染器:leafer-ui 实现。
 *
 * 与 StageRender 平行:
 * - StageRender:iframe + Vue/React runtime,DOM 操作驱动
 * - LeaferRender:leafer-ui canvas,直接 mutate leafer scene
 *
 * **P0 简化**:本类只实现 mount / setRoot / add / update / remove / select / setZoom / destroy。
 * moveable / snap / 辅助线 / 框选 等高级交互(M4 阶段)走 leafer 自带 editor 插件,不通过本类。
 *
 * **注意**:leafer-ui 的核心模块在 import 时不会加载 canvas(浏览器 API),
 * 只在 `new Leafer({ view: el })` 时才需要 canvas。所以顶部只 import 类型,
 * 类实例化在方法里做 lazy import,避免 vitest happy-dom 环境跑测试时 canvas 报错。
 */
export default class LeaferRender extends EventEmitter implements Render {
  public readonly kind = 'leafer' as const;

  private leafer: import('leafer-ui').Leafer | null = null;

  /** MNode.id → leafer UI 节点的映射,用于反查 */
  private nodeMap: Map<Id, unknown> = new Map();

  /** MPage.id → page frame (leafer Rect),用于多 page 同时渲染 */
  private pageFrames: Map<Id, unknown> = new Map();

  /** root group,所有 page frame 加到这里 */
  private rootGroup: import('leafer-ui').Group | null = null;

  private zoom = DEFAULT_ZOOM;

  /** 业务方提供的 shape registry(public,允许 editor service 在 mount 后追加注册) */
  public shapeRegistry: LeaferShapeRegistry;

  constructor(config: { zoom?: number; shapeRegistry?: LeaferShapeRegistry }) {
    super();
    this.zoom = config.zoom ?? DEFAULT_ZOOM;
    // 永远要有一个真正的 LeaferShapeRegistry 实例,业务方 useStage 之后会调
    // `stage.leaferRender.shapeRegistry.registerAll(...)` 注册 shape。
    // 之前 fallback `{} as LeaferShapeRegistry` 是 TS-only 骗 typecheck,运行时是空对象,
    // 调到 registerAll 直接报 "is not a function"。
    this.shapeRegistry = config.shapeRegistry ?? new LeaferShapeRegistry();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  public async mount(el: HTMLDivElement): Promise<void> {
    // Lazy import:避免类加载时触发 leafer-ui canvas 依赖
    const { Leafer, Group } = await import('leafer-ui');
    this.leafer = new Leafer({
      view: el,
      fill: '#f5f5f5',
    });
    this.rootGroup = new Group();
    this.leafer.add(this.rootGroup);
  }

  public destroy(): void {
    this.leafer?.destroy();
    this.leafer = null;
    this.rootGroup = null;
    this.nodeMap.clear();
    this.pageFrames.clear();
    this.removeAllListeners();
  }

  // -------------------------------------------------------------------------
  // 状态变更
  // -------------------------------------------------------------------------

  /**
   * 全量 / 增量重画。P0 阶段简化:每次 setRoot 都清空场景树,按 DSL 重建。
   * P1 阶段再做增量 diff(保留 zoom/pan 状态)。
   */
  public async setRoot(root: MApp, _pageId?: Id): Promise<void> {
    if (!this.leafer || !this.rootGroup) return;

    // 1. 清空旧 scene(保留 rootGroup)
    this.rootGroup.removeAll();
    this.nodeMap.clear();
    this.pageFrames.clear();

    // 2. 遍历 pages,每个 MPage 一个 Rect frame
    for (const page of root.items ?? []) {
      if (page.type !== 'page' && page.type !== 'page-fragment') continue;
      const pageFrame = new (await import('leafer-ui')).Rect({
        x: page.style?.left ? Number(page.style.left) || 0 : 0,
        y: page.style?.top ? Number(page.style.top) || 0 : 0,
        width: page.style?.width ? Number(page.style.width) || 375 : 375,
        height: page.style?.height ? Number(page.style.height) || 667 : 667,
        fill: (page.style?.backgroundColor as string) || '#fff',
        // 不接收 hit(让子节点接收,允许选区穿透)
        hitSelf: false,
      });
      (pageFrame as { id?: string }).id = `page-${page.id}`;
      this.pageFrames.set(page.id, pageFrame);
      this.rootGroup.add(pageFrame);

      // 递归渲染 page items
      await this.renderChildren(pageFrame, page.items ?? []);
    }

    this.emit('set-root', root);
  }

  public setZoom(zoom: number = DEFAULT_ZOOM): void {
    this.zoom = zoom;
    // 用 scaleOfWorld 而不是 zoom(),避免 console.error 噪音
    // P0 阶段先简单实现,后续可加 pan 中心
    if (this.leafer && typeof (this.leafer as { scaleOfWorld?: (origin: unknown, scale: number) => void }).scaleOfWorld === 'function') {
      (this.leafer as { scaleOfWorld: (origin: unknown, scale: number) => void }).scaleOfWorld({ x: 0, y: 0 }, zoom);
    }
  }

  public async add(data: UpdateData): Promise<void> {
    if (data.parentId === undefined) return;
    const parent = this.findParentContainer(data.parentId);
    if (!parent) return;

    const shape = this.shapeRegistry.get?.(data.config.type ?? '');
    if (!shape) return;

    const result = shape(data.config as any, {
      resolve: (type: string) => this.shapeRegistry.get?.(type),
      renderChildren: (children: MNode[]) => [],
    });

    if (result && typeof result === 'object' && 'node' in result) {
      (parent as { add: (n: unknown) => void }).add((result as { node: unknown }).node);
      this.nodeMap.set(data.config.id, (result as { node: unknown }).node);
    } else if (result) {
      (parent as { add: (n: unknown) => void }).add(result);
      this.nodeMap.set(data.config.id, result);
    }
  }

  public async update(data: UpdateData): Promise<void> {
    const node = this.nodeMap.get(data.config.id);
    if (!node) {
      // 节点不存在,fallback 到 add
      return this.add(data);
    }

    // 重新跑 shape,生成新节点,替换旧的
    const shape = this.shapeRegistry.get?.(data.config.type ?? '');
    if (!shape) return;

    const result = shape(data.config as any, {
      resolve: (type: string) => this.shapeRegistry.get?.(type),
      renderChildren: (children: MNode[]) => [],
    });

    if (result && typeof result === 'object' && 'node' in result) {
      const parent = (node as { parent?: { add: (n: unknown) => void; remove: (n: unknown) => void } }).parent;
      if (parent) {
        parent.add((result as { node: unknown }).node);
        parent.remove(node);
        this.nodeMap.set(data.config.id, (result as { node: unknown }).node);
      }
    }
  }

  public async remove(data: RemoveData): Promise<void> {
    const node = this.nodeMap.get(data.id);
    if (!node) return;

    const parent = (node as { parent?: { remove: (n: unknown) => void } }).parent;
    parent?.remove(node);
    this.nodeMap.delete(data.id);
  }

  public async select(ids: Id[]): Promise<void> {
    // leafer 自带 selection 事件,这里只 emit 通知外部
    this.emit('select', ids);
  }

  // -------------------------------------------------------------------------
  // DOM 风格 API(leafer 路径下 stub)
  // -------------------------------------------------------------------------

  public getTargetElement(_id: Id): HTMLElement | null {
    // leafer 路径下不通过 DOM 查找节点
    return null;
  }

  public getDocument(): Document | undefined {
    return undefined;
  }

  public getElementsFromPoint(_point: Point): HTMLElement[] {
    return [];
  }

  // -------------------------------------------------------------------------
  // 内部工具
  // -------------------------------------------------------------------------

  /**
   * 递归渲染子节点到 page frame。P0 阶段:不真正递归容器,只在 rootGroup 渲染顶层。
   * P1 阶段:实现完整的 MContainer 树递归。
   */
  private async renderChildren(parent: unknown, children: MNode[]): Promise<void> {
    for (const child of children) {
      const shape = this.shapeRegistry.get?.(child.type ?? '');
      if (!shape) continue;

      const result = shape(child as any, {
        resolve: (type: string) => this.shapeRegistry.get?.(type),
        renderChildren: () => [],
      });

      if (result && typeof result === 'object' && 'node' in result) {
        const node = (result as { node: unknown }).node;
        (parent as { add: (n: unknown) => void }).add(node);
        this.nodeMap.set(child.id, node);
      } else if (result) {
        (parent as { add: (n: unknown) => void }).add(result);
        this.nodeMap.set(child.id, result);
      }
    }
  }

  /** 找节点的父容器(简化:返回 page frame) */
  private findParentContainer(parentId: Id): unknown {
    return this.pageFrames.get(parentId) ?? null;
  }
}

// EventEmitter typing for RenderEvents
export type { RenderEvents };
