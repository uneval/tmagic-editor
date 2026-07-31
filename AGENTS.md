# AGENTS.md — TMagic编辑器

> 魔方平台可视化编辑器核心，提供拖拽式活动页面编辑能力。
> 负责人：roymondchen | 创建：2026-04-03

## 项目概述

TMagic Editor 是魔方平台的可视化编辑器核心库，提供拖拽式组件编辑、配置面板、预览发布等能力。支持 Vue 和 React 双框架 Runtime，采用 pnpm monorepo 管理多个核心包。开源项目，同时支持内部业务定制。

**技术栈：** Vue 3, Element Plus, TypeScript, Vite, vitest, VitePress
**主仓库：** `https://git.woa.com/vft-magic/tmagic-editor.git`
**开源仓库：** `https://github.com/Tencent/tmagic-editor.git`

## 架构地图

关键目录：

- `packages/` — 核心编辑器包
- `packages/leafer-stage/` — 独立的 Leafer 编辑器画布阶段，负责节点构建、页面排版、选择与编辑
- `leafer-components/` — Leafer 图形节点及内置组件适配
- `packages/stage/` — iframe/runtime DOM 阶段，不负责 Leafer 画布渲染
- `runtime/` — Vue/React Runtime 实现
- `vue-components/` — Vue 组件封装
- `react-components/` — React 组件封装
- `playground/` — 演示 playground
- `docs/` — VitePress 文档
- `scripts/` — 构建和发布脚本
- `eslint-config/` — 共享 ESLint 配置

## 渲染架构

- iframe 路径由 `packages/stage` 的 StageCore、StageRender 和 runtime 负责，继续用于 DOM 组件渲染。
- Leafer 路径由 `@tmagic/leafer-stage` 独立负责；`StageCore` 不创建或驱动 Leafer 实例，避免两套渲染职责交叉。
- `.m-editor-stage` 是固定的可视窗口，不限制画布世界的尺寸；Leafer 的 design viewport 负责无限画布中的平移和缩放。
- 多页面的横向排版只提供初始位置和间距。页面及其子节点之后仍可被选中、拖动和修改，自动排版不得覆盖用户的后续位置调整。
- DSL/文档模型是内容和样式的事实来源；画布平移、缩放等视口状态属于编辑器运行时状态，不应写回组件样式。

## TypeScript 配置

- `playground/tsconfig.json` 必须显式设置 `compilerOptions.rootDir` 为 `..`。playground 的路径别名会直接引用 workspace package source，TypeScript 6 会据此推导仓库根目录为 common source directory。
- `packages/leafer-stage` 必须纳入 `tsconfig.build-browser.json`，以便独立画布包参与浏览器构建和类型检查。

## 验证与本地缓存

- 常用类型检查：`node_modules/.bin/tsc -p tsconfig.check.json --noEmit --pretty false`、`node_modules/.bin/tsc -p tsconfig.build-browser.json --noEmit --pretty false`、`node_modules/.bin/tsc -p playground/tsconfig.json --noEmit --pretty false`。
- 执行 `pnpm lint` 或 `pnpm lint-fix` 后必须检查变更范围；格式化工具可能触及不相关文件，提交前应使用 `git diff --check` 和 `git status` 复核。
- `.pnpm-store/` 是 pnpm 的本地内容寻址缓存，已加入 `.gitignore`，不得提交到仓库。

## 开发约定

**分支策略：** dev=dev, test/prod=master
**提交规范：** commitlint + husky，`type: 描述`
**测试覆盖率：** 新增或修改的代码必须补充单元测试，覆盖率不低于 85%

**禁止事项：**

- 禁止在核心包中引入腾讯内部专有依赖（开源项目）
- 禁止直接修改 CHANGELOG.md，应通过 `pnpm changelog` 生成
- 禁止提交未达 85% 测试覆盖率的新增/修改代码

## 常用命令

    pnpm bootstrap        # 安装依赖并构建
    pnpm pg               # 启动 Vue playground
    pnpm pg:react         # 启动 React playground
    pnpm build            # 完整构建（DTS + 包）
    pnpm test             # 运行测试
    pnpm lint-fix         # ESLint 修复
    pnpm docs:dev         # 启动文档开发
    pnpm release          # 发版

## 当前状态

**当前里程碑：** Leafer 编辑器阶段迁移与无限画布基础能力已完成；当前重点是交互稳定性、页面多选/拖动和 TypeScript 6 配置收敛。

## 深入阅读

| 文档            | 说明             |
| --------------- | ---------------- |
| docs/           | VitePress 文档站 |
| CONTRIBUTING.md | 贡献指南         |
| CHANGELOG.md    | 变更日志         |
