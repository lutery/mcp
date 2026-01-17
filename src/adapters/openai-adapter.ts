/**
 * OpenAI Adapter
 *
 * @description OpenAI API 适配器实现，支持 GPT-4o、GPT-4 Vision 等视觉模型
 */

import { BaseVisionModelAdapter } from './base-adapter.js';
import { ModelConfig } from '../config/model-config.js';
import { ModelAPIError, ModelConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { VisionModelResponse } from './base-adapter.js';

export interface OpenAIAdapterOptions {
  maxTokens?: number;
  temperature?: number;
}

export class OpenAIAdapter extends BaseVisionModelAdapter {
  private options: OpenAIAdapterOptions;

  constructor(config: ModelConfig, options: OpenAIAdapterOptions = {}) {
    super(config);

    if (config.type !== 'openai') {
      throw new ModelConfigError(
        'Invalid model type. Expected: openai',
        { expected: 'openai', received: config.type }
      );
    }

    this.options = {
      maxTokens: 2048,
      temperature: 0.7,
      ...options
    };

    logger.info('Initialized OpenAI adapter', {
      model: config.name,
      baseUrl: config.baseUrl,
      options: this.options
    });
  }

  async analyze(imageData: string, prompt: string): Promise<string> {
    logger.logRequest('Analyzing image with OpenAI', {
      modelType: 'openai',
      model: this.config.name,
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callOpenAIAPI(imageData, prompt, signal);

        logger.logRequest('OpenAI analysis completed', {
          modelType: 'openai',
          model: this.config.name,
          responseLength: response.content.length
        });

        return response.content;
      });
    } catch (error) {
      logger.error('OpenAI analysis failed', error);
      throw error;
    }
  }

  async analyzeWithResponse(imageData: string, prompt: string): Promise<VisionModelResponse> {
    logger.logRequest('Analyzing image with OpenAI (full response)', {
      modelType: 'openai',
      model: this.config.name,
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callOpenAIAPI(imageData, prompt, signal);

        logger.logRequest('OpenAI analysis completed', {
          modelType: 'openai',
          model: this.config.name,
          responseLength: response.content.length,
          usage: response.usage
        });

        return response;
      });
    } catch (error) {
      logger.error('OpenAI analysis failed', error);
      throw error;
    }
  }

  private async callOpenAIAPI(imageData: string, prompt: string, signal: AbortSignal): Promise<VisionModelResponse> {
    // 构建 API 端点（移除末尾斜杠后添加 /chat/completions）
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/chat/completions`;

    // 构建请求体（OpenAI Chat Completions 格式）
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
      stream: false,  // 强制非流式响应

      // 注意：使用 max_tokens 参数
      // - 适用于 gpt-4o、gpt-4-vision-preview 等主流模型
      // - 对于 reasoning/o 系列模型，可能需要使用 max_completion_tokens
      // - 未来可根据模型名称动态选择参数
      max_tokens: this.options.maxTokens,
      temperature: this.options.temperature
    };

    logger.debug('Calling OpenAI API', {
      apiUrl,
      model: this.config.name,
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
      const rawErrorText = await response.text().catch(() => 'Failed to get error details');

      // 截断过长的错误信息（最多 500 字符）
      const MAX_ERROR_LENGTH = 500;
      const errorText = rawErrorText.length > MAX_ERROR_LENGTH
        ? `${rawErrorText.slice(0, MAX_ERROR_LENGTH)}... (truncated)`
        : rawErrorText;

      // 尝试解析 OpenAI 标准错误格式
      let errorMessage = `OpenAI API request failed: ${response.status} ${response.statusText}`;
      let errorCode: string | undefined;
      let guidance: string | undefined;

      try {
        const errorJson = JSON.parse(rawErrorText);
        if (errorJson.error) {
          errorMessage = errorJson.error.message || errorMessage;
          errorCode = errorJson.error.code;
          guidance = errorJson.error.type;
        }
      } catch {
        // 不是 JSON 格式，使用原始文本
      }

      // 特殊处理 429 限流
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const retryAfterText = retryAfter ? `Retry after ${retryAfter}s. ` : '';

        throw new ModelAPIError(
          `Rate limit exceeded (429). ${retryAfterText}Please check your API quota or wait before retrying.`,
          {
            status: response.status,
            statusText: response.statusText,
            errorCode,
            errorDetails: errorText,
            endpoint: apiUrl,
            retryAfter: retryAfter,
            guidance: guidance || 'Check your API quota or wait before retrying'
          }
        );
      }

      // 其他错误
      throw new ModelAPIError(errorMessage, {
        status: response.status,
        statusText: response.statusText,
        errorCode,
        errorDetails: errorText,
        endpoint: apiUrl,
        guidance
      });
    }

    // JSON 解析带兜底处理
    let responseData: unknown;
    const rawText = await response.text();

    try {
      responseData = JSON.parse(rawText);
    } catch (parseError) {
      // 截断原始响应体用于诊断（最多 500 字符）
      const truncatedBody = rawText.slice(0, 500);
      const bodyPreview = rawText.length > 500
        ? `${truncatedBody}... (truncated, total length: ${rawText.length})`
        : rawText;

      logger.error('Failed to parse successful response as JSON', parseError, {
        contentType: response.headers.get('content-type'),
        bodyLength: rawText.length,
        bodyPreview
      });

      throw new ModelAPIError(
        'Invalid JSON response from successful request',
        {
          status: response.status,
          statusText: response.statusText,
          endpoint: apiUrl,
          errorDetails: bodyPreview,
          parseError: parseError instanceof Error ? parseError.message : String(parseError)
        }
      );
    }

    return this.parseResponse(responseData, 'openai');
  }
}
