/**
 * Claude (Anthropic Messages API) Adapter
 *
 * @description Claude Messages API 适配器实现，支持 Claude 多模态视觉模型
 * @see https://docs.anthropic.com/claude/reference/messages-post
 */

import { BaseVisionModelAdapter, VisionModelResponse } from './base-adapter.js';
import { ModelConfig } from '../config/model-config.js';
import { ModelAPIError, ModelConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { parseDataUrl } from '../utils/data-url-parser.js';

export interface ClaudeAdapterOptions {
  maxTokens?: number;
  apiVersion?: string;
}

export class ClaudeAdapter extends BaseVisionModelAdapter {
  private options: Required<ClaudeAdapterOptions>;

  constructor(config: ModelConfig, options: ClaudeAdapterOptions = {}) {
    super(config);

    if (config.type !== 'claude') {
      throw new ModelConfigError(
        'Invalid model type. Expected: claude',
        { expected: 'claude', received: config.type }
      );
    }

    this.options = {
      maxTokens: options.maxTokens || 2048,
      apiVersion: options.apiVersion ||
        process.env.VISION_CLAUDE_API_VERSION ||
        '2023-06-01'
    };

    logger.info('Initialized Claude adapter', {
      model: config.name,
      baseUrl: config.baseUrl,
      apiVersion: this.options.apiVersion,
      options: this.options
    });
  }

  async analyze(imageData: string, prompt: string): Promise<string> {
    logger.logRequest('Analyzing image with Claude', {
      modelType: 'claude',
      model: this.config.name,
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callClaudeAPI(imageData, prompt, signal);

        logger.logRequest('Claude analysis completed', {
          modelType: 'claude',
          model: this.config.name,
          responseLength: response.content.length
        });

        return response.content;
      });
    } catch (error) {
      logger.error('Claude analysis failed', error);
      throw error;
    }
  }

  async analyzeWithResponse(imageData: string, prompt: string): Promise<VisionModelResponse> {
    logger.logRequest('Analyzing image with Claude (full response)', {
      modelType: 'claude',
      model: this.config.name,
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callClaudeAPI(imageData, prompt, signal);

        logger.logRequest('Claude analysis completed', {
          modelType: 'claude',
          model: this.config.name,
          responseLength: response.content.length,
          usage: response.usage
        });

        return response;
      });
    } catch (error) {
      logger.error('Claude analysis failed', error);
      throw error;
    }
  }

  private async callClaudeAPI(
    imageData: string,
    prompt: string,
    signal: AbortSignal
  ): Promise<VisionModelResponse> {
    // 构建请求 URL：{baseUrl}/v1/messages
    // 移除 baseUrl 末尾的 /v1（如果有），避免重复路径
    let baseUrl = this.config.baseUrl.replace(/\/$/, '');
    if (baseUrl.endsWith('/v1')) {
      baseUrl = baseUrl.slice(0, -3);
      logger.warn('Removed duplicate /v1 from baseUrl', {
        original: this.config.baseUrl,
        normalized: baseUrl
      });
    }

    const apiUrl = `${baseUrl}/v1/messages`;

    // 构建图片 content block
    const imageBlock = this.buildImageBlock(imageData);

    // 构建请求体（Claude Messages API 格式）
    const requestBody = {
      model: this.config.name,
      max_tokens: this.options.maxTokens,
      messages: [{
        role: 'user',
        content: [
          imageBlock,
          { type: 'text', text: prompt }
        ]
      }]
    };

    logger.debug('Calling Claude Messages API', {
      endpoint: apiUrl,
      model: this.config.name,
      hasImage: !!imageData
    });

    // 发起请求
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.options.apiVersion
      },
      body: JSON.stringify(requestBody),
      signal
    });

    // 处理错误响应
    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    // 解析响应
    const responseData = await this.parseResponseData(response);

    // 归一化响应
    return this.normalizeResponse(responseData);
  }

  /**
   * 构建图片 content block
   * 支持 URL 和 base64 data URL 两种格式
   */
  private buildImageBlock(imageData: string): { type: string; source: any } {
    // 判断是 URL 还是 data URL
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
      return {
        type: 'image',
        source: {
          type: 'url',
          url: imageData
        }
      };
    }

    // 解析 data URL
    const parsed = parseDataUrl(imageData);
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: parsed.mimeType,
        data: parsed.data
      }
    };
  }

  /**
   * 处理错误响应
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    const requestId = response.headers.get('request-id') || response.headers.get('x-request-id');

    let errorDetails: Record<string, any> = { status, requestId };

    try {
      const errorText = await response.text();
      // 尝试解析为 JSON
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error) {
          errorDetails.error = {
            type: errorJson.error?.type,
            message: errorJson.error?.message
          };
        }
      } catch {
        // 非 JSON 响应，截断存储
        errorDetails.errorText = errorText.slice(0, 500);
      }
    } catch {
      // 无法读取响应体
    }

    // 特殊处理 429
    if (status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new ModelAPIError(
        `Rate limit exceeded (429).${retryAfter ? ` Retry after ${retryAfter}s` : ''}`,
        errorDetails
      );
    }

    throw new ModelAPIError(
      `Claude API request failed: ${status}`,
      errorDetails
    );
  }

  /**
   * 解析响应数据
   */
  private async parseResponseData(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');

    try {
      const rawText = await response.text();

      try {
        return JSON.parse(rawText);
      } catch (parseError) {
        const bodyPreview = rawText.length > 500
          ? `${rawText.slice(0, 500)}... (truncated, total length: ${rawText.length})`
          : rawText;

        logger.error('Failed to parse Claude response as JSON', parseError, {
          contentType,
          bodyLength: rawText.length,
          bodyPreview
        });

        throw new ModelAPIError('Failed to parse Claude response as JSON', {
          contentType,
          bodyLength: rawText.length,
          bodyPreview
        }, parseError);
      }
    } catch (error) {
      if (error instanceof ModelAPIError) {
        throw error;
      }
      throw new ModelAPIError('Failed to read Claude response', { contentType }, error);
    }
  }

  /**
   * 归一化 Claude 响应为 VisionModelResponse
   * Claude 响应格式：{ content: [{type: "text", text: "..."}], usage: {...} }
   */
  private normalizeResponse(claudeResponse: any): VisionModelResponse {
    const contentBlocks = claudeResponse?.content || [];

    // 提取所有 text blocks 并拼接
    const textParts = contentBlocks
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => block?.text || '')
      .filter(Boolean);

    const content = textParts.join('\n\n');

    if (!content) {
      throw new ModelAPIError('Empty content in Claude response', {
        response: claudeResponse
      });
    }

    // 映射 usage 字段（Claude 使用 input_tokens/output_tokens）
    const claudeUsage = claudeResponse?.usage;
    const usage = claudeUsage ? {
      promptTokens: claudeUsage.input_tokens,
      completionTokens: claudeUsage.output_tokens,
      totalTokens: (claudeUsage.input_tokens || 0) + (claudeUsage.output_tokens || 0)
    } : undefined;

    return {
      content,
      usage,
      model: claudeResponse?.model
    };
  }
}
