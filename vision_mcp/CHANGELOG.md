# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-01-16

### Added
- **Gemini Adapter**: 新增 Google Gemini 多模态模型支持
  - 支持官方和代理两种响应格式
  - 实现三种认证模式：bearer、x-goog、query
  - 支持 API 版本配置 (v1/v1beta)
  - 自动下载 URL 图片并转换为 base64

### Fixed
- **Security**: 修复 logger 脱敏正则表达式错误（反向泄露问题）
  - 修复 `sanitizeForLogging()` 将 `?key=SECRET` 错误替换为 `SECRET=***` 的问题
  - 现在正确替换为 `?key=***`
- **Security**: 扩展 `ModelAPIError.details` 支持数组递归脱敏
- **Code Quality**: 清理 Gemini adapter 中的死代码

### Tests
- 新增 Gemini adapter 单元测试（10 个测试用例）
- 新增 Logger 脱敏功能测试（17 个测试用例）
- 总测试覆盖从 41 个增加到 68 个

### Documentation
- 更新 README.md 添加 Gemini provider 文档
- 完善 Gemini 开发文档和审查报告

## [1.0.0] - 2025-xx-xx

### Added
- 初始版本发布
- 支持 GLM-4.6V、SiliconFlow、ModelScope、OpenAI、Claude 等视觉模型
- MCP 工具：analyze_image、list_templates、get_config
- 图片输入支持：URL、base64 data URL、本地文件路径
- 内置系统提示词模板
- Logger 自动脱敏 API Key
- Thinking/reasoning 内容过滤
