# 插件更新指南

## 跨平台一键更新命令

### Windows PowerShell
```powershell
$d = if(Test-Path "$env:LOCALAPPDATA\opencode"){"$env:LOCALAPPDATA\opencode"}else{"$env:USERPROFILE\.cache\opencode"}; cd $d; npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main
```

### macOS / Linux Bash
```bash
cd ~/.cache/opencode && npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main
```

### Linux (使用 XDG_CACHE_HOME)
```bash
cd ${XDG_CACHE_HOME:-~/.cache}/opencode && npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main
```

## 更新后
1. 重启 OpenCode
2. 验证插件版本已更新

## 重要提示
- **不要**在本地开发目录运行 `git pull && npm install && npm run build`
- **必须**在 OpenCode 缓存目录运行上述命令
- 命令会自动从 GitHub main 分支拉取最新代码、运行 postinstall、编译并更新插件

## 已知问题修复历史

### 2026-03-14: DeepSeek V3.2 流式模式修复
**问题**: DeepSeek V3.2 模型调用报错，平台显示"非流"模式，而 Claude/GPT 显示"流"模式

**根因**: 
- fallback 路径（处理 DeepSeek/Grok 等非 Claude/Codex 模型）没有注入 `stream: true`
- 没有调用 `handleSuccessResponse()` 进行 SSE→JSON 转换
- 导致响应处理不一致

**修复**:
- 在 fallback 路径中注入 `stream: true`
- 调用 `handleSuccessResponse(response, isStreaming)` 处理响应
- 对齐错误处理逻辑

**提交**: `720ef94` (main)

**修改文件**: `index.ts` (约 375-381 行)
