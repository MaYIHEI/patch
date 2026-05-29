# 贡献规范

本仓库采用 **"一组件一文件夹"** 的组织方式,任何新增小组件请遵循以下规范。

---

## 📁 文件夹结构

每个小组件应该是一个独立子目录,放在对应平台目录下:

```
<平台>/
├── README.md           ← 平台索引 (已有, 只需更新表格)
└── <组件名>/           ← 新建这个文件夹
    ├── README.md       ← 该组件的详细文档 (含安装链接)
    ├── <主入口>.tsx    ← widget 入口
    ├── <其他模块>.ts   ← 共享逻辑 / API / 主题
    └── script.json     ← Scripting 元数据 (Scripting 平台必需)
```

例如新增 Scripting 平台的天气小组件 `weather`:

```
scripting/
├── README.md           ← 在表格里加一行 weather
└── weather/
    ├── README.md
    ├── widget.tsx
    ├── api.ts
    └── script.json
```

---

## 📝 添加步骤

### 1. 创建组件目录

在对应平台目录下创建子目录,放入组件代码与元数据。

### 2. 写组件 README

在组件目录下创建 `README.md`,**直接复制下方模板**填写。
**必须包含一键安装链接** (通过 imarkr 转包):

```
scripting://import_scripts?urls=%5B%22https%3A%2F%2Fwww.imarkr.com%2Fapi%2Fgithub%2Fdownload%2FMaYIHEI%2Fpatch%2F<平台>%2F<组件名>.zip%22%5D
```

### 3. 更新平台索引

打开平台目录的 README (如 `scripting/README.md`),在组件清单表格里追加一行:

```markdown
| [`weather/`](./weather/) | 天气 - 实时温度 + 三天预报 | ✅ 维护中 |
```

### 4. 提交

commit message 建议:

```
feat: 新增 weather 小组件 (Scripting / 天气)
```

---

## 📄 组件 README 模板

直接复制下面这段,把所有 `<占位>` 替换成实际值。

```markdown
# 🩹 <组件名> · <功能短描述>

<一句话功能介绍>

---

## 📲 一键安装

iPhone 上点击下方链接, Scripting / Scriptable 会自动导入:

\`\`\`
<scripting:// 或 scriptable:// 开头的安装 URL>
\`\`\`

或者拷贝下面这个 URL 到 Safari 里打开:

\`\`\`
<同上>
\`\`\`

---

## 🚀 使用步骤

1. 装好 [Scripting](https://apps.apple.com/app/scripting/id6479691128) (或 Scriptable)
2. 点击上方一键安装链接, 确认导入
3. <抓数据 / 配置 / 鉴权步骤, 比如"打开浏览器登录 X, F12 抓 cookie">
4. 运行 `<组件名>-setup` 脚本, 填入凭据
5. iPhone 桌面长按空白 → + → 搜 Scripting → 选 `<组件名>`

---

## ⚙️ 配置项

| 项 | 默认 | 说明 |
|---|---|---|
| `THEME` | `liquid_glass` | 主题, 在 widget 入口文件顶部常量切换 |
| ... | ... | ... |

---

## 🔧 接口说明

| 接口 | 方法 | 是否公开 | 鉴权方式 |
|---|---|---|---|
| `<URL>` | GET | ❌ 未公开 | cookie |

> 接口若变更, 改 `api.ts` 的字段解析即可, 不动 UI 文件。

---

## 📝 维护记录

| 日期 | 版本 | 变更 |
|---|---|---|
| YYYY-MM-DD | x.y.z | 初版 / 适配 / 修复 |

---

## ⚠️ 已知限制

- 列出已知问题、有效期、cookie 刷新场景等

---

## 🙏 致谢

- 原作者: [@xxx](链接) (如基于他人改造)
```

---

## 🏷️ 状态徽章约定

清单表格里"状态"列建议使用以下徽章:

| 徽章 | 含义 |
|---|---|
| ✅ 维护中 | 当前可用, 定期验证 |
| ⚠️ 待修 | 已知问题, 暂未修复 |
| ❌ 已失效 | 接口下线或风控, 无法使用 |
| 🔜 计划中 | 占位, 尚未开发 |
| 📦 已归档 | 不再维护, 仅保留历史 |

---

## 🧹 命名规范

- **目录与文件名**: 全小写英文, 单词或缩写, 如 `claude-quota` / `weather` / `bilibili-watch`
- **多词用连字符**: `claude-quota` (不要用下划线或驼峰)
- **单一标识不用空格/驼峰**: `weibotalk` (而非 `weiboTalk` 或 `weibo_talk`)
- **README 标题可以中文 + emoji**, 但路径必须全英文
- **入口文件名** Scripting 平台用 `widget.tsx` 或 `index.tsx` (跟 script.json 的 `mainFile` 字段对齐)

---

## 📋 Commit Message 约定

遵守 conventional commits:

| 类型 | 用途 | 示例 |
|---|---|---|
| `feat` | 新增小组件/功能 | `feat: 新增 weather 小组件 (天气)` |
| `fix(scope)` | 修复 bug, scope 是组件名 | `fix(claude-quota): medium 左右对齐` |
| `docs(scope)` | 仅改文档 | `docs(claude-quota): 更新已知限制` |
| `refactor` | 重构 (行为不变) | `refactor: 拆分到独立平台目录` |
| `chore` | 杂项 (依赖、配置) | `chore: 更新 .gitignore` |

---

## 🔐 安全红线

- **cookie / token / 密钥永远不进 git**, 必须走 Keychain (iOS) 存储
- 接口域名、URL、字段名等 *公开* 信息 OK 写进代码与文档
- 真实账号的 org_id / user_id 不暴露 (用占位符如 `<your-org-id>` 示例)
- `.env` / `*.cookie` / `secrets.json` 已在 `.gitignore` 里拦截
