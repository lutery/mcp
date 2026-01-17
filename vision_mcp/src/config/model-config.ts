/**
 * Model Configuration Manager
 *
 * @description 管理视觉模型的配置，从环境变量加载
 */

import { ModelConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { registry } from '../providers/provider-registry.js';

export interface ModelConfig {
  type: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  thinking?: { type: 'enabled' | 'disabled' };
}

export interface ModelDefaults {
  baseUrl: string;
  modelName: string;
  timeout: number;
  maxRetries: number;
}

/**
 * 从环境变量加载模型配置
 */
export function loadModelConfig(): ModelConfig {
  try {
    // 加载模型类型
    const type = process.env.VISION_MODEL_TYPE;
    if (!type) {
      throw new ModelConfigError(
        'Missing VISION_MODEL_TYPE environment variable'
      );
    }

    if (!registry.has(type)) {
      const supportedTypes = registry.getSupportedTypes().join(', ');
      throw new ModelConfigError(
        `Unsupported model type: ${type}. Supported types: ${supportedTypes}`
      );
    }

    const provider = registry.get(type)!;
    const defaults = provider.defaults;

    // 加载必要配置
    const name = process.env.VISION_MODEL_NAME || defaults.modelName;
    const baseUrl = process.env.VISION_API_BASE_URL || defaults.baseUrl;
    const apiKey = process.env.VISION_API_KEY;

    if (!apiKey) {
      throw new ModelConfigError(
        'Missing VISION_API_KEY environment variable'
      );
    }

    // 验证 API Key 格式
    if (provider.validateApiKey) {
      const validation = provider.validateApiKey(apiKey);
      if (validation !== true) {
        logger.warn(validation as string, { modelType: type });
      }
    }

    // 加载可选配置
    const timeout = process.env.VISION_API_TIMEOUT
      ? parseInt(process.env.VISION_API_TIMEOUT, 10)
      : defaults.timeout;

    const maxRetries = process.env.VISION_MAX_RETRIES
      ? parseInt(process.env.VISION_MAX_RETRIES, 10)
      : defaults.maxRetries;

    const config: ModelConfig = {
      type,
      name,
      baseUrl: baseUrl.replace(/\/$/, ''), // 移除末尾的 /
      apiKey,
      timeout,
      maxRetries,
      thinking: provider.enableThinking ? { type: 'enabled' } : undefined
    };

    logger.info('Model configuration loaded successfully', {
      modelType: type,
      modelName: name,
      baseUrl: config.baseUrl,
      provider: provider.displayName
    });

    return config;
  } catch (error) {
    logger.error('Failed to load model configuration', error as Error);
    throw error;
  }
}

/**
 * 验证模型配置
 */
export function validateModelConfig(config: ModelConfig): boolean {
  try {
    const errors: string[] = [];

    if (!config.name || typeof config.name !== 'string') {
      errors.push('Model name is required');
    }

    if (!config.baseUrl || typeof config.baseUrl !== 'string') {
      errors.push('Base URL is required');
    }

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      errors.push('API Key is required');
    }

    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      errors.push('Timeout must be a positive number');
    }

    if (typeof config.maxRetries !== 'number' || config.maxRetries < 0) {
      errors.push('Max retries must be a non-negative number');
    }

    if (errors.length > 0) {
      throw new ModelConfigError(errors.join('; '));
    }

    return true;
  } catch (error) {
    logger.error('Model configuration validation failed', error as Error);
    throw error;
  }
}

/**
 * 脱敏显示 API Key
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length <= 8) {
    return '***';
  }

  const visible = Math.min(4, Math.floor(apiKey.length / 4));
  return `${apiKey.substring(0, visible)}${'*'.repeat(Math.max(1, apiKey.length - visible * 2))}${apiKey.substring(apiKey.length - visible)}`;
}

/**
 * 获取模型的显示信息（用于日志）
 */
export function getModelDisplayInfo(config: ModelConfig): string {
  return `${config.type} - ${config.name} (API Key: ${maskApiKey(config.apiKey)})`;
}
