<div align="center">

# opencode-newclaw-auth

**OpenCode 的 NewClaw 认证插件**

一个 API Key → 多模型可用（Claude Code、Codex、DeepSeek 等）

支持按模型厂商配置不同 Key，也支持一键统一配置

[![license](https://img.shields.io/badge/license-MIT-black?style=flat-square)](#license)

</div>

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     opencode-newclaw-auth                        │
├─────────────────────────────────────────────────────────────────┤
│  index.ts          插件入口, 认证钩子, 配置注入, fetch拦截器     │
│  provider.ts       多供应商工厂 (OpenAI/Claude/DeepSeek等)       │
├─────────────────────────────────────────────────────────────────┤
│  lib/              核心库模块                                     │
│  ├── constants.ts      全局常量 & 请求头名称                     │
│  ├── types.ts          共享 TypeScript 接口                      │
│  ├── logger.ts         调试/请求日志工具                         │
│  ├── models/           模型注册表 (单一数据源)                    │
│  └── request/          请求转换 & 响应处理                       │
├─────────────────────────────────────────────────────────────────┤
│  scripts/          安装自动化                                     │
│  └── install-opencode-newclaw.cjs  postinstall 配置写入          │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户请求 → OpenCode → 插件认证钩子 → 按模型路由:
  ├── gpt-*/codex-*/o4-* → NewClaw Codex API
  ├── claude-*           → NewClaw Anthropic API
  ├── gemini-*           → NewClaw Google API
  ├── deepseek-*         → NewClaw DeepSeek API
  └── grok-*             → NewClaw Grok API
```

---

## 支持的模型

| 模型 ID | 显示名称 | 支持图片 | 适合场景 |
|---------|---------|:-------:|---------|
| `newclaw/claude-opus-4-6` | Claude Opus 4.6 | ✅ | 复杂任务、深度思考 |
| `newclaw/claude-sonnet-4-6` | Claude Sonnet 4.6 | ✅ | 日常编程、快速响应 |
| `newclaw/claude-haiku-4-5-20251001` | Claude Haiku 4.5 | ✅ | 轻量任务、低成本 |
| `newclaw/gpt-5-codex-high` | GPT-5 Codex High | ✅ | 代码生成、高推理 |
| `newclaw/gpt-5.3-codex` | GPT-5.3 Codex | ✅ | 代码生成 |
| `newclaw/gpt-5.3-codex-high` | GPT-5.3 Codex High | ✅ | 代码生成、高推理 |
| `newclaw/gpt-5.4` | GPT-5.4 | ✅ | 高级推理、复杂逻辑 |
| `newclaw/gpt-5.2` | GPT-5.2 | ✅ | 架构设计、逻辑推理 |
| `newclaw/o4-mini` | O4 Mini | ✅ | 快速推理、低成本 |
| `newclaw/deepseek-r1` | DeepSeek R1 | — 纯文本 | 数学推理、深度思考 |
| `newclaw/deepseek-v3` | DeepSeek V3 | — 纯文本 | 通用编程 |
| `newclaw/grok-4` | Grok 4 | ✅ | 通用推理 |
| `newclaw/gemini-2.5-pro` | Gemini 2.5 Pro | ✅ | 长上下文、多模态 |
| `newclaw/gemini-2.5-flash` | Gemini 2.5 Flash | ✅ | 快速响应、低成本 |

> 💡 以上是预置模型。插件每次启动时会自动从 API 同步最新模型列表，新模型无需手动更新。

---

## 安装（一键完成）

⚠️ **重要提示**：插件必须安装到 `~/.cache/opencode/` 目录下，否则无法正确加载。请根据你的操作系统，复制下方的**一键安装命令**并执行。

### macOS / Linux
请在终端中复制粘贴并运行以下完整命令（含 oh-my-opencode AI 代理编排框架）：

```bash
npm install -g opencode-ai && \
opencode --version && \
cd ~/.cache/opencode && \
npm install https://github.com/Jalone5186/opencode-newclaw-auth.git oh-my-opencode && \
echo "✅ 安装完成！运行 opencode 启动"
```

### Windows (PowerShell)
请在 PowerShell 中复制粘贴并运行以下完整命令（含 oh-my-opencode AI 代理编排框架，缓存目录自动识别）：

```powershell
npm install -g opencode-ai; `
opencode --version; `
cd "$env:LOCALAPPDATA\opencode"; `
if (-not (Test-Path .)) { cd "$env:USERPROFILE\.cache\opencode" }; `
npm install https://github.com/Jalone5186/opencode-newclaw-auth.git oh-my-opencode; `
Write-Host "✅ 安装完成！运行 opencode 启动"
```

### 不需要 oh-my-opencode？
如果你只想安装认证插件，不需要 AI 代理编排框架，使用以下命令：

**macOS / Linux：**
```bash
npm install -g opencode-ai && opencode --version && cd ~/.cache/opencode && npm install https://github.com/Jalone5186/opencode-newclaw-auth.git && echo "✅ 安装完成！"
```

**Windows (PowerShell)：**
```powershell
npm install -g opencode-ai; opencode --version; cd "$env:LOCALAPPDATA\opencode"; if (-not (Test-Path .)) { cd "$env:USERPROFILE\.cache\opencode" }; npm install https://github.com/Jalone5186/opencode-newclaw-auth.git; Write-Host "✅ 安装完成！"
```

---

## 配置 API Key

安装完成后，你需要配置 API Key 才能使用。我们推荐使用 OpenCode 内置的认证流程：

```bash
opencode auth login
```

运行后会出现交互式菜单，请按以下步骤操作：
1. `Select a provider`: 选择 `Other`
2. `Enter provider name`: 输入 `newclaw`（必须全小写）
3. `Enter API key`: 粘贴你的 NewClaw API Key

> **没看到 Other 选项？**
> 确保你已经完成了安装步骤中的 `npm install` 命令。如果你已经打开了 OpenCode，请按 `Ctrl + C` 退出后重新启动。

### 按模型厂商独立配置 Key（可选）

如果你想为不同的模型使用不同的 Key，可以通过设置环境变量来实现（环境变量的优先级高于通过 `opencode auth login` 配置的 Key）：

| 变量名 | 说明 |
|--------|------|
| `NEWCLAW_API_KEY` | 统一 API Key |
| `NEWCLAW_CLAUDE_API_KEY` | Claude 专用 Key |
| `NEWCLAW_CODEX_API_KEY` | Codex/GPT 专用 Key |
| `NEWCLAW_DEEPSEEK_API_KEY` | DeepSeek 专用 Key |
| `NEWCLAW_GROK_API_KEY` | Grok 专用 Key |
| `NEWCLAW_GEMINI_API_KEY` | Gemini 专用 Key |

**macOS / Linux** — 复制以下命令执行（请将 `sk-xxx` 替换为你的实际 Key）：

配置一条：
```bash
echo 'export NEWCLAW_CLAUDE_API_KEY="sk-xxx"' >> ~/.zshrc && source ~/.zshrc
```

同时配置多条：
```bash
echo -e 'export NEWCLAW_CLAUDE_API_KEY="sk-claude-key"\nexport NEWCLAW_DEEPSEEK_API_KEY="sk-deepseek-key"\nexport NEWCLAW_GEMINI_API_KEY="sk-gemini-key"' >> ~/.zshrc && source ~/.zshrc
```

> 如果你用的是 bash 而不是 zsh，把上面的 `.zshrc` 换成 `.bashrc`。

**Windows (PowerShell)** — 复制以下命令执行（请将 `sk-xxx` 替换为你的实际 Key），多条直接换行即可：
```powershell
[Environment]::SetEnvironmentVariable("NEWCLAW_CLAUDE_API_KEY", "sk-claude-key", "User")
[Environment]::SetEnvironmentVariable("NEWCLAW_DEEPSEEK_API_KEY", "sk-deepseek-key", "User")
[Environment]::SetEnvironmentVariable("NEWCLAW_GEMINI_API_KEY", "sk-gemini-key", "User")
```
设置后重新打开 PowerShell 窗口即可生效。

---

## 启动使用

配置好 Key 后，你可以直接启动 OpenCode，或者在启动时指定模型：

```bash
# 默认启动
opencode

# 指定模型启动
opencode --model newclaw/claude-opus-4-6
```

---

## 模型自动同步

本插件支持**模型列表自动同步**功能：

- **每次启动** OpenCode 时，插件都会自动调用 NewClaw API 获取最新的可用模型列表
- 新模型会自动添加到你的 `opencode.json` 配置中，无需手动更新
- 如果 API 不可用（网络问题等），会静默跳过，不影响正常使用

你不需要做任何额外配置，只要安装了插件并配置了 API Key，模型列表就会在每次启动时自动保持最新。

---

## 常见问题

**Q: 安装后还是提示 ProviderInitError?**
这通常是因为插件没有安装在正确的目录下。请确保你是按照教程在 `~/.cache/opencode/` 目录下执行的安装命令，并且成功执行了 `postinstall` 脚本。

**Q: Windows 上找不到 ~/.cache/opencode 目录?**
Windows 下 OpenCode 的缓存目录通常在 `%LOCALAPPDATA%\opencode` 或 `%USERPROFILE%\.cache\opencode`。上面提供的 PowerShell 一键安装命令已经帮你自动处理了这个问题，请直接使用该命令。

**Q: 安装报错 `Permission denied (publickey)` ？**
这是因为 npm 默认使用 SSH 协议拉取 Git 仓库。运行以下命令强制使用 HTTPS：
```bash
git config --global url."https://github.com/".insteadOf "git@github.com:"
```
然后重新执行安装命令即可。

---

## API 聚合服务

本插件使用 [NewClaw](https://newclaw.ai/) 作为 API 聚合服务：

- 🌐 无需科学上网，全球直连
- 🔑 一个 API Key 全模型通用
- 💰 价格低于官方
- 📖 [API 文档](https://newclaw.apifox.cn/)

---

## 开发

如果你想参与本插件的开发：

```bash
git clone https://github.com/Jalone5186/opencode-newclaw-auth.git
cd opencode-newclaw-auth
npm install
npm run typecheck
npm run test
npm run build
```

---

## License

MIT