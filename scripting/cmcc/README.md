# 🩹 cmcc · 中国移动话费流量

桌面显示中国移动话费余额、通用 / 定向流量剩余和积分，登录凭证自动续期，不用反复手动更新。

---

## 📲 一键安装

iPhone 上点击下方链接, Scripting 会自动导入:

```
scripting://import_scripts?urls=%5B%22https%3A%2F%2Fwww.imarkr.com%2Fapi%2Fgithub%2Fdownload%2FMaYIHEI%2Fpatch%2Fscripting%2Fcmcc.zip%22%5D
```

---

## 🚀 使用步骤

1. 装好 [Scripting](https://apps.apple.com/app/scripting/id6479691128) 和 Loon，Loon 里装好 BoxJS
2. Loon 导入 [paperclip 中国移动插件](https://github.com/MaYIHEI/paperclip/tree/testing/app/cmcc)，打开「中国移动」App 停留几秒，收到「获取成功」通知
3. 保持 Loon 开启，在 Scripting 里运行 `cmcc`，点「从 BoxJS 导入」，看到 ✅ 即完成
4. iPhone 桌面长按空白 → + → 搜 Scripting → 选 `cmcc`（支持小号 / 中号）

导入一次后小组件每次刷新会自动续期，之后不再需要 Loon。提示「凭证失效」时重复第 2、3 步。

---

## ⚙️ 配置项

| 项 | 默认 | 说明 |
|---|---|---|
| BoxJS 域名 | `boxjs.com` | 配置页里改，和你 BoxJS 的访问域名一致 |

凭证只存在本机 Keychain，查询结果缓存 5 分钟。

---

## 📝 维护记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-10-21 | 0.1.0 | 初版 |
