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

import type { IUI } from 'leafer-ui';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MComponent, MContainer, MNode } from '@tmagic/schema';

/**
 * 单一 leafer shape 节点的描述。
 * - return 一个 leafer UI:画单个独立节点
 * - return { node, children }:node 是 leafer 容器,children 是子 MNode 列表(由 ShapeRegistry 递归处理)
 * - return null:不画(占位)
 */
export type ShapeFn = (config: MComponent, ctx: ShapeContext) => IUI | ShapeWithChildren | null;

export interface ShapeWithChildren {
  node: IUI;
  children?: MNode[];
}

export interface ShapeContext {
  /** 通过 type 递归查子节点 shape */
  resolve(type: string): ShapeFn | undefined;
  /** 由 ShapeRegistry 注入,递归调用子 shape */
  renderChildren(children: MNode[]): IUI[];
}

// ---------------------------------------------------------------------------
// 数值 / 单位 / 长度
// ---------------------------------------------------------------------------

/**
 * 把 CSS 风格的长度值解析成像素数字。
 * - 数字直接返回
 * - '100' / '100px' → 100
 * - '50%' / 'auto' / null / undefined → undefined(由调用方决定 fallback)
 */
export const parsePx = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;

  const s = v.trim();
  if (s === '' || s === 'auto' || s.endsWith('%')) return undefined;

  // 简单处理 px / pt / rpx
  const match = s.match(/^(-?\d+(?:\.\d+)?)\s*(px|pt|rpx)?$/i);
  if (!match) {
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return undefined;

  const unit = (match[2] || '').toLowerCase();
  // 简单换算:rpx 设计稿 750 → px 暂时按 1:1,业务方自定义换算后续可加
  if (unit === 'pt') return num * 1.333;
  return num;
};

// ---------------------------------------------------------------------------
// 阴影
// ---------------------------------------------------------------------------

export interface LeaferShadow {
  x: number;
  y: number;
  blur: number;
  spread?: number;
  color?: string;
  inset?: boolean;
}

const parseShadowValue = (v: string): LeaferShadow | null => {
  const inset = /(^|\s)inset\b/i.test(v);
  const cleaned = v.replace(/\binset\b/gi, '').trim();

  // 从尾部找颜色 token:
  //  - rgba(...) / rgb(...)
  //  - #xxx / #xxxxxx / #xxxxxxxx
  //  - 命名颜色(red / blue / black 等,简单的几个常见值)
  let color: string | undefined;
  let colorMatch: RegExpMatchArray | null;
  const namedColorRegex =
    /(?:^|\s)(red|blue|green|black|white|yellow|orange|pink|purple|gray|grey|cyan|magenta|brown)(?=\s|$)/i;
  const rgbaRegex = /rgba?\([^)]+\)/i;
  const hexRegex = /#[0-9a-f]{3,8}/i;

  if ((colorMatch = cleaned.match(rgbaRegex))) {
    color = colorMatch[0];
  } else if ((colorMatch = cleaned.match(hexRegex))) {
    color = colorMatch[0];
  } else if ((colorMatch = cleaned.match(namedColorRegex))) {
    color = colorMatch[1];
  }

  // 颜色剥离后,剩下的应该是 x y [blur [spread]] 数字
  const withoutColor = color ? cleaned.replace(colorMatch![0], '').trim() : cleaned;
  const nums = withoutColor.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 2) return null;

  return {
    x: nums[0],
    y: nums[1],
    blur: nums[2] ?? 0,
    spread: nums[3] ?? 0,
    color,
    inset,
  };
};

/**
 * 解析 CSS box-shadow 字符串,支持:
 * - 单个阴影:'0 2px 8px rgba(0,0,0,0.15)'
 * - inset:'inset 0 1px 0 #fff'
 * - 多阴影(逗号分隔):leafer 暂时取第一个,业务方手写多阴影
 * - 'none' / null → undefined
 */
export const parseShadow = (css?: string | null): LeaferShadow | undefined => {
  if (!css || css === 'none') return undefined;
  // 顶层逗号分割(避免切到 rgba() 里的逗号)
  const first = css.split(/,(?![^()]*\))/, 1)[0]?.trim();
  if (!first || first === 'none') return undefined;
  const result = parseShadowValue(first);
  return result ?? undefined;
};

// ---------------------------------------------------------------------------
// 渐变
// ---------------------------------------------------------------------------

export interface LeaferColorStop {
  offset: number;
  color: string;
}

export type LeaferFill =
  | { type: 'solid'; color: string }
  | { type: 'linear'; stops: LeaferColorStop[]; angle?: number }
  | { type: 'radial'; stops: LeaferColorStop[] }
  | { type: 'conic'; stops: LeaferColorStop[] }
  | { type: 'image'; url: string }
  | undefined;

const parseColorStops = (stopsStr: string): LeaferColorStop[] => {
  // 'red, blue' / 'red 50%, blue 100%' / '#fff 0, rgba(0,0,0,.5) 100%'
  const parts = stopsStr.split(/,(?![^()]*\))/); // 不在 () 里切
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // 'red' / '#fff' / 'rgba(0,0,0,.5)' 后面可能带 50% / 100%
      const m = p.match(/^(.+?)\s+(\d+(?:\.\d+)?%?)?$/);
      if (!m) return { offset: 0, color: p };
      const color = m[1].trim();
      const offsetStr = m[2];
      let offset = 0;
      if (offsetStr) {
        if (offsetStr.endsWith('%')) offset = parseFloat(offsetStr) / 100;
        else offset = parseFloat(offsetStr) / 360; // 角度 → 0..1
      }
      return { offset, color };
    });
};

/**
 * 解析 CSS 渐变字符串成 leafer 内部结构。
 * 支持 linear / radial / conic;不支持 / 解析失败 → undefined,让调用方 fallback 到 solid color。
 */
export const parseGradient = (css: string | undefined | null): LeaferFill => {
  if (!css) return undefined;
  const s = css.trim();

  const linearMatch = s.match(/^linear-gradient\(\s*(.+)\)$/i);
  if (linearMatch) {
    const inside = linearMatch[1];
    const result: { type: 'linear'; stops: LeaferColorStop[]; angle?: number } = { type: 'linear', stops: [] };
    // 检查是否以 'to xxx' 开头
    const toMatch = inside.match(/^to\s+(top|bottom|left|right|top\s+left|...)/i);
    if (toMatch) {
      // 简化为角度:top=0, right=90, bottom=180, left=270
      const dir = toMatch[1].toLowerCase();
      const map: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 };
      result.angle = map[dir.replace(/\s+/g, '')] ?? 180;
      result.stops = parseColorStops(inside.slice(toMatch[0].length).trim());
    } else {
      const degMatch = inside.match(/^(-?\d+(?:\.\d+)?)\s*(?:deg|rad|turn)?,?/i);
      if (degMatch) {
        let deg = parseFloat(degMatch[1]);
        if (degMatch[0].includes('rad')) deg = (deg * 180) / Math.PI;
        else if (degMatch[0].includes('turn')) deg = deg * 360;
        result.angle = deg;
        result.stops = parseColorStops(inside.slice(degMatch[0].length).trim());
      } else {
        result.stops = parseColorStops(inside);
      }
    }
    return result;
  }

  const radialMatch = s.match(/^radial-gradient\(\s*(.+)\)$/i);
  if (radialMatch) {
    return { type: 'radial', stops: parseColorStops(radialMatch[1]) };
  }

  const conicMatch = s.match(/^conic-gradient\(\s*(.+)\)$/i);
  if (conicMatch) {
    return { type: 'conic', stops: parseColorStops(conicMatch[1]) };
  }

  return undefined;
};

// ---------------------------------------------------------------------------
// 字号 / 字体
// ---------------------------------------------------------------------------

export const parseFontWeight = (v: unknown): number | string | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === 'normal') return 400;
    if (s === 'bold') return 700;
    if (s === 'lighter' || s === 'bolder') return s;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// 颜色
// ---------------------------------------------------------------------------

/**
 * 把 CSS 颜色字符串透传给 leafer(leafer canvas 原生支持 css color 格式)。
 * 支持:hex / rgb / rgba / 颜色名 / 'transparent' / 'inherit'。
 */
export const normalizeColor = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  return undefined;
};

// ---------------------------------------------------------------------------
// 通用视觉属性
// ---------------------------------------------------------------------------

type StyleValue = Record<string, unknown>;

const styleValue = (style: unknown): StyleValue => (style && typeof style === 'object' ? (style as StyleValue) : {});

const parseBoxShorthand = (value: unknown): number[] | undefined => {
  if (typeof value === 'number') return [value, value, value, value];
  if (typeof value !== 'string') return undefined;
  const values = value.trim().split(/\s+/).map(parsePx);
  if (values.some((item) => item === undefined) || values.length < 1 || values.length > 4) return undefined;
  if (values.length === 1) return [values[0]!, values[0]!, values[0]!, values[0]!];
  if (values.length === 2) return [values[0]!, values[1]!, values[0]!, values[1]!];
  if (values.length === 3) return [values[0]!, values[1]!, values[2]!, values[1]!];
  return values as number[];
};

/** 解析 CSS 四边盒模型值,返回 Leafer 支持的 number/number[]。 */
export const boxSpacing = (rawStyle: unknown, name: 'padding' | 'margin'): number | number[] | undefined => {
  const style = styleValue(rawStyle);
  const shorthand = parseBoxShorthand(style[name]);
  const sideNames = [`${name}Top`, `${name}Right`, `${name}Bottom`, `${name}Left`];
  const sides = sideNames.map((side, index) => parsePx(style[side]) ?? shorthand?.[index]);
  if (sides.every((item) => item === undefined)) return undefined;
  const values = sides.map((item) => item ?? 0) as number[];
  return values.every((item) => item === values[0]) ? values[0] : values;
};

const parseOpacity = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(1, value));
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (text.endsWith('%')) {
    const percent = Number.parseFloat(text);
    return Number.isFinite(percent) ? Math.max(0, Math.min(1, percent / 100)) : undefined;
  }
  const opacity = Number(text);
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : undefined;
};

const parseAngle = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*(deg)?$/i);
  return match ? Number(match[1]) : undefined;
};

const parseTransform = (value: unknown): Record<string, number> => {
  const props: Record<string, number> = {};
  const set = (name: string, rawValue: unknown, parser: (input: unknown) => number | undefined = parsePx) => {
    const parsed = parser(rawValue);
    if (parsed !== undefined) props[name] = parsed;
  };

  if (value && typeof value === 'object') {
    const transform = value as Record<string, unknown>;
    set('rotation', transform.rotate, parseAngle);
    const scale = parsePx(transform.scale);
    if (scale !== undefined) {
      props.scaleX = scale;
      props.scaleY = scale;
    }
    set('skewX', transform.skewX, parseAngle);
    set('skewY', transform.skewY, parseAngle);
    return props;
  }

  if (typeof value !== 'string') return props;
  const transformPattern = /(rotate|scale|skewX|skewY)\(([^)]+)\)/gi;
  for (const match of value.matchAll(transformPattern)) {
    const name = match[1].toLowerCase();
    if (name === 'rotate') set('rotation', match[2], parseAngle);
    else if (name === 'scale') {
      const scale = parsePx(match[2]);
      if (scale !== undefined) {
        props.scaleX = scale;
        props.scaleY = scale;
      }
    } else {
      set(name, match[2], parseAngle);
    }
  }
  return props;
};

const parseBorderWidths = (style: StyleValue): number | number[] | undefined => {
  const values = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(
    parsePx,
  );
  if (values.every((value) => value === undefined)) return parsePx(style.borderWidth);
  const fallback = parsePx(style.borderWidth) ?? 0;
  return values.map((value) => value ?? fallback);
};

const borderDashPattern = (style: StyleValue): number[] | undefined => {
  const { borderStyle } = style;
  if (borderStyle === 'dashed') return [6, 4];
  if (borderStyle === 'dotted') return [1, 3];
  return undefined;
};

/** 只返回边框/圆角属性,供复合 shape 的绘制子节点使用。 */
export const borderVisualProps = (rawStyle: unknown): Record<string, unknown> => {
  const style = styleValue(rawStyle);
  const props: Record<string, unknown> = {};
  const cornerRadius = parsePx(style.borderRadius);
  if (cornerRadius !== undefined) props.cornerRadius = cornerRadius;

  const borderWidth = parseBorderWidths(style);
  const borderColor = normalizeColor(style.borderColor);
  if (
    borderWidth !== undefined &&
    (Array.isArray(borderWidth) ? borderWidth.some((value) => value > 0) : borderWidth > 0)
  ) {
    props.strokeWidth = borderWidth;
    props.stroke = borderColor ?? '#000';
  } else if (borderColor) {
    props.stroke = borderColor;
  }
  const dashPattern = borderDashPattern(style);
  if (dashPattern) props.dashPattern = dashPattern;
  return props;
};

/** 将 CSS overflow 映射到 Leafer Frame 的裁剪/滚动模式。 */
export const overflowMode = (rawStyle: unknown): 'show' | 'hide' | 'scroll' | 'x-scroll' | 'y-scroll' | undefined => {
  const { overflow } = styleValue(rawStyle);
  if (typeof overflow !== 'string') return undefined;
  switch (overflow.trim()) {
    case 'hidden':
    case 'clip':
      return 'hide';
    case 'scroll':
    case 'auto':
    case 'overlay':
      return 'scroll';
    case 'visible':
      return 'show';
    default:
      return undefined;
  }
};

export const textOverflowMode = (rawStyle: unknown): 'show' | 'hide' | 'ellipsis' | undefined => {
  const { overflow } = styleValue(rawStyle);
  if (overflow === 'hidden' || overflow === 'clip') return 'hide';
  if (overflow === 'ellipsis') return 'ellipsis';
  if (overflow === 'visible') return 'show';
  return undefined;
};

/**
 * 将 runtime 也会作用到元素上的公共 CSS 视觉属性转换成 Leafer 属性。
 * 这里不处理布局属性(left/top/width/height),布局必须由各 shape 显式解析。
 */
export const commonVisualProps = (rawStyle: unknown): Record<string, unknown> => {
  const style = styleValue(rawStyle);
  const props: Record<string, unknown> = {};
  const opacity = parseOpacity(style.opacity);
  if (opacity !== undefined) props.opacity = opacity;

  if (style.display === 'none') props.visible = false;
  const zIndex = parsePx(style.zIndex);
  if (zIndex !== undefined) props.zIndex = zIndex;

  Object.assign(props, borderVisualProps(style));

  const shadow = normalizeColor(style.boxShadow);
  if (shadow && shadow !== 'none') props.shadow = shadow;

  Object.assign(props, parseTransform(style.transform));
  return props;
};

/** 将 DSL 背景样式转换为 Leafer 的填充值。 */
export const backgroundFill = (rawStyle: unknown): string | undefined => {
  const style = styleValue(rawStyle);
  const image = normalizeColor(style.backgroundImage);
  if (image && image !== 'none') return image;
  return normalizeColor(style.backgroundColor);
};

export interface LeaferBackgroundImagePaint {
  type: 'image';
  url: string;
  mode?: 'normal' | 'cover' | 'fit' | 'stretch' | 'clip' | 'repeat';
  repeat?: boolean | 'x' | 'y';
  align?: 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left' | 'center';
  offset?: { x: number; y: number };
}

export type LeaferBackgroundPaint = string | LeaferBackgroundImagePaint;

const unwrapImageUrl = (value: string): string => {
  const match = value.match(/^url\(\s*["']?(.*?)["']?\s*\)$/i);
  return match?.[1] ?? value;
};

const backgroundAlign = (value: unknown): LeaferBackgroundImagePaint['align'] | undefined => {
  if (typeof value !== 'string') return undefined;
  const tokens = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return undefined;
  if (tokens.length === 1 && ['top', 'right', 'bottom', 'left', 'center'].includes(tokens[0])) {
    return tokens[0] as LeaferBackgroundImagePaint['align'];
  }
  const horizontal = tokens.find((token) => ['left', 'center', 'right'].includes(token));
  const vertical = tokens.find((token) => ['top', 'center', 'bottom'].includes(token));
  if (!horizontal && !vertical) return undefined;
  if (horizontal === 'center' && vertical === 'center') return 'center';
  if (horizontal === 'left' && vertical === 'top') return 'top-left';
  if (horizontal === 'right' && vertical === 'top') return 'top-right';
  if (horizontal === 'right' && vertical === 'bottom') return 'bottom-right';
  if (horizontal === 'left' && vertical === 'bottom') return 'bottom-left';
  return (vertical ?? horizontal) as LeaferBackgroundImagePaint['align'];
};

/** 将背景图的尺寸、重复和定位转换为 Leafer image paint。 */
export const backgroundPaint = (rawStyle: unknown): LeaferBackgroundPaint | undefined => {
  const style = styleValue(rawStyle);
  const image = normalizeColor(style.backgroundImage);
  if (!image || image === 'none' || /^(linear|radial|conic)-gradient/i.test(image)) {
    return backgroundFill(style);
  }

  const paint: LeaferBackgroundImagePaint = {
    type: 'image',
    url: unwrapImageUrl(image),
    align: backgroundAlign(style.backgroundPosition) ?? 'top-left',
  };
  const size = normalizeColor(style.backgroundSize)?.toLowerCase();
  if (size === 'cover') paint.mode = 'cover';
  else if (size === 'contain') paint.mode = 'fit';
  else if (size === '100% 100%') paint.mode = 'stretch';

  const repeat = normalizeColor(style.backgroundRepeat)?.toLowerCase();
  if (repeat === 'no-repeat') paint.repeat = false;
  else if (repeat === 'repeat-x') paint.repeat = 'x';
  else if (repeat === 'repeat-y') paint.repeat = 'y';
  else if (repeat === 'repeat') paint.repeat = true;
  return paint;
};

/** 文本节点的背景和边框通过 Leafer Text.boxStyle 绘制。 */
export const textBoxStyle = (rawStyle: unknown): Record<string, unknown> | undefined => {
  const style = styleValue(rawStyle);
  const box: Record<string, unknown> = {};
  const fill = backgroundFill(style);
  if (fill) box.fill = fill;

  Object.assign(box, borderVisualProps(style));
  const { shadow } = commonVisualProps(style);
  if (shadow !== undefined) {
    box.shadow = shadow;
  }
  return Object.keys(box).length ? box : undefined;
};

// ---------------------------------------------------------------------------
// 占位 Rect(供简单 shape 复用)
// ---------------------------------------------------------------------------

// 不在此文件直接 import Rect,以免测试环境加载 leafer-ui canvas 依赖。
// 占位 Rect 的实现见 ./placeholder.ts
