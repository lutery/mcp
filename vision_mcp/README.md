# Vision MCP

An STDIO-based MCP Server that provides unified image analysis capabilities for LLMs lacking visual abilities (or with expensive vision models). By switching Providers (via environment variables), you can use multimodal models from different platforms/vendors.

## Supported Models / Providers

Select a provider via `VISION_MODEL_TYPE`:

| type | Provider | Default `VISION_API_BASE_URL` | Default `VISION_MODEL_NAME` | Notes |
|------|----------|-------------------------------|----------------------------|-------|
| `glm` | Zhipu GLM-4.6V | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.6v` | GLM-4.6V Zhipu vision model |
| `siliconflow` | SiliconFlow (OpenAI compatible) | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2-VL-72B-Instruct` | Rich vision model selection |
| `modelscope` | ModelScope API-Inference (OpenAI compatible) | `https://api-inference.modelscope.cn/v1` | `ZhipuAI/GLM-4.6V` | Requires real-name verification/Aliyun binding, subject to quotas |
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-4o` | Chat Completions compatible |
| `claude` | Anthropic Claude (Messages API) | `https://api.anthropic.com` | `claude-3-5-sonnet-20241022` | `baseUrl` should not include `/v1` |
| `gemini` | Google Gemini (generateContent API) | `https://generativelanguage.googleapis.com` | `gemini-2.0-flash-exp` | Official entry; proxies/gateways can override via `VISION_API_BASE_URL` |

Get API Key / Token (from respective platform consoles):

- GLM (Zhipu): https://open.bigmodel.cn/
- SiliconFlow: https://cloud.siliconflow.cn/
- ModelScope: https://modelscope.cn/my/myaccesstoken
- OpenAI: https://platform.openai.com/
- Claude (Anthropic): https://console.anthropic.com/
- Gemini (Google AI): https://ai.google.dev/

## Features

- One-click provider switching (just change environment variables)
- Image input support: URL / base64 data URL / local file path
- Built-in system prompt templates: UI analysis, OCR, object detection, structured extraction, etc.
- Security: Automatic API key masking in logs, filters model-returned thinking/reasoning content
- MCP compliant: stdout reserved for JSON-RPC, logs go to stderr

## Installation & Usage

Requirements: Node.js >= 18

### Running as NPM package from MCP client (Recommended)

Configure your MCP client (e.g., Claude Desktop) to use `npx`:

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

Notes:
- `VISION_MODEL_NAME` / `VISION_API_BASE_URL` are optional (will use provider defaults)
- For more configuration options, refer to `.env.example`

You can also install globally and use the executable directly (binary name: `vision-mcp`):

```bash
npm i -g @lutery/vision-mcp
vision-mcp
```

### Local development

```bash
cd mcp/vision_mcp
npm install
npm run build
node dist/index.js
```

On successful startup, you'll see `Vision MCP Server is running on stdio` in stderr.

## Configuration (Environment Variables)

Minimum required:

- `VISION_MODEL_TYPE`: Select provider
- `VISION_API_KEY`: Key/token for the selected provider

Common optional:

| Variable | Description | Default |
|----------|-------------|---------|
| `VISION_MODEL_NAME` | Model name | Provider built-in defaults |
| `VISION_API_BASE_URL` | API base URL (without specific endpoint) | Provider built-in defaults |
| `VISION_API_TIMEOUT` | Timeout (milliseconds) | `60000` |
| `VISION_MAX_RETRIES` | Maximum retry attempts | `2` |
| `VISION_STRICT_URL_VALIDATION` | Strict validation for image URLs ending in `.jpg/.jpeg/.png/.webp` | `true` |
| `LOG_LEVEL` | Log level: `debug`/`info`/`warn`/`error` | `info` |

Provider-specific configuration:

- Claude
  - `VISION_CLAUDE_API_VERSION`: Anthropic API version (default `2023-06-01`)

## MCP Tools

This server registers 3 tools:

### 1) `analyze_image`

Parameters:

```json
{
  "image": "https://example.com/a.png",
  "prompt": "Describe the components in this interface",
  "output_format": "text",
  "template": "ui-analysis"
}
```

Field descriptions:
- `image`: Supports URL / base64 data URL / local path
- `prompt`: Your analysis task description
- `output_format`: `text` or `json` (hint preference; JSON not strictly validated)
- `template`: Optional system template (see `list_templates` below)

### 2) `list_templates`

Lists built-in system prompt templates (including id, usage description, etc.).

### 3) `get_config`

Returns currently active model configuration (API key is masked).

## Image Input Specifications

Supports three input types:

1) URL

```text
https://example.com/image.png
```

Strict validation enabled by default: URL must end with `.jpg/.jpeg/.png/.webp`, otherwise error. Can be relaxed with `VISION_STRICT_URL_VALIDATION=false` (warning only).

2) Base64 Data URL

```text
data:image/png;base64,iVBORw0KGgo...
```

Supported MIME types: `image/jpeg` / `image/jpg` / `image/png` / `image/webp`.

3) Local file path

```text
./test/image.png
D:\\path\\to\\image.jpg
```

Requires MCP Server process to have read access; only supports `.jpg/.jpeg/.png/.webp`.

Note: Gemini provider doesn't support direct URL image input; this project downloads URLs and converts to base64 in the Gemini adapter (subject to size and timeout limits).

## About Streaming

All adapters enforce `stream: false` and parse as "complete JSON response".

SSE / `text/event-stream` responses are currently not supported (would require additional streaming parser implementation).

## Development & Testing

```bash
cd mcp/vision_mcp
npm install
npm run build
```

Testing:

- Unit tests only (no API keys required):

```bash
npm run test:unit
```

- Integration tests (requires `VISION_*` environment variables configured):

```bash
npm test
```

## Troubleshooting

### 1) Configuration loading failed: `Missing VISION_MODEL_TYPE` / `Unsupported model type`

- Ensure `VISION_MODEL_TYPE` is set
- Valid values: `glm` / `siliconflow` / `modelscope` / `openai` / `claude` / `gemini`

### 2) `Missing VISION_API_KEY`

- Ensure `VISION_API_KEY` is set (in `.env` or MCP client `env`)

### 3) 404 / endpoint errors

- `VISION_API_BASE_URL` must be the "base" URL, without specific endpoint
  - OpenAI / SiliconFlow / ModelScope: automatically appends `/chat/completions`
  - Claude: automatically appends `/v1/messages` (don't write `baseUrl` as `.../v1`)
  - Gemini: automatically appends `/{apiVersion}/models/{model}:generateContent`

### 4) Image URL validation failed

- Default requires URL to end with `.jpg/.jpeg/.png/.webp`
- To relax: `VISION_STRICT_URL_VALIDATION=false`

## Security Notes

- Don't log to stdout (stdout reserved for MCP JSON-RPC), all logs go to stderr
- API keys are masked in logs
- Unconditionally filters model-returned thinking/reasoning content to avoid leaking internal inference information
