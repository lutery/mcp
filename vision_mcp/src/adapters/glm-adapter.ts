/**
 * GLM-4.6V Adapter
 *
 * @description GLM-4.6V 模型适配器实现，支持智谱 AI 开放平台的视觉模型
 */

import { BaseVisionModelAdapter } from './base-adapter.js';
import { ModelConfig } from '../config/model-config.js';
import { ModelAPIError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { VisionModelResponse } from './base-adapter.js';

export class GLM4VisionAdapter extends BaseVisionModelAdapter {
  constructor(config: ModelConfig) {
    super(config);

    if (config.type !== 'glm') {
      throw new Error('Invalid model type. Expected: glm');
    }

    logger.info('Initialized GLM-4.6V adapter', {
      model: config.name,
      baseUrl: config.baseUrl
    });
  }

  async analyze(imageData: string, prompt: string): Promise<string> {
    logger.logRequest('Analyzing image with GLM-4.6V', {
      modelType: 'glm',
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callGLMAPI(imageData, prompt, signal);

        logger.logRequest('GLM-4.6V analysis completed', {
          modelType: 'glm',
          responseLength: response.content.length
        });

        return response.content;
      });
    } catch (error) {
      logger.error('GLM-4.6V analysis failed', error);
      throw error;
    }
  }

  async analyzeWithResponse(imageData: string, prompt: string): Promise<VisionModelResponse> {
    logger.logRequest('Analyzing image with GLM-4.6V (full response)', {
      modelType: 'glm',
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callGLMAPI(imageData, prompt, signal);

        logger.logRequest('GLM-4.6V analysis completed', {
          modelType: 'glm',
          responseLength: response.content.length,
          usage: response.usage
        });

        return response;
      });
    } catch (error) {
      logger.error('GLM-4.6V analysis failed', error);
      throw error;
    }
  }

  private async callGLMAPI(imageData: string, prompt: string, signal: AbortSignal): Promise<VisionModelResponse> {
    // 构建请求 URL
    const apiUrl = `${this.config.baseUrl}/chat/completions`;

    // 构建请求体
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
                url: imageData
              }
            }
          ]
        }
      ],
      stream: false,  // 显式禁用流式响应
      ...(this.config.thinking && {
        thinking: this.config.thinking
      })
    };

    logger.debug('Calling GLM-4.6V API', {
      apiUrl,
      model: this.config.name,
      hasThinking: !!this.config.thinking
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
        `GLM API request failed: ${response.status} ${response.statusText}`,
        {
          status: response.status,
          statusText: response.statusText,
          errorDetails: errorText,
          endpoint: apiUrl
        }
      );
    }

    const responseData = await response.json();

    return this.parseResponse(responseData, 'glm');
  }
}
