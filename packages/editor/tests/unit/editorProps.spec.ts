/*
 * Tencent is pleased to support the open source community by making TMagicEditor available.
 *
 * Copyright (C) 2025 Tencent.
 */
import { describe, expect, test } from 'vitest';

import { defaultEditorProps } from '@editor/editorProps';

describe('defaultEditorProps', () => {
  test('提供基础布尔默认值', () => {
    expect(defaultEditorProps.disabledMultiSelect).toBe(false);
    expect(defaultEditorProps.alwaysMultiSelect).toBe(false);
    expect(defaultEditorProps.disabledPageFragment).toBe(false);
    expect(defaultEditorProps.disabledShowSrc).toBe(false);
    expect(defaultEditorProps.disabledDataSource).toBe(false);
    expect(defaultEditorProps.disabledCodeBlock).toBe(false);
  });

  test('数组/对象工厂函数返回空值', () => {
    expect(defaultEditorProps.componentGroupList()).toEqual([]);
    expect(defaultEditorProps.datasourceList()).toEqual([]);
    expect(defaultEditorProps.layerContentMenu()).toEqual([]);
    expect(defaultEditorProps.stageContentMenu()).toEqual([]);
    expect(defaultEditorProps.menu()).toEqual({ left: [], right: [] });
    expect(defaultEditorProps.propsConfigs()).toEqual({});
    expect(defaultEditorProps.propsValues()).toEqual({});
    expect(defaultEditorProps.eventMethodList()).toEqual({});
    expect(defaultEditorProps.datasourceValues()).toEqual({});
    expect(defaultEditorProps.datasourceConfigs()).toEqual({});
    expect(defaultEditorProps.codeOptions()).toEqual({});
  });

  test('customContentMenu 直接返回原 menus', () => {
    const menus = [{ id: 'a' }] as any;
    expect(defaultEditorProps.customContentMenu(menus)).toBe(menus);
  });
});
