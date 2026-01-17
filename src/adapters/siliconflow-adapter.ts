/**
 * SiliconFlow Adapter
 *
 * @description SiliconFlow 模型适配器实现，支持多种视觉模型（Qwen2-VL、InternVL 等）
 */

import { BaseVisionModelAdapter } from './base-adapter.js';
import { ModelConfig } from '../config/model-config.js';
import { ModelAPIError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { VisionModelResponse } from './base-adapter.js';

export interface SiliconFlowAdapterOptions {
  detail?: 'low' | 'high' | 'auto';
  maxTokens?: number;
  temperature?: number;
}

export class SiliconFlowAdapter extends BaseVisionModelAdapter {
  private options: SiliconFlowAdapterOptions;

  constructor(config: ModelConfig, options: SiliconFlowAdapterOptions = {}) {
    super(config);

    if (config.type !== 'siliconflow') {
      throw new Error('Invalid model type. Expected: siliconflow');
    }

    this.options = {
      detail: 'auto',
      maxTokens: 2048,
      temperature: 0.7,
      ...options
    };

    logger.info('Initialized SiliconFlow adapter', {
      model: config.name,
      baseUrl: config.baseUrl,
      options: this.options
    });
  }

  async analyze(imageData: string, prompt: string): Promise<string> {
    logger.logRequest('Analyzing image with SiliconFlow', {
      modelType: 'siliconflow',
      model: this.config.name,
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callSiliconFlowAPI(imageData, prompt, signal);

        logger.logRequest('SiliconFlow analysis completed', {
          modelType: 'siliconflow',
          model: this.config.name,
          responseLength: response.content.length
        });

        return response.content;
      });
    } catch (error) {
      logger.error('SiliconFlow analysis failed', error);
      throw error;
    }
  }

  async analyzeWithResponse(imageData: string, prompt: string): Promise<VisionModelResponse> {
    logger.logRequest('Analyzing image with SiliconFlow (full response)', {
      modelType: 'siliconflow',
      model: this.config.name,
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callSiliconFlowAPI(imageData, prompt, signal);

        logger.logRequest('SiliconFlow analysis completed', {
          modelType: 'siliconflow',
          model: this.config.name,
          responseLength: response.content.length,
          usage: response.usage
        });

        return response;
      });
    } catch (error) {
      logger.error('SiliconFlow analysis failed', error);
      throw error;
    }
  }

  private async callSiliconFlowAPI(imageData: string, prompt: string, signal: AbortSignal): Promise<VisionModelResponse> {
    // 构建请求 URL
    const apiUrl = `${this.config.baseUrl}/chat/completions`;

    // 构建请求体（OpenAI 兼容格式）
    const requestBody = {
      model: this.config.name,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageData,
                detail: this.options.detail || 'auto'
              }
            }
          ]
        }
      ],
      stream: false,  // 显式禁用流式响应
      max_tokens: this.options.maxTokens,
      temperature: this.options.temperature
    };

    logger.debug('Calling SiliconFlow API', {
      apiUrl,
      model: this.config.name,
      detail: this.options.detail,
      maxTokens: this.options.maxTokens,
      temperature: this.options.temperature
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Failed to get error details');

      // Special handling for rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterText = retryAfter ? `Retry after ${retryAfter}s. ` : '';

        throw new ModelAPIError(
          `Rate limit exceeded (429). ${retryAfterText}Please check your API quota or wait before retrying.`,
          {
            status: response.status,
            statusText: response.statusText,
            errorDetails: errorText,
            endpoint: apiUrl,
            retryAfter: retryAfter,
            guidance: 'Check your API quota or wait before retrying'
          }
        );
      }

      // Handle other errors normally
      throw new ModelAPIError(
        `SiliconFlow API request failed: ${response.status} ${response.statusText}`,
        {
          status: response.status,
          statusText: response.statusText,
          errorDetails: errorText,
          endpoint: apiUrl
        }
      );
    }

    const responseData = await response.json();

    return this.parseResponse(responseData, 'siliconflow');
  }
}
