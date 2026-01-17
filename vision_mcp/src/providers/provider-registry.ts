/**
 * Provider Registry
 *
 * @description 提供方注册表，集中管理所有支持的模型提供商
 * 添加新提供商只需在这里注册，无需修改其他文件
 */

import { ModelConfig } from '../config/model-config.js';
import { VisionModelAdapter } from '../adapters/base-adapter.js';
import { ThinkingExtractor, extractGLMThinking, extractOpenAIThinking, extractClaudeThinking, extractGeminiThinking } from '../utils/thinking-extractors.js';
import { GLM4VisionAdapter } from '../adapters/glm-adapter.js';
import { SiliconFlowAdapter } from '../adapters/siliconflow-adapter.js';
import { ModelScopeAdapter } from '../adapters/modelscope-adapter.js';
import { OpenAIAdapter } from '../adapters/openai-adapter.js';
import { ClaudeAdapter } from '../adapters/claude-adapter.js';
import { GeminiAdapter } from '../adapters/gemini-adapter.js';

/**
 * 提供商定义接口
 */
export interface ProviderDefinition {
  /** 提供商类型标识 */
  type: string;
  /** 显示名称 */
  displayName: string;
  /** 默认配置 */
  defaults: {
    baseUrl: string;
    modelName: string;
    timeout: number;
    maxRetries: number;
  };
  /** API Key 验证函数 */
  validateApiKey?: (apiKey: string) => boolean | string;
  /** 适配器工厂函数 */
  createAdapter: (config: ModelConfig) => VisionModelAdapter;
  /** Thinking 提取器 */
  thinkingExtractor: ThinkingExtractor;
  /** 是否启用 thinking */
  enableThinking?: boolean;
}

/**
 * 提供商注册表
 */
class ProviderRegistry {
  private providers = new Map<string, ProviderDefinition>();

  /**
   * 注册提供商
   */
  public register(provider: ProviderDefinition): void {
    this.providers.set(provider.type, provider);
  }

  /**
   * 获取提供商
   */
  public get(type: string): ProviderDefinition | undefined {
    return this.providers.get(type);
  }

  /**
   * 检查是否支持该类型
   */
  public has(type: string): boolean {
    return this.providers.has(type);
  }

  /**
   * 获取所有支持的类型
   */
  public getSupportedTypes(): string[] {
    return Array.from(this.providers.keys());
  }
}

// 创建全局注册表实例
export const registry = new ProviderRegistry();

// ========================================================================
// 注册内置提供商
// ========================================================================

// GLM-4.6V Provider
registry.register({
  type: 'glm',
  displayName: 'GLM-4.6V',
  defaults: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelName: 'glm-4.6v',
    timeout: 60000,
    maxRetries: 2
  },
  validateApiKey: (apiKey: string) => {
    if (!apiKey.includes('.')) {
      return 'GLM API Key should contain a dot (.)';
    }
    return true;
  },
  createAdapter: (config) => new GLM4VisionAdapter(config),
  thinkingExtractor: extractGLMThinking,
  enableThinking: true
});

// SiliconFlow Provider
registry.register({
  type: 'siliconflow',
  displayName: 'SiliconFlow',
  defaults: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    modelName: 'Qwen/Qwen2-VL-72B-Instruct',
    timeout: 60000,
    maxRetries: 2
  },
  validateApiKey: (apiKey: string) => {
    if (!apiKey.startsWith('sk-')) {
      return 'SiliconFlow API Key should start with "sk-"';
    }
    return true;
  },
  createAdapter: (config) => new SiliconFlowAdapter(config),
  thinkingExtractor: extractOpenAIThinking,
  enableThinking: false
});

// ModelScope Provider
registry.register({
  type: 'modelscope',
  displayName: 'ModelScope API-Inference',
  defaults: {
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    modelName: 'ZhipuAI/GLM-4.6V',
    timeout: 60000,
    maxRetries: 2
  },
  validateApiKey: (apiKey: string) => {
    if (!apiKey.startsWith('ms-')) {
      return 'ModelScope API Key should start with "ms-"';
    }
    return true;
  },
  createAdapter: (config) => new ModelScopeAdapter(config),
  thinkingExtractor: extractOpenAIThinking,
  enableThinking: false
});

// OpenAI Provider
registry.register({
  type: 'openai',
  displayName: 'OpenAI',
  defaults: {
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o',
    timeout: 60000,
    maxRetries: 2
  },
  validateApiKey: (apiKey: string) => {
    if (!apiKey.startsWith('sk-')) {
      return 'OpenAI API Key should start with "sk-"';
    }
    return true;
  },
  createAdapter: (config) => new OpenAIAdapter(config),
  thinkingExtractor: extractOpenAIThinking,
  enableThinking: false
});

// Claude (Anthropic Messages API) Provider
registry.register({
  type: 'claude',
  displayName: 'Anthropic Claude',
  defaults: {
    baseUrl: 'https://api.anthropic.com',
    modelName: 'claude-3-5-sonnet-20241022',
    timeout: 60000,
    maxRetries: 2
  },
  validateApiKey: (apiKey: string) => {
    // Claude API key format: sk-ant-...
    // Not strictly enforcing as some providers may use different formats
    if (!apiKey.startsWith('sk-ant-')) {
      return 'Claude API Key typically starts with "sk-ant-". Proxy providers may use different formats.';
    }
    return true;
  },
  createAdapter: (config) => new ClaudeAdapter(config),
  thinkingExtractor: extractClaudeThinking,
  enableThinking: false
});

// Gemini (Google generateContent API) Provider
registry.register({
  type: 'gemini',
  displayName: 'Google Gemini',
  defaults: {
    baseUrl: 'https://generativelanguage.googleapis.com',
    modelName: 'gemini-2.0-flash-exp',
    timeout: 60000,
    maxRetries: 2
  },
  validateApiKey: (apiKey: string) => {
    // Gemini API key validation - should be at least 10 characters
    if (apiKey.length < 10) {
      return 'Gemini API Key should be at least 10 characters';
    }
    return true;
  },
  createAdapter: (config) => new GeminiAdapter(config),
  thinkingExtractor: extractGeminiThinking,
  enableThinking: false
});
