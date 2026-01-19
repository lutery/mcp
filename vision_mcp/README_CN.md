# Vision MCP

一个基于 STDIO 的 MCP Server，为不具备视觉能力（或视觉模型成本较高）的 LLM 提供统一的图片分析能力。通过切换 Provider（环境变量配置），即可使用不同平台/厂商的多模态模型。

## 支持的模型 / Provider

通过 `VISION_MODEL_TYPE` 选择提供商：

| type | Provider | 默认 `VISION_API_BASE_URL` | 默认 `VISION_MODEL_NAME` | 备注 |
|------|----------|----------------------------|--------------------------|------|
| `glm` | 智谱 GLM-4.6V | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.6v` | GLM-4.6V 智谱视觉模型 |
| `siliconflow` | SiliconFlow（OpenAI 兼容） | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2-VL-72B-Instruct` | 视觉模型丰富 |
| `modelscope` | ModelScope API-Inference（OpenAI 兼容） | `https://api-inference.modelscope.cn/v1` | `ZhipuAI/GLM-4.6V` | 需实名/绑定阿里云，受限额影响 |
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-4o` | 适配 Chat Completions |
| `claude` | Anthropic Claude（Messages API） | `https://api.anthropic.com` | `claude-3-5-sonnet-20241022` | `baseUrl` 不要带 `/v1` |
| `gemini` | Google Gemini（generateContent API） | `https://generativelanguage.googleapis.com` | `gemini-2.0-flash-exp` | 官方入口；代理/网关可通过 `VISION_API_BASE_URL` 覆盖 |

获取 API Key / Token（各平台控制台）：

- GLM（智谱）：https://open.bigmodel.cn/
- SiliconFlow：https://cloud.siliconflow.cn/
- ModelScope：https://modelscope.cn/my/myaccesstoken
- OpenAI：https://platform.openai.com/
- Claude（Anthropic）：https://console.anthropic.com/
- Gemini（Google AI）：https://ai.google.dev/

## 特性

- 多 Provider 一键切换（仅需改环境变量）
- 图片输入：URL / base64 data URL / 本地文件路径
- 内置系统提示词模板：UI 分析、OCR、目标检测、结构化提取等
- 安全：日志自动脱敏 API Key，且会过滤模型返回的 thinking/reasoning 内容
- 严格遵守 MCP：stdout 仅用于 JSON-RPC，日志走 stderr

## 安装与运行

要求：Node.js >= 18

### 作为 NPM 包被 MCP 客户端启动（推荐）

在 MCP 客户端（如 Claude Desktop）里配置命令为 `npx`：

```json
{
  "mcpServers": {
    "vision-mcp": {
      "command": "npx",
      "args": ["-y", "@lutery/vision-mcp"],
      "env": {
        "VISION_MODEL_TYPE": "siliconflow",
        "VISION_API_KEY": "sk-your-key",
        "VISION_MODEL_NAME": "Qwen/Qwen2-VL-72B-Instruct",
        "VISION_API_BASE_URL": "https://api.siliconflow.cn/v1"
      }
    }
  }
}
```

说明：
- `VISION_MODEL_NAME` / `VISION_API_BASE_URL` 可省略（会使用该 provider 的默认值）
- 如需更详细的配置项，建议直接参考 `.env.example`

也可以全局安装后直接使用可执行文件（`bin` 名称为 `vision-mcp`）：

```bash
npm i -g @lutery/vision-mcp
vision-mcp
```

### 本地开发运行

```bash
cd mcp/vision_mcp
npm install
npm run build
node dist/index.js
```

成功启动后，会在 stderr 输出 `Vision MCP Server is running on stdio`。

## 配置（环境变量）

最小必填：

- `VISION_MODEL_TYPE`：选择 provider
- `VISION_API_KEY`：对应 provider 的 key/token

常用可选：

| 变量 | 说明 | 默认 |
|------|------|------|
| `VISION_MODEL_NAME` | 模型名称 | 各 provider 内置默认值 |
| `VISION_API_BASE_URL` | API 基础地址（不要带具体 endpoint） | 各 provider 内置默认值 |
| `VISION_API_TIMEOUT` | 超时时间（毫秒） | `60000` |
| `VISION_MAX_RETRIES` | 最大重试次数 | `2` |
| `VISION_STRICT_URL_VALIDATION` | 严格校验图片 URL 是否以 `.jpg/.jpeg/.png/.webp` 结尾 | `true` |
| `LOG_LEVEL` | 日志级别：`debug`/`info`/`warn`/`error` | `info` |

Provider 特有配置：

- Claude
  - `VISION_CLAUDE_API_VERSION`：Anthropic API 版本（默认 `2023-06-01`）

## MCP 工具（Tools）

本服务注册了 3 个工具：

### 1) `analyze_image`

参数：

```json
{
  "image": "https://example.com/a.png",
  "prompt": "请描述这个界面有哪些组件",
  "output_format": "text",
  "template": "ui-analysis"
}
```

字段说明：
- `image`：支持 URL / base64 data URL / 本地路径
- `prompt`：你的分析任务描述
- `output_format`：`text` 或 `json`（提示偏好；不会强制校验 JSON）
- `template`：可选系统模板（见下方 `list_templates`）

### 2) `list_templates`

列出内置系统提示词模板（包含 id、用途说明等）。

### 3) `get_config`

返回当前生效的模型配置（API Key 会脱敏）。

## 图片输入规范

支持三种输入：

1) URL

```text
https://example.com/image.png
```

默认开启严格校验：URL 必须以 `.jpg/.jpeg/.png/.webp` 结尾，否则报错。可通过 `VISION_STRICT_URL_VALIDATION=false` 放宽（仅告警）。

2) Base64 Data URL

```text
data:image/png;base64,iVBORw0KGgo...
```

支持的 MIME：`image/jpeg` / `image/jpg` / `image/png` / `image/webp`。

3) 本地文件路径

```text
./test/image.png
D:\\path\\to\\image.jpg
```

要求 MCP Server 进程对该路径可读；仅支持 `.jpg/.jpeg/.png/.webp`。

补充：Gemini provider 不支持直接传 URL 图片，本项目会在 Gemini 适配器内下载 URL 并转 base64（有大小与超时限制）。

## 关于流式响应（Streaming）

所有适配器均强制 `stream: false`，并按"完整 JSON 响应"进行解析。

如果某个上游只支持 SSE / `text/event-stream`，目前不支持（需要额外实现流式解析器）。

## 开发与测试

```bash
cd mcp/vision_mcp
npm install
npm run build
```

测试：

- 仅跑单测（不需要任何 API Key）：

```bash
npm run test:unit
```

- 跑集成测试（需要配置好 `VISION_*` 环境变量）：

```bash
npm test
```

## 常见问题（Troubleshooting）

### 1) 配置加载失败：`Missing VISION_MODEL_TYPE` / `Unsupported model type`

- 确认设置了 `VISION_MODEL_TYPE`
- 可用值：`glm` / `siliconflow` / `modelscope` / `openai` / `claude` / `gemini`

### 2) `Missing VISION_API_KEY`

- 确认 `VISION_API_KEY` 已设置（在 `.env` 或 MCP 客户端 `env` 里）

### 3) 404 / endpoint 错误

- `VISION_API_BASE_URL` 必须是"base"，不要带具体 endpoint
  - OpenAI / SiliconFlow / ModelScope：会自动拼 `/chat/completions`
  - Claude：会自动拼 `/v1/messages`（`baseUrl` 不要写成 `.../v1`）
  - Gemini：会自动拼 `/{apiVersion}/models/{model}:generateContent`

### 4) 图片 URL 校验失败

- 默认要求 URL 以 `.jpg/.jpeg/.png/.webp` 结尾
- 如需放宽：`VISION_STRICT_URL_VALIDATION=false`

## 安全说明

- 不要在 stdout 打日志（stdout 仅用于 MCP JSON-RPC），本项目日志统一走 stderr
- API Key 会在日志中脱敏
- 会无条件过滤模型返回的 thinking/reasoning 内容，避免泄露内部推理信息
