/**
 * Base Vision Model Adapter
 *
 * @description 定义模型适配器的统一接口和抽象基类
 */

import { ModelConfig } from '../config/model-config.js';
import { ModelAPIError, TimeoutError, VisionMCPError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { filterThinkingContent } from '../utils/thinking-filter.js';

/**
 * 模型响应接口
 */
export interface VisionModelResponse {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  model?: string;
}

/**
 * 模型适配器接口
 */
export interface VisionModelAdapter {
  config: ModelConfig;

  /**
   * 分析图片
   * @param imageData - 图片数据（URL 或 base64）
   * @param prompt - 提示词
   * @returns 模型响应
   */
  analyze(imageData: string, prompt: string): Promise<string>;

  /**
   * 分析图片（带完整响应）
   * @param imageData - 图片数据（URL 或 base64）
   * @param prompt - 提示词
   * @returns 完整响应
   */
  analyzeWithResponse(imageData: string, prompt: string): Promise<VisionModelResponse>;
}

/**
 * 抽象基类实现通用功能
 */
export abstract class BaseVisionModelAdapter implements VisionModelAdapter {
  constructor(public config: ModelConfig) {}

  abstract analyze(imageData: string, prompt: string): Promise<string>;
  abstract analyzeWithResponse(imageData: string, prompt: string): Promise<VisionModelResponse>;

  /**
   * 不可重试的 HTTP 状态码
   * 这些错误表示客户端配置问题，重试不会改变结果
   */
  private readonly NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

  /**
   * 带重试和超时控制的请求包装器
   *
   * @note 当前实现强制使用非流式响应（stream: false）。
   *       如果提供商只支持流式响应，需要添加流式解析器。
   */
  protected async withRetry<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    config: { maxRetries?: number; timeout?: number } = {}
  ): Promise<T> {
    const {
      maxRetries = this.config.maxRetries || 2,
      timeout = this.config.timeout || 60000
    } = config;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Attempt ${attempt + 1}/${maxRetries + 1}`);

        // 使用 AbortController 实现超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const result = await operation(controller.signal);
          clearTimeout(timeoutId);
          return result;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      } catch (error) {
        lastError = error as Error;

        // 如果是 AbortError，转换为 TimeoutError
        if (error instanceof Error && error.name === 'AbortError') {
          throw new TimeoutError(`Request timed out after ${timeout}ms`);
        }

        // 检查是否为不可重试错误（400/401/403/404）
        if (error instanceof ModelAPIError) {
          const status = (error.details as any)?.status;
          if (status && this.NON_RETRYABLE_STATUS_CODES.has(status)) {
            logger.error('Non-retryable error, failing immediately', {
              status,
              attempt: attempt + 1
            });
            throw error; // 直接抛出，不重试
          }
        }

        // 最后一次尝试失败，抛出错误
        if (attempt === maxRetries) {
          break;
        }

        // 计算退避时间（指数退避）
        const backoffTime = Math.min(1000 * Math.pow(2, attempt), 5000);
        logger.warn(`Attempt ${attempt + 1} failed, retrying in ${backoffTime}ms`, {
          error: lastError.message
        });

        // 等待后退时间
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }

    // 保留最后失败的完整错误详情（如果可用）
    let errorDetails: Record<string, any>;
    if (lastError !== undefined && lastError instanceof VisionMCPError && lastError.details) {
      // 如果是 VisionMCPError，保留所有 details
      errorDetails = {
        ...lastError.details,
        lastError: lastError.message
      };
    } else {
      // 否则只保留消息
      errorDetails = { lastError: lastError?.message };
    }

    throw new ModelAPIError(
      `Failed after ${maxRetries + 1} attempts`,
      errorDetails
    );
  }

  /**
   * 解析模型响应
   * @param response - 原始响应
   * @param modelType - 模型类型（必需，用于过滤 thinking content）
   */
  protected parseResponse(response: unknown, modelType: string): VisionModelResponse {
    // modelType is required
    if (!modelType) {
      throw new Error('modelType is required for parseResponse');
    }

    try {
      // @ts-ignore - 检查响应结构
      const content = response?.choices?.[0]?.message?.content;

      if (!content || typeof content !== 'string') {
        throw new ModelAPIError(
          'Invalid response format: missing or invalid content',
          { response }
        );
      }

      // 过滤 thinking/reasoning content（无条件执行）
      let filteredContent: string;
      try {
        filteredContent = filterThinkingContent(response, modelType);

        // 如果有 content 被过滤，记录日志
        if (filteredContent.length < content.length) {
          logger.debug('Filtered thinking content from response', {
            modelType,
            originalLength: content.length,
            filteredLength: filteredContent.length,
            reduction: content.length - filteredContent.length
          });
        }
      } catch (error) {
        logger.warn('Failed to filter thinking content, returning raw content', {
          modelType,
          error: error instanceof Error ? error.message : error
        });
        filteredContent = content;
      }

      return {
        content: filteredContent,
        // @ts-ignore
        usage: response?.usage,
        // @ts-ignore
        model: response?.model
      };
    } catch (error) {
      logger.error('Failed to parse model response', error);
      throw new ModelAPIError(
        'Failed to parse model response',
        { response },
        error
      );
    }
  }
}
