<div align="center">

# opencode-newclaw-auth

**OpenCode 的 NewClaw 认证插件**

一个 API Key → 多模型可用（Claude Code、Codex、Gemini）

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
│  provider.ts       多供应商工厂 (OpenAI/Claude/Gemini)           │
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
  ├── gpt-*/codex-* → NewClaw Codex API (转换 + 请求头)
  ├── claude-*      → NewClaw Anthropic API (URL重写 + 工具前缀)
  └── gemini-*      → NewClaw Gemini API (请求头 + URL构建)
```

---

## 支持的模型

| 模型 ID | 显示名称 | 图片输入 | 适合场景 |
|---------|---------|:-------:|---------|
| `newclaw/claude-opus-4-6-20260205` | Claude Opus 4.6 | ✅ | 复杂任务、深度思考 |
| `newclaw/claude-sonnet-4-5-20250929` | Claude Sonnet 4.5 | ✅ | 代码审查、文档查询 |
| `newclaw/claude-sonnet-4-6` | Claude Sonnet 4.6 | ✅ | 日常编程、快速响应 |
| `newclaw/claude-haiku-4-5-20251001` | Claude Haiku 4.5 | ✅ | 轻量任务、快速回答 |
| `newclaw/gpt-5.3-codex` | GPT-5.3 Codex | ✅ | 日常编程、代码生成 |
| `newclaw/gpt-5.2` | GPT-5.2 | ✅ | 架构设计、逻辑推理 |
| `newclaw/gemini-3-pro` | Gemini 3 Pro | ✅ | 前端 UI、多模态任务 |
| `newclaw/gemini-3.1-pro-preview` | Gemini 3.1 Pro Preview | ✅ | 前端 UI、多模态任务 |

---

## 核心特性：灵活的 API Key 配置

### 🔑 模式一：一键配置（推荐）

设置一个统一的 API Key，自动应用到所有模型：

```bash
# 通过 OpenCode 认证
opencode auth login
# 选择 Other → 输入 newclaw → 输入你的 NewClaw API Key

# 或通过环境变量
export NEWCLAW_API_KEY="sk-your-newclaw-key"
```

### 🔐 模式二：按厂商配置不同 Key

为不同模型厂商设置独立的 API Key（优先级高于统一 Key）：

```bash
# 在 ~/.zshrc 或 ~/.bashrc 中添加
export NEWCLAW_API_KEY="sk-default-key"           # 默认/兜底 Key
export NEWCLAW_CLAUDE_API_KEY="sk-claude-key"      # Claude 专用 Key
export NEWCLAW_CODEX_API_KEY="sk-codex-key"        # Codex/GPT 专用 Key
export NEWCLAW_GEMINI_API_KEY="sk-gemini-key"      # Gemini 专用 Key
```

**Key 优先级**：`厂商专用 Key` > `统一 Key (NEWCLAW_API_KEY)` > `OpenCode auth key`

---

## 快速开始

### 前置条件

- 已安装 [OpenCode](https://opencode.ai/)
- 已安装 [Bun](https://bun.sh/) 或 [Node.js](https://nodejs.org/)
- 已注册 [NewClaw](https://newclaw.ai/) 账号并获取 API Key

### 第一步：安装插件

```bash
# 从 GitHub 直接安装（推荐）
npm install https://github.com/Jalone5186/opencode-newclaw-auth.git

# 或使用 bun
bun add https://github.com/Jalone5186/opencode-newclaw-auth.git
```

安装完成后，`postinstall` 脚本会自动将插件配置写入 `~/.config/opencode/opencode.json`。

**🚀 想要更强大的 AI 代理编排？一键同时安装 [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)：**

```bash
# 一键安装 NewClaw + oh-my-opencode（推荐）
npm install https://github.com/Jalone5186/opencode-newclaw-auth.git oh-my-opencode
```

详见 [INSTALL-WITH-OMO.md](./INSTALL-WITH-OMO.md)。

### 第二步：配置 API Key

**方式 A：通过环境变量（推荐）**

```bash
# 在 ~/.zshrc 或 ~/.bashrc 中添加
export NEWCLAW_API_KEY="sk-your-newclaw-key"

# 然后重新加载
source ~/.zshrc
```

**方式 B：通过 OpenCode 认证**

```bash
opencode auth login
# 选择 newclaw → 输入你的 NewClaw API Key
```

### 第三步：启动使用

```bash
# 指定模型启动
opencode --model newclaw/claude-opus-4-6-20260205

# 或启动后在 OpenCode 中切换模型
opencode
```

### 验证安装是否成功

```bash
# 检查配置文件是否已更新
cat ~/.config/opencode/opencode.json | grep newclaw

# 应该能看到 "newclaw" 相关的 provider 配置
```

---

## 常见问题

**Q: 安装时报错 `bun: command not found`**

已修复。当前版本使用 `node` 执行 postinstall 脚本，不再依赖 bun。请确保使用最新版本。

**Q: 安装后 opencode.json 没有更新**

手动运行 postinstall 脚本：
```bash
node node_modules/opencode-newclaw-auth/scripts/install-opencode-newclaw.cjs
```

**Q: 如何同时使用 oh-my-opencode？**

```bash
npm install https://github.com/Jalone5186/opencode-newclaw-auth.git oh-my-opencode
```
详见 [INSTALL-WITH-OMO.md](./INSTALL-WITH-OMO.md)。

**Q: 如何为不同模型使用不同的 API Key？**

设置对应的环境变量即可，优先级高于统一 Key：
```bash
export NEWCLAW_CLAUDE_API_KEY="sk-claude-key"
export NEWCLAW_CODEX_API_KEY="sk-codex-key"
export NEWCLAW_GEMINI_API_KEY="sk-gemini-key"
```

**Q: 如何添加 Grok、千问等其他模型？**

本插件支持自定义扩展，只需修改模型注册表即可添加新模型。详见 [CUSTOM-MODELS.md](./CUSTOM-MODELS.md)。

## 使用

```bash
# 使用 Claude
opencode --model newclaw/claude-opus-4-6-20260205

# 使用 Codex
opencode --model newclaw/gpt-5.3-codex

# 使用 Gemini
opencode --model newclaw/gemini-3-pro
```

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NEWCLAW_API_KEY` | - | 统一 API Key（一键配置所有模型） |
| `NEWCLAW_CLAUDE_API_KEY` | - | Claude 模型专用 Key（优先级高于统一 Key） |
| `NEWCLAW_CODEX_API_KEY` | - | Codex/GPT 模型专用 Key（优先级高于统一 Key） |
| `NEWCLAW_GEMINI_API_KEY` | - | Gemini 模型专用 Key（优先级高于统一 Key） |
| `ENABLE_PLUGIN_REQUEST_LOGGING` | - | 设为 `1` 启用请求日志 |
| `DEBUG_NEWCLAW_PLUGIN` | - | 设为 `1` 启用调试日志 |
| `SAVE_RAW_RESPONSE` | - | 设为 `1` 保存原始响应到临时目录 |

---

## API 聚合服务

本插件使用 [NewClaw](https://newclaw.ai/) 作为 API 聚合服务：

- 🌐 无需科学上网，全球直连
- 🔑 一个 API Key 全模型通用
- 💰 价格低于官方
- 📖 [API 文档](https://newclaw.apifox.cn/)

---

## 开发

```bash
git clone https://github.com/Jalone5186/opencode-newclaw-auth.git
cd opencode-newclaw-auth
bun install
bun run build
bun run typecheck
```

---

## License

MIT
