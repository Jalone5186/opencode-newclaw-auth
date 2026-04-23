# 一键安装 opencode-newclaw-auth + oh-my-openagent

本文档介绍如何同时安装 NewClaw 认证插件和 [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) 增强插件。

oh-my-openagent 提供多模型编排、并行后台代理、LSP/AST 工具等高级功能。配合 NewClaw 使用，所有代理和任务类别都会自动配置为使用 NewClaw 的优质模型。

> **注意**：oh-my-openagent 的 npm 包名仍为 `oh-my-opencode`，但 GitHub 仓库已更名为 `oh-my-openagent`。插件配置中优先使用 `oh-my-openagent` 作为插件入口名，同时保持对旧名 `oh-my-opencode` 的兼容。

---

## 前置条件

- 已安装 Node.js 18+
- 已有 NewClaw 平台账号（注册地址：https://newclaw.ai/）

---

## 一键安装 (macOS / Linux)

请在终端中复制粘贴并运行以下完整命令。该命令会自动安装最新版 OpenCode、进入缓存目录、同时安装两个插件，并写入配置：

```bash
npm install -g opencode-ai && cd ~/.cache/opencode && npm install https://github.com/Jalone5186/opencode-newclaw-auth.git oh-my-opencode && node node_modules/opencode-newclaw-auth/scripts/install-opencode-newclaw.cjs
```

---

## 一键安装 (Windows PowerShell)

请在 PowerShell 中复制粘贴并运行以下完整命令（会自动识别缓存目录路径）：

```powershell
npm install -g opencode-ai; cd "$env:LOCALAPPDATA\opencode"; if (-not (Test-Path .)) { cd "$env:USERPROFILE\.cache\opencode" }; npm install https://github.com/Jalone5186/opencode-newclaw-auth.git oh-my-opencode; node node_modules/opencode-newclaw-auth/scripts/install-opencode-newclaw.cjs
```

---

## 更新插件

已安装过的用户，执行以下命令即可更新到最新版本：

**macOS / Linux：**
```bash
cd ~/.cache/opencode && npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main oh-my-opencode
```

**Windows (PowerShell)：**
```powershell
$d = if(Test-Path "$env:LOCALAPPDATA\opencode"){"$env:LOCALAPPDATA\opencode"}else{"$env:USERPROFILE\.cache\opencode"}; cd $d; npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main oh-my-opencode
```

更新过程中会提示输入 NewClaw 平台账号密码。如果之前已经配置过，直接按回车跳过即可。

---

## 配置账号

**安装过程中**，脚本会自动提示输入 NewClaw 平台账号和密码：

```
[opencode-newclaw-auth] 🔐 NewClaw 平台账号配置
NewClaw 用户名/邮箱 (回车跳过): your@email.com
NewClaw 密码: ********
[opencode-newclaw-auth] ✅ 账号已保存
```

直接输入你在 [newclaw.ai](https://newclaw.ai) 注册的用户名和密码即可。

**如果安装时跳过了**，重新运行配置脚本：

**macOS / Linux：**
```bash
cd ~/.cache/opencode && node node_modules/opencode-newclaw-auth/scripts/install-opencode-newclaw.cjs
```

**Windows (PowerShell)：**
```powershell
$d=if(Test-Path "$env:LOCALAPPDATA\opencode"){"$env:LOCALAPPDATA\opencode"}else{"$env:USERPROFILE\.cache\opencode"}; cd $d; node node_modules/opencode-newclaw-auth/scripts/install-opencode-newclaw.cjs
```

> **不要使用 `opencode auth login` 配置 NewClaw 账号**。该命令只支持输入 API Key，与本插件的用户名密码登录机制不兼容。

---

## 启动

配置完成后，直接启动 OpenCode：

```bash
opencode
```
（或者指定模型启动：`opencode --model newclaw/claude-opus-4-6`）

---

## OMO 模型分配表

安装后，oh-my-openagent 的后台代理和任务类别会自动配置为使用以下 NewClaw 模型（替换了默认的官方模型）：

### 代理 (Agents)

| 代理 | 模型 | 说明 |
|------|------|------|
| sisyphus | claude-opus-4-6 | 主编排代理 |
| hephaestus | gpt-5-codex-high | 代码构建 |
| oracle | deepseek-r1 | 高级咨询、深度思考 |
| librarian | claude-sonnet-4-6 | 文档检索 |
| explore | claude-sonnet-4-6 | 代码搜索 |
| prometheus | claude-opus-4-6 | 规划 |
| metis | claude-opus-4-6 | 预规划分析 |
| momus | gpt-5.4 | 方案审查 |
| sisyphus-junior | claude-sonnet-4-6 | 子任务执行 |
| frontend-ui-ux-engineer | claude-sonnet-4-6 | 前端开发 |
| document-writer | claude-haiku-4-5-20251001 | 文档编写 |

### 任务类别 (Categories)

| 类别 | 模型 | 说明 |
|------|------|------|
| visual-engineering | claude-sonnet-4-6 | 前端/UI |
| ultrabrain | deepseek-r1 | 复杂逻辑 |
| deep | gpt-5-codex-high | 深度研究 |
| artistry | claude-opus-4-6 | 创意方案 |
| quick | claude-haiku-4-5-20251001 | 快速任务 |
| writing | claude-sonnet-4-6 | 文档写作 |
| business-logic | gpt-5.4 | 业务逻辑 |
| data-analysis | claude-sonnet-4-6 | 数据分析 |

> 这些默认分配非常适合日常开发。如果你需要修改，可以直接编辑 `~/.config/opencode/oh-my-openagent.json` 文件。