# 🩹 patch / scripting

[Scripting](https://scripting.fun) 平台的小组件清单。

> Scripting 是 iOS 上的 TypeScript + SwiftUI runtime, 写一段 TSX 就能编译成原生 widget。

---

## 📋 组件清单

| 目录 | 功能 | 平台版本 | 状态 |
|---|---|---|---|
| [`claude-quota/`](./claude-quota/) | Claude.ai 配额监控 (5h / 7d / Opus) | iOS 18+ / 26 推荐 | ✅ 维护中 |
| [`cmcc/`](./cmcc/) | 中国移动话费 / 流量 / 语音 / 积分, 凭证自动续期 | iOS 18+ | ✅ 维护中 |

---

## 🚀 通用说明

### 平台

- **App**: [Scripting](https://apps.apple.com/app/scripting/id6479691128) (作者 Thom Fang)
- **运行环境**: iOS 18+, iOS 26 启用液态玻璃效果
- **语言**: TypeScript + JSX (TSX)
- **API**: 全部从 `'scripting'` 单一模块 import (不是浏览器 JS, 不是 Node)

### 安装

每个组件 README 顶部有一个 `scripting://import_scripts?...` 一键安装链接。
iPhone 上点击即可导入 Scripting app。

底层通过 [imarkr 转包服务](https://www.imarkr.com) 把 GitHub 子目录打包成 zip:

```
https://www.imarkr.com/api/github/download/MaYIHEI/patch/scripting/<组件名>.zip
```

更新只需在 Scripting app 里重新加载, 它会自动拉最新的 zip。

### 凭据安全

- 涉及登录态的组件 (cookie / token) **必须走 iOS Keychain 存储**, 不进 git, 不进 iCloud
- 每个组件提供一个 `setup` 脚本用来粘贴凭据 → Keychain
- 详见各组件 README 的"使用步骤"

---

## ➕ 新增组件

参考根目录 [`CONTRIBUTING.md`](../CONTRIBUTING.md), 遵循 "一组件一文件夹" 规范。
