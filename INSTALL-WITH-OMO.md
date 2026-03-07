# 一键安装 opencode-newclaw-auth + oh-my-opencode

本文档介绍如何同时安装 NewClaw 认证插件和 [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) 增强插件。

oh-my-opencode 提供多模型编排、并行后台代理、LSP/AST 工具等高级功能。配合 NewClaw 使用，所有代理和任务类别都会自动配置为使用 NewClaw 的模型。

---

## 一键安装（推荐）

```bash
# 同时安装两个插件
npm install https://github.com/Jalone5186/opencode-newclaw-auth.git oh-my-opencode

# 或使用 bun
bun add https://github.com/Jalone5186/opencode-newclaw-auth.git oh-my-opencode
```

安装完成后会自动：
1. 将 NewClaw provider 配置写入 `~/.config/opencode/opencode.json`
2. 将 NewClaw 模型分配写入 `~/.config/opencode/oh-my-opencode.json`

## 配置 API Key

```bash
# 在 ~/.zshrc 或 ~/.bashrc 中添加
export NEWCLAW_API_KEY="sk-your-newclaw-key"
source ~/.zshrc
```

## 验证安装

```bash
# 检查 OpenCode 配置
cat ~/.config/opencode/opencode.json | grep newclaw

# 检查 OMO 配置（应该看到 newclaw/ 前缀的模型）
cat ~/.config/opencode/oh-my-opencode.json | grep newclaw

# 启动
opencode --model newclaw/claude-opus-4-6
```

---

## 单独安装（不需要 oh-my-opencode）

如果你只需要 NewClaw 认证，不需要 oh-my-opencode 的增强功能：

```bash
npm install https://github.com/Jalone5186/opencode-newclaw-auth.git
```

详见 [README.md](./README.md)。

---

## OMO 模型分配

安装后，oh-my-opencode 的代理和任务类别会自动使用以下 NewClaw 模型：

### 代理 (Agents)

| 代理 | 模型 | 说明 |
|------|------|------|
| sisyphus | claude-opus-4-6 | 主编排代理 |
| hephaestus | gpt-5.3-codex-high | 代码构建 |
| oracle | gpt-5.2 | 高级咨询 |
| librarian | claude-sonnet-4-6 | 文档检索 |
| explore | claude-sonnet-4-6 | 代码搜索 |
| prometheus | claude-opus-4-6 | 规划 |
| metis | claude-opus-4-6 | 预规划分析 |
| momus | gpt-5.2 | 方案审查 |
| sisyphus-junior | claude-sonnet-4-6 | 子任务执行 |
| frontend-ui-ux-engineer | gemini-3.1-pro-preview | 前端开发 |
| document-writer | gemini-3.1-pro-preview | 文档编写 |

### 任务类别 (Categories)

| 类别 | 模型 | 说明 |
|------|------|------|
| visual-engineering | gemini-3.1-pro-preview | 前端/UI |
| ultrabrain | gpt-5.3-codex-high | 复杂逻辑 |
| deep | gpt-5.3-codex-high | 深度研究 |
| artistry | gemini-3.1-pro-preview | 创意方案 |
| quick | claude-sonnet-4-6 | 快速任务 |
| writing | gemini-3.1-pro-preview | 文档写作 |
| business-logic | gpt-5.2 | 业务逻辑 |
| data-analysis | claude-sonnet-4-6 | 数据分析 |

这些分配可以在 `~/.config/opencode/oh-my-opencode.json` 中手动修改。
