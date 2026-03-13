<div align="center">

# opencode-newclaw-auth

**OpenCode 的 NewClaw 认证插件**

一个 API Key → 多模型可用（Claude、GPT/Codex、Gemini、DeepSeek、Grok）

通过平台账号自动发现所有令牌，智能路由 + 自动降级

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
│  ├── auth/             平台账号认证                               │
│  │   └── system-auth.ts   平台账号登录 + 令牌发现                │
│  ├── models/           模型注册表 (单一数据源)                    │
│  │   ├── pricing.ts        /api/pricing 分组倍率获取             │
│  │   └── key-registry.ts   多 Key 注册表 + failover              │
│  └── request/          请求转换 & 响应处理                       │
├─────────────────────────────────────────────────────────────────┤
│  scripts/          安装自动化                                     │
│  └── install-opencode-newclaw.cjs  postinstall 配置写入          │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
启动流程:
  平台账号登录 → 获取所有令牌 → /api/pricing 获取分组倍率 → 每个令牌调 /v1/models → 注册到 KeyRegistry

请求流程:
  用户请求 → KeyRegistry 选出最低倍率 key → 发送请求 → 401/403/429? → 自动切换下一个 key
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
| `newclaw/gemini-2.5-pro` | Gemini 2.5 Pro | ✅ | 深度推理、长上下文 |
| `newclaw/gemini-2.5-flash` | Gemini 2.5 Flash | ✅ | 快速响应、低成本 |

> 💡 以上是预置模型，仅供参考。插件每次启动时会自动从 NewClaw API 同步所有可用模型，不做过滤。显示名称包含分组和倍率信息，例如 `Claude Opus 4.6 [默认/1x]`，新模型无需手动更新。

---

## 安装

### 第一步：确认 Node.js 环境

插件依赖 Node.js 和 npm，请先确认已安装。在终端中运行：

```bash
node -v && npm -v
```

如果显示了版本号（Node.js >= 22），可以跳到第二步。如果提示 `command not found` 或版本低于 22，请先安装 Node.js：

**macOS：**
```bash
brew install node
```

> 没有 brew？先运行：`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

**Windows：**

访问 https://nodejs.org/ 下载安装包，选择 LTS 版本，一路点"下一步"即可。安装完成后**以管理员身份打开 PowerShell**，运行以下命令解除脚本限制（只需执行一次）：

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

然后关闭 PowerShell，重新打开普通的 PowerShell 窗口即可。

**Linux (Ubuntu/Debian)：**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
```

### 第二步：安装插件（一键完成）

⚠️ **重要提示**：插件必须安装到 `~/.cache/opencode/` 目录下，否则无法正确加载。请根据你的操作系统，复制下方的**一键安装命令**并执行。

**macOS / Linux**（含 oh-my-opencode AI 代理编排框架）：

```bash
npm install -g opencode-ai && opencode --version && cd ~/.cache/opencode && npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main oh-my-opencode && echo "✅ 安装完成！运行 opencode 启动"
```

**Windows (PowerShell)**（含 oh-my-opencode AI 代理编排框架）：

```powershell
$ErrorActionPreference="Stop"; npm install -g opencode-ai; opencode --version; $d=if(Test-Path "$env:LOCALAPPDATA\opencode"){"$env:LOCALAPPDATA\opencode"}else{"$env:USERPROFILE\.cache\opencode"}; New-Item -ItemType Directory -Force -Path $d | Out-Null; cd $d; npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main oh-my-opencode; Write-Host "✅ 安装完成！运行 opencode 启动"
```

### 不需要 oh-my-opencode？
如果你只想安装认证插件，不需要 AI 代理编排框架，使用以下命令：

**macOS / Linux：**
```bash
npm install -g opencode-ai && opencode --version && cd ~/.cache/opencode && npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main && echo "✅ 安装完成！"
```

**Windows (PowerShell)：**
```powershell
$ErrorActionPreference="Stop"; npm install -g opencode-ai; opencode --version; $d=if(Test-Path "$env:LOCALAPPDATA\opencode"){"$env:LOCALAPPDATA\opencode"}else{"$env:USERPROFILE\.cache\opencode"}; New-Item -ItemType Directory -Force -Path $d | Out-Null; cd $d; npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main; Write-Host "✅ 安装完成！"
```

---

## 配置账号

安装时，postinstall 脚本会自动提示你输入 NewClaw 平台账号和密码（可直接按回车跳过，稍后再配置）。

如果安装时跳过了，或者需要重新配置，运行：

```bash
opencode auth login
```

运行后会出现交互式菜单，请按以下步骤操作：
1. `Select a provider`: 选择 `Other`
2. `Enter provider name`: 输入 `newclaw`（必须全小写）
3. `NewClaw 账号（用户名或邮箱）`: 输入你的平台用户名
4. `NewClaw 密码`: 输入你的平台密码

插件会自动登录平台，发现所有已配置的令牌，并同步可用模型列表。凭证保存在插件目录的 `.newclaw-credentials` 文件中。

> **没看到 Other 选项？**
> 确保你已经完成了安装步骤中的 `npm install` 命令。如果你已经打开了 OpenCode，请按 `Ctrl + C` 退出后重新启动。

### 高级配置（可选）

如果你有特殊需求，可以通过环境变量覆盖自动发现的令牌（优先级高于账号登录）：

| 变量名 | 说明 |
|--------|------|
| `NEWCLAW_API_KEY` | 统一覆盖 Key |

**macOS / Linux：**
```bash
sed -i '' '/NEWCLAW_API_KEY/d' ~/.zshrc; printf 'export NEWCLAW_API_KEY="sk-xxx"\n' >> ~/.zshrc && source ~/.zshrc
```

> 如果你用的是 bash 而不是 zsh，把上面的 `.zshrc` 换成 `.bashrc`。
> Linux 用户请把 `sed -i ''` 改为 `sed -i`（去掉空引号）。

**Windows (PowerShell)：**
```powershell
[Environment]::SetEnvironmentVariable("NEWCLAW_API_KEY", "sk-xxx", "User")
```
设置后重新打开 PowerShell 窗口即可生效。

---

## 启动使用

配置好账号后，你可以直接启动 OpenCode：

```bash
opencode
```

也可以在启动时指定模型：

```bash
opencode --model newclaw/claude-opus-4-6
```

---

## 模型自动同步

本插件支持**模型列表自动同步**功能：

- **多 Key 发现**: 插件登录平台账号后，自动发现账号下所有已配置的令牌
- **并行同步**: 每个令牌的可用模型并行获取，取并集注册到 KeyRegistry
- **倍率信息**: 通过 `/api/pricing` 接口获取分组名称和倍率，模型显示名格式为 `模型名 [分组/倍率]`（例如 `Claude Opus 4.6 [默认/1x]`）
- **所有模型直通**: API 返回的全部模型均注册，不做过滤
- **自动降级**: 某个 key 请求失败（401/403/429）时，自动按倍率升序切换到下一个可用 key
- **无感更新**: 如果 API 不可用（网络问题等），会静默跳过，不影响正常使用

你不需要做任何额外配置，只要安装了插件并配置了平台账号，模型列表就会在每次启动时自动保持最新。

---

## 常见问题

**Q: 首次安装后模型列表不完整？**
这是正常现象。首次启动时，插件会从 API 同步最新模型列表并写入配置文件。由于 OpenCode 先读配置再加载插件，**第二次启动**后就能看到完整的模型列表了（之后每次启动都会自动更新）。

**Q: 安装时提示输入账号密码可以跳过吗？**
可以。直接按回车跳过即可，安装仍会正常完成。跳过后用 `opencode auth login` 配置平台账号，步骤和文档一致。

**Q: 一个模型在多个令牌中都存在怎么办？**
插件会自动选择倍率最低的令牌发起请求。如果该令牌返回 401/403/429，会自动切换到下一个，对你完全透明。

**Q: 安装后还是提示 ProviderInitError?**
这通常是因为插件没有安装在正确的目录下。请确保你是按照教程在 `~/.cache/opencode/` 目录下执行的安装命令，并且成功执行了 `postinstall` 脚本。

**Q: Windows 上找不到 ~/.cache/opencode 目录?**
Windows 下 OpenCode 的缓存目录通常在 `%LOCALAPPDATA%\opencode` 或 `%USERPROFILE%\.cache\opencode`。上面提供的 PowerShell 一键安装命令已经帮你自动处理了这个问题，请直接使用该命令。

---

## API 聚合服务

本插件使用 [NewClaw](https://newclaw.ai/) 作为 API 聚合服务：

- 🌐 无需科学上网，全球直连
- 🔑 一个账号自动发现所有令牌和模型
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