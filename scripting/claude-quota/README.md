# 🩹 claude-quota · Claude.ai 配额监控

iPhone 桌面小组件, 一眼看 [claude.ai](https://claude.ai) 的 5 小时滚动配额、
7 天周配额和 Opus 配额。基于 [Scripting](https://scripting.fun) + iOS 26 液态玻璃。

---

## 📲 一键安装

在 **iPhone 上**点击下面的链接 (需先装好 [Scripting](https://apps.apple.com/app/scripting/id6479691128) app):

```
scripting://import_scripts?urls=%5B%22https%3A%2F%2Fwww.imarkr.com%2Fapi%2Fgithub%2Fdownload%2FMaYIHEI%2Fpatch%2Fscripting%2Fclaude-quota.zip%22%5D
```

> 更新: 在 Scripting app 里重新加载即可拉最新版。如果显示的还是旧版,
> 多半是 [imarkr](https://www.imarkr.com) 转包缓存, 等一两分钟再重新加载。

装完后还要**配置 cookie** 才能出数据, 见下方"使用步骤"。

---

## ✨ 功能

- 5 小时滚动配额 + 7 天周配额 + Opus 配额 (Max 才有)
- iOS 26 液态玻璃 UI, 4 套可选主题
- Small / Medium / Large / ExtraLarge 多尺寸自适应
- 7 天历史柱状图 (Medium 及以上)
- 凭据走 iOS Keychain 加密存储, 永不同步 iCloud
- 5 分钟响应缓存, 网络故障降级到旧数据
- 分类错误提示 (鉴权 / 网络 / 接口变更 / 未配置)

---

## 🚀 使用步骤

### 1. 抓 cookie 和 org_id

电脑浏览器登录 [claude.ai](https://claude.ai) → F12 打开 DevTools → Network 标签
→ 过滤 `api/organizations` → 刷新页面 → 点任意一条请求:

- **org_id**: 请求 URL `…/api/organizations/{UUID}/…` 里的那段 UUID
- **cookie**: Request Headers 里的整段 `cookie:` 值 (很长)

把这两个值传到 iPhone (AirDrop 最稳, 别截图别发聊天)。

> ⚠️ cookie 等于 claude.ai 登录态, 当密码看待。

### 2. 在 Scripting 里配置

iPhone 打开 Scripting → 运行 `claude-quota` 的配置脚本 → 粘 cookie 和 org_id
→ 保存并测试 → 看到 ✅ 即成功。

### 3. 加到桌面

桌面长按 → 加 Scripting widget → 选尺寸 → 编辑小组件 → Script 选 `claude-quota`。

---

## 🎨 主题

改 [`widget.tsx`](./widget.tsx) 顶部一个常量:

```ts
const THEME: ThemeKey = 'liquid_glass'
// 'liquid_glass' | 'minimal_dark' | 'paper' | 'neon'
```

| 主题 | iOS 26 玻璃 | 适合 |
|---|---|---|
| `liquid_glass` | ✓ | 默认, 现代 iOS 观感 |
| `minimal_dark` | ✗ | iOS 18-25, 或偏好纯深色 |
| `paper` | ✗ | 浅色壁纸 |
| `neon` | ✗ | 程序员审美 |

---

## 🔧 工作原理

小组件用浏览器会话 cookie 请求
`https://claude.ai/api/organizations/{org_id}/usage` ——
跟 claude.ai 网页前端渲染用量指示器用的是同一个接口。

**这是未公开接口。** Anthropic 没文档、不保证稳定、随时可能改或下线。
接口字段变了, 改 [`api.ts`](./api.ts) 里的 `RawResponse` / `RawSegment`
解析逻辑即可, 不动其他文件。

---

## 📁 文件结构

```
claude-quota/
├── widget.tsx       widget 入口, 顶部切主题
├── index.tsx        配置脚本入口 (粘 cookie / org_id → Keychain)
├── api.ts           网络层 + 缓存 + Keychain + 错误分类
├── themes.ts        4 套主题
├── tsconfig.json    TS 配置 (类型由 Scripting VSCode 扩展提供)
└── script.json      Scripting 元数据 (版本号在这)
```

---

## 🔒 安全说明

- cookie 授予完整 claude.ai 会话权限 (可读历史、发消息), **当密码看待**
- 存在 **iOS Keychain**, 静态加密, 不同步 iCloud, 其他 app 拿不到
- **永不** commit 进 git (见根目录 `.gitignore`)
- cookie 会定期过期 (数周到数月), 过期后重跑配置脚本

---

## 🙏 致谢

`claude.ai/api/organizations/{id}/usage` 接口与 cookie 鉴权思路通过 DevTools
独立分析得出。本项目代码、UI、架构、错误处理全部从零编写, 与以下使用同一接口
的开源项目**不共享任何代码**:

- [richhickson/claudecodeusage](https://github.com/richhickson/claudecodeusage) — macOS 菜单栏 app, 用 Claude Code OAuth
- [backmind/ClaudeUsage](https://github.com/backmind/ClaudeUsage) — PowerShell 模块, 用 setup-token
- [INNO-HI/ClaudeUsageWidget](https://github.com/INNO-HI/ClaudeUsageWidget) — 跨平台 widget app

---

## ⚠️ 免责声明

本项目**与 Anthropic 无任何隶属、背书或支持关系**, 使用未公开内部 API,
随时可能失效。详见根目录 [`DISCLAIMER.md`](../../DISCLAIMER.md)。

`claude.ai` 和 `Claude` 是 Anthropic PBC 的商标。
