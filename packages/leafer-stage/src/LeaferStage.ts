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

/* eslint-disable @typescript-eslint/member-ordering */

import { EventEmitter } from 'events';

import type { Id, MApp, MNode } from '@tmagic/core';

import DragSessionController from './drag/DragSessionController';
import DropFeedbackRenderer from './drag/DropFeedbackRenderer';
import DropTargetResolver from './drag/DropTargetResolver';
import type { DragCommit } from './drag/types';
import { DEFAULT_ZOOM } from './const';
import LeaferShapeRegistry from './LeaferShapeRegistry';
import type { Point, RemoveData, UpdateData } from './types';

const DEFAULT_PAGE_WIDTH = 375;
const DEFAULT_PAGE_HEIGHT = 667;
const PAGE_GAP = 80;
const PAGE_PADDING = 40;

interface SnapController {
  enable(enabled: boolean): void;
  updateConfig(config: { parentContainer?: unknown }): void;
}

const parseCssLength = (value: unknown, relativeTo?: number): number | undefined => {
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    const percent = Number.parseFloat(value);
    if (Number.isFinite(percent) && relativeTo !== undefined) return (percent / 100) * relativeTo;
    return undefined;
  }
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/(px|pt|rpx)$/i, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
};

const parseCssAngle = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(?:deg)?$/i);
  return match ? Number(match[1]) : undefined;
};

const pageVisualProps = (style: Record<string, any> | undefined): Record<string, unknown> => {
  if (!style) return {};
  const props: Record<string, unknown> = {};
  const opacity =
    typeof style.opacity === 'string' && style.opacity.endsWith('%')
      ? Number.parseFloat(style.opacity) / 100
      : Number(style.opacity);
  if (Number.isFinite(opacity)) props.opacity = Math.max(0, Math.min(1, opacity));
  const borderWidth = parseCssLength(style.borderWidth);
  if (borderWidth !== undefined && borderWidth > 0) {
    props.strokeWidth = borderWidth;
    props.stroke = style.borderColor || '#000';
  } else if (style.borderColor) {
    props.stroke = style.borderColor;
  }
  if (style.boxShadow && style.boxShadow !== 'none') props.shadow = style.boxShadow;
  if (style.display === 'none') props.visible = false;
  const zIndex = parseCssLength(style.zIndex);
  if (zIndex !== undefined) props.zIndex = zIndex;
  const cornerRadius = parseCssLength(style.borderRadius);
  if (cornerRadius !== undefined) props.cornerRadius = cornerRadius;
  if (style.borderStyle === 'dashed') props.dashPattern = [6, 4];
  if (style.borderStyle === 'dotted') props.dashPattern = [1, 3];

  const { transform } = style;
  const transformProps: Record<string, number> = {};
  if (transform && typeof transform === 'object') {
    const rotate = parseCssAngle(transform.rotate);
    const scale = parseCssLength(transform.scale);
    if (rotate !== undefined) transformProps.rotation = rotate;
    if (scale !== undefined) {
      transformProps.scaleX = scale;
      transformProps.scaleY = scale;
    }
  }
  Object.assign(props, transformProps);
  return props;
};

const pageBackgroundFill = (style: Record<string, any> | undefined): unknown => {
  const image = typeof style?.backgroundImage === 'string' ? style.backgroundImage.trim() : '';
  if (!image || image === 'none') return style?.backgroundColor || '#fff';
  if (/^(linear|radial|conic)-gradient/i.test(image)) return image;

  const urlMatch = image.match(/^url\(\s*["']?(.*?)["']?\s*\)$/i);
  const position = typeof style?.backgroundPosition === 'string' ? style.backgroundPosition.trim().toLowerCase() : '';
  const positionTokens = position.split(/\s+/).filter(Boolean);
  const horizontal = positionTokens.find((token: string) => ['left', 'center', 'right'].includes(token));
  const vertical = positionTokens.find((token: string) => ['top', 'center', 'bottom'].includes(token));
  let align = positionTokens.length === 1 ? positionTokens[0] : '';
  if (horizontal === 'center' && vertical === 'center') align = 'center';
  else if (horizontal === 'left' && vertical === 'top') align = 'top-left';
  else if (horizontal === 'right' && vertical === 'top') align = 'top-right';
  else if (horizontal === 'right' && vertical === 'bottom') align = 'bottom-right';
  else if (horizontal === 'left' && vertical === 'bottom') align = 'bottom-left';
  else if (!align) align = vertical || horizontal || 'top-left';

  const paint: Record<string, unknown> = {
    type: 'image',
    url: urlMatch?.[1] ?? image,
    align,
  };
  const size = typeof style?.backgroundSize === 'string' ? style.backgroundSize.trim().toLowerCase() : '';
  if (size === 'cover') paint.mode = 'cover';
  else if (size === 'contain') paint.mode = 'fit';
  else if (size === '100% 100%') paint.mode = 'stretch';

  const repeat = typeof style?.backgroundRepeat === 'string' ? style.backgroundRepeat.trim().toLowerCase() : '';
  if (repeat === 'no-repeat') paint.repeat = false;
  else if (repeat === 'repeat-x') paint.repeat = 'x';
  else if (repeat === 'repeat-y') paint.repeat = 'y';
  else if (repeat === 'repeat') paint.repeat = true;
  return paint;
};

const applyPageVisualProps = (node: any, style: Record<string, any> | undefined) => {
  if (!node) return;

  const props = pageVisualProps(style);
  node.opacity = props.opacity ?? 1;
  node.visible = props.visible ?? true;
  node.zIndex = props.zIndex ?? 0;
  node.cornerRadius = props.cornerRadius ?? 0;
  node.strokeWidth = props.strokeWidth ?? 0;
  node.stroke = props.stroke ?? null;
  node.dashPattern = props.dashPattern ?? null;
  node.shadow = props.shadow ?? null;
  node.rotation = props.rotation ?? 0;
  node.scaleX = props.scaleX ?? 1;
  node.scaleY = props.scaleY ?? 1;
};

/**
 * Leafer editor stage:独立于 iframe/runtime stage 的 canvas 编辑器运行时。
 *
 * **P0 简化**:本类只实现 mount / setRoot / add / update / remove / select / setZoom / destroy。
 * moveable / snap / 辅助线 / 框选 等高级交互(M4 阶段)走 leafer 自带 editor 插件,不通过本类。
 *
 * **注意**:leafer-ui 的核心模块在 import 时不会加载 canvas(浏览器 API),
 * 只在 `new Leafer({ view: el })` 时才需要 canvas。所以顶部只 import 类型,
 * 类实例化在方法里做 lazy import,避免 vitest happy-dom 环境跑测试时 canvas 报错。
 */
export default class LeaferStage extends EventEmitter {
  public readonly kind = 'leafer' as const;
  public container?: HTMLDivElement;
  // LeaferStage 不创建 iframe DOM、StageMask 或 ActionManager；这些空接口
  // 让 editor 的通用服务可以安全地持有两种 stage。
  public renderer = null;
  public mask: any = null;
  public actionManager: any = null;

  private app: any = null;
  private leafer: import('leafer-ui').Leafer | null = null;
  private editor: any = null;
  private snap: SnapController | null = null;
  private rectConstructor: any = null;
  private manualPageIds = new Set<Id>();
  private containerNodeIds = new Set<Id>();
  /** MNode.id → leafer UI 节点的映射,用于反查 */
  private nodeMap: Map<Id, unknown> = new Map();

  /** MPage.id → page frame,用于多 page 同时渲染和定位 */
  private pageFrames: Map<Id, unknown> = new Map();

  /** 页面自身的排版边界,不能从包含拖动子节点的 Group bounds 反推。 */
  private pageLayoutBounds: Map<Id, { x: number; y: number; width: number; height: number }> = new Map();

  /** root group,所有 page frame 加到这里 */
  private rootGroup: import('leafer-ui').Group | null = null;

  private zoom = DEFAULT_ZOOM;

  /** 业务方提供的 shape registry(public,允许 editor 在 mount 后追加注册) */
  public shapeRegistry: LeaferShapeRegistry;

  /**
   * mount 之前 setRoot 会被调到(initService.updateStageDsl 跟 StageCore.mount
   * 是两个独立触发源,dsl 推到 stage 时 canvas 可能还没建好)。
   * 这里把"待渲染的 root"先缓存,等 mount 完立即应用。
   */
  private pendingRoot: MApp | null = null;

  private readonly dropTargetResolver = new DropTargetResolver({
    rootGroup: () => this.rootGroup,
    pageFrames: () => this.pageFrames,
    pageBounds: () => this.pageLayoutBounds,
    containerIds: () => this.containerNodeIds,
    nodeMap: () => this.nodeMap,
  });
  private readonly dropFeedbackRenderer = new DropFeedbackRenderer({
    rootGroup: () => this.rootGroup,
    rectConstructor: () => this.rectConstructor,
  });
  private readonly dragSession = new DragSessionController({
    resolveTarget: (point, ids) => this.dropTargetResolver.resolve(point, ids),
    targetChanged: (target) => this.dropFeedbackRenderer.render(target),
    commit: (data) => this.commitDrag(data),
  });
  private readonly capturePointerPoint = (event: any) => {
    const point = event?.getInnerPoint?.(this.rootGroup) ?? event?.getInner?.(this.rootGroup);
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      this.dragSession.updatePointer(point);
    }
  };

  private readonly beginDrag = () => this.dragSession.begin();
  private readonly cancelDrag = () => this.dragSession.cancel();
  private readonly finishDrag = () => this.dragSession.finish();

  constructor(config: { zoom?: number; shapeRegistry?: LeaferShapeRegistry }) {
    super();
    this.zoom = config.zoom ?? DEFAULT_ZOOM;
    // 永远要有一个真正的 LeaferShapeRegistry 实例,业务方 useStage 之后会调
    // `stage.shapeRegistry.registerAll(...)` 注册 shape。
    // 之前 fallback `{} as LeaferShapeRegistry` 是 TS-only 骗 typecheck,运行时是空对象,
    // 调到 registerAll 直接报 "is not a function"。
    this.shapeRegistry = config.shapeRegistry ?? new LeaferShapeRegistry();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  public async mount(el: HTMLDivElement): Promise<void> {
    this.container = el;
    // Editor 插件必须运行在 App 的 tree / sky 分层结构中。
    // 这里仍然保持 lazy import,避免 vitest/node 环境加载浏览器插件。
    await import('@leafer-in/editor');
    await import('@leafer-in/resize');
    await import('@leafer-in/viewport');
    const { Snap: SnapConstructor } = await import('leafer-x-easy-snap');
    const { App: AppConstructor, Group: GroupConstructor, Rect: RectConstructor } = await import('leafer-ui');
    this.rectConstructor = RectConstructor;
    this.app = new AppConstructor({
      view: el,
      fill: '#f5f5f5',
      editor: {},
      // Keep the DOM element as a fixed viewport and let Leafer own the
      // infinite world (pan/zoom) inside it.
      tree: { type: 'design' },
    });
    this.leafer = this.app.tree;
    this.editor = this.app.editor;
    this.rootGroup = new GroupConstructor({ hitChildren: true });
    this.leafer!.add(this.rootGroup);
    // Leafer 没有官方内置的对齐辅助线。使用社区插件提供移动吸附和
    // 辅助线，且把它限制在当前节点的父容器内，避免页面 A 的子节点吸附到
    // 页面 B 的内部节点。页面本身则通过 rootGroup 与其它页面对齐。
    this.snap = new SnapConstructor(this.app, {
      attachEvents: ['move'],
      showLine: true,
      showLinePoints: false,
      showDistanceLabels: true,
      showEqualSpacingBoxes: false,
      snapSize: 5,
      lineColor: '#5b8ff9',
      parentContainer: this.rootGroup,
    });
    this.snap.enable(true);
    this.app.on('pointer.move', this.capturePointerPoint);
    this.app.on('pointer.up', this.capturePointerPoint);
    this.editor?.on('editor.select', (event: { editor?: { list?: any[] } }) => {
      const nodes = event.editor?.list ?? [];
      const selection = this.normalizeSelection(nodes);
      this.dragSession.setSelection(
        selection.nodes.map((node) => ({ id: node.id as Id, style: this.readNodeStyle(node) })),
      );
      const parentContainer = selection.nodes[0]?.parent ?? this.rootGroup;
      this.snap?.updateConfig({ parentContainer });
      this.emit('select', selection.ids);
    });
    for (const eventName of ['editor.move', 'editor.scale', 'editor.rotate', 'editor.skew']) {
      this.editor?.on(eventName, (event: { editor?: { list?: any[] }; target?: any }) => {
        const nodes = event.editor?.list ?? (event.target ? [event.target] : []);
        nodes.forEach((node) => {
          const mapped = this.resolveSelectionNode(node);
          if (mapped) this.dragSession.markChanged([mapped.id]);
        });
      });
    }
    el.addEventListener('pointerdown', this.beginDrag, true);
    el.addEventListener('pointercancel', this.cancelDrag, true);
    el.addEventListener('pointerup', this.finishDrag, true);
    el.addEventListener('mouseup', this.finishDrag, true);
    // 如果 mount 之前 initService 已经推过 DSL,这里补上
    if (this.pendingRoot) {
      const pending = this.pendingRoot;
      this.pendingRoot = null;
      await this.setRoot(pending);
    }
  }

  public destroy(): void {
    this.dragSession.dispose();
    this.dropFeedbackRenderer.clear();
    this.snap?.enable(false);
    this.snap = null;
    this.rectConstructor = null;
    this.app?.destroy();
    this.leafer?.destroy();
    this.app = null;
    this.editor = null;
    if (this.container) {
      this.container.removeEventListener('pointerdown', this.beginDrag, true);
      this.container.removeEventListener('pointercancel', this.cancelDrag, true);
      this.container.removeEventListener('pointerup', this.finishDrag, true);
      this.container.removeEventListener('mouseup', this.finishDrag, true);
    }
    this.leafer = null;
    this.rootGroup = null;
    this.container = undefined;
    this.pendingRoot = null;
    this.nodeMap.clear();
    this.pageFrames.clear();
    this.pageLayoutBounds.clear();
    this.containerNodeIds.clear();
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
    if (!this.leafer || !this.rootGroup) {
      // mount 之前被调到,缓存住等 mount 完画
      this.pendingRoot = root;
      return;
    }

    // 1. 清空旧 scene(保留 rootGroup)
    // 清树前先解除旧 Editor target。否则快速点击/重建期间,旧节点仍可能
    // 通过 editor.select 事件回流到 editorService,形成失效 ID。
    if (this.editor) this.editor.target = null;
    this.dragSession.cancel();
    this.rootGroup.removeAll();
    this.nodeMap.clear();
    this.pageFrames.clear();
    this.pageLayoutBounds.clear();
    this.containerNodeIds.clear();
    this.snap?.updateConfig({ parentContainer: this.rootGroup });

    // 2. 遍历 pages,每个 MPage 一个 Group(背景 Rect + 子节点)
    // 用 Group 而不是 Frame,因为 Frame 在 leafer 2.x 是裁剪容器,
    // 自己的 fill 经常不渲染;改用 Group 装一个背景 Rect(画 page 底色)再装 items。
    // 之前用 Rect,Rect 没有 .add() 装不下 items;
    // 之前用 Frame,Frame fill 不渲染,page 背景变白。
    const { Frame: FrameConstructor, Rect: RectConstructor } = await import('leafer-ui');
    const pageItems = (root.items ?? []).filter((item) => {
      if (item.type !== 'page' && item.type !== 'page-fragment') return false;
      return true;
    });
    // 所有页面都渲染到同一个世界,但页面位置由 stage 统一排版。
    // DSL 中 page 的 left/top 只描述页面自身样式,不能再拿来决定多页布局。
    // 取真正的滚动视口尺寸,不能取 stageContainer 自身:它在上一次布局后
    // 已经被扩展成整个多页世界。
    const viewport = this.container?.parentElement?.parentElement;
    const viewportWidth = viewport?.clientWidth || this.container?.clientWidth || DEFAULT_PAGE_WIDTH + PAGE_PADDING * 2;
    const viewportHeight =
      viewport?.clientHeight || this.container?.clientHeight || DEFAULT_PAGE_HEIGHT + PAGE_PADDING * 2;
    const pageLayouts = pageItems.map((page) => ({
      page,
      width: parseCssLength(page.style?.width, DEFAULT_PAGE_WIDTH) ?? DEFAULT_PAGE_WIDTH,
      height: parseCssLength(page.style?.height, DEFAULT_PAGE_HEIGHT) ?? DEFAULT_PAGE_HEIGHT,
    }));
    const first = pageLayouts[0];
    let cursorX = first ? Math.max(PAGE_PADDING, (viewportWidth - first.width) / 2) : PAGE_PADDING;
    for (const { page, width: w, height: h } of pageLayouts) {
      if (page.type !== 'page' && page.type !== 'page-fragment') continue;
      const pageStyle = page.style as Record<string, any> | undefined;
      const autoX = cursorX;
      const autoY = Math.max(PAGE_PADDING, (viewportHeight - h) / 2);
      const sourceX = parseCssLength(pageStyle?.left);
      const sourceY = parseCssLength(pageStyle?.top);
      const pageX =
        this.manualPageIds.has(page.id) && sourceX !== undefined ? sourceX : sourceX && sourceX !== 0 ? sourceX : autoX;
      const pageY =
        this.manualPageIds.has(page.id) && sourceY !== undefined ? sourceY : sourceY && sourceY !== 0 ? sourceY : autoY;
      const fill = pageBackgroundFill(pageStyle);

      // Frame 提供页面固定宽高; overflow=show 保证拖动中的子节点不会被页面裁剪。
      // Group 的宽高随子节点变化,不能作为页面的编辑边界。
      const pageGroup = new FrameConstructor({
        x: pageX,
        y: pageY,
        width: w,
        height: h,
        id: page.id,
        editable: true,
        hitChildren: true,
        ...pageVisualProps(pageStyle),
        overflow: 'show',
      });
      // 显式写入属性,兼容不同 Leafer 版本的构造器代理。
      (pageGroup as any).id = page.id;
      (pageGroup as any).editable = true;
      (pageGroup as any).hitChildren = true;
      const bg = new RectConstructor({ x: 0, y: 0, width: w, height: h, fill, ...pageVisualProps(pageStyle) });
      (pageGroup as { add: (n: unknown) => void }).add(bg);
      this.pageFrames.set(page.id, pageGroup);
      this.nodeMap.set(page.id, pageGroup);
      this.pageLayoutBounds.set(page.id, { x: pageX, y: pageY, width: w, height: h });
      this.rootGroup.add(pageGroup);

      // 递归渲染 page items(子节点 x/y 是 page-relative,直接 add 即可)
      await this.renderChildren(pageGroup, page.items ?? [], { width: w, height: h });
      cursorX += w + PAGE_GAP;
    }

    this.emit('set-root', root);
    this.emit('page-el-update', this.container as HTMLDivElement);
  }

  public setZoom(zoom: number = DEFAULT_ZOOM): void {
    this.zoom = zoom;
    // Stage.vue 已经对整个 stage container 做 CSS scale。Leafer 只保留
    // 逻辑缩放值，不能再 scaleOfWorld，否则位置离原点越远误差越大，
    // 画布和右上角预览会出现双倍缩放后的尺寸/偏移差异。
  }

  public async add(data: UpdateData): Promise<void> {
    if (data.parentId === undefined) return;
    const parent = this.findParentContainer(data.parentId);
    if (!parent) return;

    const node = this.createNode(data.config, this.getNodeSize(parent));
    if (node) {
      (parent as { add: (n: unknown) => void }).add(node);
    }
  }

  public async update(data: UpdateData): Promise<void> {
    const node = this.nodeMap.get(data.config.id);
    if (!node) {
      // 节点不存在,fallback 到 add
      return this.add(data);
    }

    // page 是 stage 的布局根节点,没有走 shape registry。用户拖动/缩放
    // page 后原地更新它,不能重新套用自动排版或替换 Editor 当前 target。
    if (this.pageFrames.has(data.config.id)) {
      const page = node as any;
      const { style } = data.config;
      const left = parseCssLength(style?.left);
      const top = parseCssLength(style?.top);
      const width = parseCssLength(style?.width);
      const height = parseCssLength(style?.height);
      if (left !== undefined) page.x = left;
      if (top !== undefined) page.y = top;
      if (width !== undefined) page.width = width;
      if (height !== undefined) page.height = height;
      const background = page.children?.[0];
      applyPageVisualProps(page, style);
      if (background) {
        if (width !== undefined) background.width = width;
        if (height !== undefined) background.height = height;
        background.fill = pageBackgroundFill(style);
        applyPageVisualProps(background, style);
      }
      this.manualPageIds.add(data.config.id);
      return;
    }

    // 重新跑 shape,生成新节点,替换旧的
    if (!this.shapeRegistry.get?.(data.config.type ?? '')) return;
    const { parent } = node as { parent?: { add: (n: unknown) => void; remove: (n: unknown) => void } };
    const result = this.createNode(data.config, this.getNodeSize(parent));
    if (parent) {
      parent.remove(node);
      this.deleteMappedTree(node);
      if (result) {
        parent.add(result);
      }
    }
  }

  public async remove(data: RemoveData): Promise<void> {
    const node = this.nodeMap.get(data.id);
    if (!node) return;

    const { parent } = node as { parent?: { remove: (n: unknown) => void } };
    parent?.remove(node);
    this.deleteMappedTree(node);
  }

  public async select(ids: Id | Id[]): Promise<void> {
    const list = Array.isArray(ids) ? ids : [ids];
    const targets = list.map((id) => this.nodeMap.get(id)).filter(Boolean);
    if (this.editor) {
      this.editor.target = targets.length === 1 ? targets[0] : targets;
      return;
    }
    this.emit('select', list);
  }

  public async multiSelect(ids: Id[]): Promise<void> {
    await this.select(ids);
  }

  public highlight(_id: Id): void {}
  public clearHighlight(): void {}
  public clearGuides(): void {}
  public delayedMarkContainer(_event: MouseEvent, _exclude?: Element[], _isAdd?: boolean): undefined {
    return undefined;
  }
  public getMoveableOption<K extends string>(_key: K): undefined {
    return undefined;
  }
  public getDragStatus(): undefined {
    return undefined;
  }
  public disableMultiSelect(): void {}
  public enableMultiSelect(): void {}
  public setAlwaysMultiSelect(_value: boolean): void {}
  public reloadIframe(_url: string): void {}
  public async getElementImage(): Promise<never> {
    throw new Error('LeaferStage does not render DOM elements as images');
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

  private commitDrag({ sessionId, ids, target, snapshots }: DragCommit): void {
    const snapshotById = new Map(snapshots.map((snapshot) => [`${snapshot.id}`, snapshot]));
    const configs = ids
      .map((id) => {
        const node = this.nodeMap.get(id) as any;
        if (!node) return null;
        if (this.pageFrames.has(id)) this.manualPageIds.add(id);
        const style: Record<string, unknown> = target
          ? this.readNodeStyle(node)
          : { ...(snapshotById.get(`${id}`)?.style ?? this.readNodeStyle(node)) };
        if (target && !this.pageFrames.has(id)) {
          const targetNode = this.nodeMap.get(target.id) as any;
          const currentParentId = node.parent?.id;
          if (targetNode && `${currentParentId}` !== `${target.id}`) {
            const relativeBounds = node.getLayoutBounds?.('box', targetNode);
            if (relativeBounds) {
              style.left = relativeBounds.x;
              style.top = relativeBounds.y;
            }
            return { id, style, parentId: target.id };
          }
        }
        return { id, style };
      })
      .filter((config): config is { id: Id; style: Record<string, unknown>; parentId?: Id } => Boolean(config));
    this.manualPageIds.clear();
    if (configs.length) {
      const parentId = configs.find((config) => config.parentId)?.parentId;
      this.emit('edit-end', { sessionId, configs, parentId });
    }
  }

  private readNodeStyle(node: any): Record<string, unknown> {
    const style: Record<string, unknown> = {};
    if (typeof node.x === 'number') style.left = node.x;
    if (typeof node.y === 'number') style.top = node.y;
    if (typeof node.width === 'number') style.width = node.width;
    if (typeof node.height === 'number') style.height = node.height;
    if (typeof node.rotation === 'number' && node.rotation !== 0) {
      style.transform = { rotate: `${node.rotation}deg` };
    }
    return style;
  }

  /**
   * 将 Leafer Editor 的命中节点映射回 DSL 节点。
   *
   * 组件和页面通常由多个 Leafer 绘制节点组成,例如页面背景 Rect、按钮的
   * 背景 Rect 和文字 Text 都不是 DSL 节点。Editor 可能把这些绘制节点放进
   * selection list,所以不能只读取当前节点的 id;必须沿 parent 向上找到
   * nodeMap 中登记的最近 DSL 节点。
   */
  private resolveSelectionNode(node: any): { id: Id; node: any } | null {
    const visited = new Set<any>();
    let current = node;

    while (current && !visited.has(current)) {
      visited.add(current);
      const id = current.id as Id | undefined;
      if (id !== undefined && id !== null && this.nodeMap.get(id) === current) {
        return { id, node: current };
      }
      current = current.parent;
    }

    return null;
  }

  private normalizeSelection(nodes: any[]): { ids: Id[]; nodes: any[] } {
    const ids: Id[] = [];
    const selectedNodes: any[] = [];
    const seen = new Set<Id>();

    nodes.forEach((node) => {
      const mapped = this.resolveSelectionNode(node);
      if (!mapped || seen.has(mapped.id)) return;
      seen.add(mapped.id);
      ids.push(mapped.id);
      selectedNodes.push(mapped.node);
    });

    return { ids, nodes: selectedNodes };
  }

  // -------------------------------------------------------------------------
  // 内部工具
  // -------------------------------------------------------------------------

  /** 递归渲染子节点到 page frame 或其它 Leafer 容器。 */
  private async renderChildren(
    parent: unknown,
    children: MNode[],
    parentSize?: { width?: number; height?: number },
  ): Promise<void> {
    for (const node of this.createNodes(children, parentSize)) {
      (parent as { add: (n: unknown) => void }).add(node);
    }
  }

  /** 根据 shape 构建一个节点，并递归挂载其 children。 */
  private createNode(config: MNode, parentSize?: { width?: number; height?: number }): any {
    const shape = this.shapeRegistry.get?.(config.type ?? '');
    if (!shape) return null;

    const normalizedConfig = this.resolveRelativeLengths(config, parentSize);
    const result = shape(normalizedConfig as any, {
      resolve: (type: string) => this.shapeRegistry.get?.(type),
      renderChildren: (children: MNode[]) => this.createNodes(children, parentSize),
    });

    if (!result) return null;

    const node = typeof result === 'object' && 'node' in result ? (result as { node: any }).node : result;
    // Leafer Editor 通过 editable 自动参与选中、移动、缩放；页面根节点
    // 由 stage 管理，不作为可编辑对象。
    if (node && config.type !== 'page' && config.type !== 'page-fragment') {
      node.id = config.id;
      node.editable = true;
      // button / qrcode 等 shape 的根节点是 Group,可见内容在 children
      // 中。开启子节点命中后,点击实际绘制内容会回溯到可编辑根节点。
      node.hitChildren = true;
    }
    this.nodeMap.set(config.id, node);
    if (Array.isArray(config.items)) this.containerNodeIds.add(config.id);

    if (typeof result === 'object' && 'node' in result) {
      const children = (result as { children?: MNode[] }).children ?? [];
      for (const child of this.createNodes(children, this.getNodeSize(node))) {
        node.add(child);
      }
    }

    return node;
  }

  private createNodes(children: MNode[], parentSize?: { width?: number; height?: number }): any[] {
    return children.map((child) => this.createNode(child, parentSize)).filter(Boolean);
  }

  private getNodeSize(node: any): { width?: number; height?: number } {
    return { width: parseCssLength(node?.width), height: parseCssLength(node?.height) };
  }

  private resolveRelativeLengths(config: MNode, parentSize?: { width?: number; height?: number }): MNode {
    if (!config.style || !parentSize) return config;
    const style = { ...config.style };
    const width = parseCssLength(style.width, parentSize.width);
    const height = parseCssLength(style.height, parentSize.height);
    const left = parseCssLength(style.left, parentSize.width);
    const top = parseCssLength(style.top, parentSize.height);
    const right = parseCssLength(style.right, parentSize.width);
    const bottom = parseCssLength(style.bottom, parentSize.height);
    const marginLeft = parseCssLength(style.marginLeft) ?? 0;
    const marginTop = parseCssLength(style.marginTop) ?? 0;
    const marginRight = parseCssLength(style.marginRight) ?? 0;
    const marginBottom = parseCssLength(style.marginBottom) ?? 0;

    if (left !== undefined) style.left = left + marginLeft;
    else if (right !== undefined && parentSize.width !== undefined && width !== undefined) {
      style.left = parentSize.width - right - width - marginRight;
    }
    if (top !== undefined) style.top = top + marginTop;
    else if (bottom !== undefined && parentSize.height !== undefined && height !== undefined) {
      style.top = parentSize.height - bottom - height - marginBottom;
    }
    style.width = width ?? style.width;
    style.height = height ?? style.height;
    return { ...config, style };
  }

  private deleteMappedTree(node: unknown): void {
    const children = (node as { children?: unknown[] }).children ?? [];
    for (const child of children) {
      this.deleteMappedTree(child);
    }

    for (const [id, mappedNode] of this.nodeMap) {
      if (mappedNode === node) {
        this.nodeMap.delete(id);
      }
    }
  }

  /** 找节点的父容器,支持 page frame 和嵌套 shape 容器。 */
  private findParentContainer(parentId: Id): unknown {
    return this.nodeMap.get(parentId) ?? this.pageFrames.get(parentId) ?? null;
  }
}
