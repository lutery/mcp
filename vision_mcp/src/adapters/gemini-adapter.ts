/**
 * Gemini Adapter
 *
 * @description Gemini generateContent API 适配器实现，支持 Google Gemini 多模态视觉模型
 * @see https://ai.google.dev/api/rest/v1beta/models/generateContent
 */

import { BaseVisionModelAdapter, VisionModelResponse } from './base-adapter.js';
import { ModelConfig } from '../config/model-config.js';
import { ModelAPIError, ModelConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { parseDataUrl } from '../utils/data-url-parser.js';
import { filterThinkingContent } from '../utils/thinking-filter.js';

export interface GeminiAdapterOptions {
  apiVersion?: string;           // v1beta | v1
  authMode?: 'bearer' | 'x-goog' | 'query';
  imagePartMode?: 'inline_data' | 'inline_bytes';
  maxTokens?: number;
}

// Supported MIME types for images
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const DOWNLOAD_TIMEOUT = 30000; // 30 seconds

export class GeminiAdapter extends BaseVisionModelAdapter {
  private options: Required<GeminiAdapterOptions>;

  constructor(config: ModelConfig, options: GeminiAdapterOptions = {}) {
    super(config);

    if (config.type !== 'gemini') {
      throw new ModelConfigError(
        'Invalid model type. Expected: gemini',
        { expected: 'gemini', received: config.type }
      );
    }

    this.options = {
      maxTokens: options.maxTokens || 2048,
      apiVersion: options.apiVersion ||
        process.env.VISION_GEMINI_API_VERSION ||
        'v1beta',
      authMode: options.authMode || 'x-goog',
      imagePartMode: options.imagePartMode ||
        (process.env.VISION_GEMINI_IMAGE_PART_MODE as 'inline_data' | 'inline_bytes') ||
        'inline_data'
    };

    logger.info('Initialized Gemini adapter', {
      model: config.name,
      baseUrl: config.baseUrl,
      apiVersion: this.options.apiVersion,
      authMode: this.options.authMode,
      imagePartMode: this.options.imagePartMode
    });
  }

  async analyze(imageData: string, prompt: string): Promise<string> {
    logger.logRequest('Analyzing image with Gemini', {
      modelType: 'gemini',
      model: this.config.name,
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callGeminiAPI(imageData, prompt, signal);

        logger.logRequest('Gemini analysis completed', {
          modelType: 'gemini',
          model: this.config.name,
          responseLength: response.content.length
        });

        return response.content;
      });
    } catch (error) {
      logger.error('Gemini analysis failed', error);
      throw error;
    }
  }

  async analyzeWithResponse(imageData: string, prompt: string): Promise<VisionModelResponse> {
    logger.logRequest('Analyzing image with Gemini (full response)', {
      modelType: 'gemini',
      model: this.config.name,
      imageLength: imageData.length
    });

    try {
      return await this.withRetry(async (signal) => {
        const response = await this.callGeminiAPI(imageData, prompt, signal);

        logger.logRequest('Gemini analysis completed', {
          modelType: 'gemini',
          model: this.config.name,
          responseLength: response.content.length,
          usage: response.usage
        });

        return response;
      });
    } catch (error) {
      logger.error('Gemini analysis failed', error);
      throw error;
    }
  }

  private async callGeminiAPI(
    imageData: string,
    prompt: string,
    signal: AbortSignal
  ): Promise<VisionModelResponse> {
    const apiUrl = this.buildApiUrl();
    const requestBody = await this.buildRequest(imageData, prompt);
    const headers = this.buildAuthHeaders();

    logger.debug('Calling Gemini generateContent API', {
      endpoint: this.sanitizeUrl(apiUrl),
      model: this.config.name,
      hasImage: !!imageData,
      imagePartMode: this.options.imagePartMode
    });

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(requestBody),
        signal
      });

      // Handle error responses
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      // Parse response
      const responseData = await this.parseResponseData(response);

      // Normalize response
      return this.normalizeResponse(responseData);
    } catch (error) {
      // Re-throw if it's our error
      if (error instanceof ModelAPIError) {
        throw error;
      }

      // Handle AbortError
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ModelAPIError('Request timed out', {
          timeout: this.config.timeout || 60000,
          reason: 'API request exceeded timeout'
        });
      }

      throw error;
    }
  }

  /**
   * 构建 API URL
   * Format: {baseUrl}/{apiVersion}/models/{model}:generateContent
   */
  private buildApiUrl(): string {
    let baseUrl = this.config.baseUrl.replace(/\/$/, '');

    // Build URL based on auth mode
    let url = `${baseUrl}/${this.options.apiVersion}/models/${this.config.name}:generateContent`;

    // For query auth mode, append API key to URL
    if (this.options.authMode === 'query') {
      url += `?key=${this.config.apiKey}`;
    }

    return url;
  }

  /**
   * 构建认证头
   */
  private buildAuthHeaders(): Record<string, string> {
    if (this.options.authMode === 'bearer') {
      return {
        'Authorization': `Bearer ${this.config.apiKey}`
      };
    } else if (this.options.authMode === 'x-goog') {
      return {
        'x-goog-api-key': this.config.apiKey
      };
    }
    // query mode - no headers needed
    return {};
  }

  /**
   * 构建请求体
   */
  private async buildRequest(imageData: string, prompt: string): Promise<any> {
    const imagePart = await this.buildImagePart(imageData);

    return {
      contents: [
        {
          role: 'user',
          parts: [
            imagePart,
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: this.options.maxTokens
      }
    };
  }

  /**
   * 构建图片 part
   * 支持三种输入格式：
   * 1. HTTP(S) URL - 下载并转换为 base64
   * 2. Data URL - 直接解析
   * 3. Base64 字符串 - 假设为图片
   */
  private async buildImagePart(imageData: string): Promise<any> {
    // Check if it's an HTTP(S) URL
    if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
      logger.debug('Image is a URL, downloading...', { url: imageData });
      const { mimeType, data } = await this.downloadImageAsBase64(imageData);
      return this.createInlineDataPart(mimeType, data);
    }

    // Check if it's a data URL
    if (imageData.startsWith('data:')) {
      const parsed = parseDataUrl(imageData);
      return this.createInlineDataPart(parsed.mimeType, parsed.data);
    }

    // Assume it's already base64 data
    // Default to PNG if no type info
    return this.createInlineDataPart('image/png', imageData);
  }

  /**
   * 创建 inline_data part
   */
  private createInlineDataPart(mimeType: string, data: string): any {
    if (this.options.imagePartMode === 'inline_bytes') {
      // Proxy/legacy format
      return {
        mime_type: mimeType,
        inline_bytes: data
      };
    }
    // Official format
    return {
      inline_data: {
        mime_type: mimeType,
        data: data
      }
    };
  }

  /**
   * 脱敏 URL 用于日志记录（移除敏感的查询参数）
   * @param url - 原始 URL
   * @returns 脱敏后的 URL（query 模式下的 key 会被替换为 ***）
   */
  private sanitizeUrl(url: string): string {
    if (this.options.authMode === 'query') {
      return url.replace(/\?key=([^&\s]+)/, '?key=***');
    }
    return url;
  }

  /**
   * 下载图片并转换为 base64
   * Gemini 不支持直接的 URL 输入，必须先下载
   */
  private async downloadImageAsBase64(url: string): Promise<{ mimeType: string; data: string }> {
    logger.debug('Downloading image from URL', { url });

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT)
      });

      if (!response.ok) {
        throw new ModelAPIError(
          `Failed to download image: ${response.status} ${response.statusText}`,
          { url, status: response.status }
        );
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_SIZE) {
        throw new ModelAPIError(
          `Image too large: ${contentLength} bytes (max: ${MAX_DOWNLOAD_SIZE})`,
          { url, size: contentLength, maxSize: MAX_DOWNLOAD_SIZE }
        );
      }

      // Get MIME type from Content-Type header
      const contentType = response.headers.get('content-type') || 'image/png';
      const mimeType = contentType.split(';')[0].trim();

      // Validate MIME type
      if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
        throw new ModelAPIError(
          `Unsupported image type: ${mimeType}. Supported types: ${Array.from(SUPPORTED_IMAGE_TYPES).join(', ')}`,
          { url, mimeType, supportedTypes: Array.from(SUPPORTED_IMAGE_TYPES) }
        );
      }

      // Read and convert to base64
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Check size after download
      if (buffer.length > MAX_DOWNLOAD_SIZE) {
        throw new ModelAPIError(
          `Downloaded image too large: ${buffer.length} bytes (max: ${MAX_DOWNLOAD_SIZE})`,
          { url, size: buffer.length, maxSize: MAX_DOWNLOAD_SIZE }
        );
      }

      const base64 = buffer.toString('base64');

      logger.debug('Image downloaded successfully', {
        url,
        mimeType,
        size: buffer.length
      });

      return { mimeType, data: base64 };
    } catch (error) {
      if (error instanceof ModelAPIError) {
        throw error;
      }

      throw new ModelAPIError(
        `Failed to download image from URL: ${url}`,
        { url, error: error instanceof Error ? error.message : String(error) },
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * 处理错误响应
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;

    let errorDetails: Record<string, any> = { status };

    try {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails.error = errorJson;
      } catch {
        errorDetails.errorText = errorText.slice(0, 500);
      }
    } catch {
      // Unable to read response body
    }

    // Special handling for 429
    if (status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new ModelAPIError(
        `Rate limit exceeded (429).${retryAfter ? ` Retry after ${retryAfter}s` : ''}`,
        errorDetails
      );
    }

    throw new ModelAPIError(
      `Gemini API request failed: ${status}`,
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

        logger.error('Failed to parse Gemini response as JSON', parseError, {
          contentType,
          bodyLength: rawText.length,
          bodyPreview
        });

        throw new ModelAPIError('Failed to parse Gemini response as JSON', {
          contentType,
          bodyLength: rawText.length,
          bodyPreview
        }, parseError);
      }
    } catch (error) {
      if (error instanceof ModelAPIError) {
        throw error;
      }
      throw new ModelAPIError('Failed to read Gemini response', { contentType }, error);
    }
  }

  /**
   * 归一化 Gemini 响应为 VisionModelResponse
   * 支持两种响应格式：
   * 1. 官方格式: candidates[0].content.parts[].text
   * 2. 代理格式: candidates[0].output.parts[].text
   */
  private normalizeResponse(geminiResponse: any): VisionModelResponse {
    const candidate = geminiResponse?.candidates?.[0];

    if (!candidate) {
      throw new ModelAPIError('No candidates in Gemini response', {
        response: geminiResponse
      });
    }

    // Try both response formats
    const parts = candidate?.content?.parts || candidate?.output?.parts || [];

    if (!parts || parts.length === 0) {
      throw new ModelAPIError('No parts in Gemini response', {
        response: geminiResponse
      });
    }

    // Extract all text parts
    const textParts = parts
      .filter((part: any) => part?.text)
      .map((part: any) => part.text);

    const content = textParts.join('\n\n');

    if (!content) {
      throw new ModelAPIError('Empty content in Gemini response', {
        response: geminiResponse
      });
    }

    // Filter thinking/reasoning content
    let filteredContent: string;
    try {
      filteredContent = filterThinkingContent(
        geminiResponse,
        'gemini'
      );

      if (filteredContent.length < content.length) {
        logger.debug('Filtered thinking content from Gemini response', {
          originalLength: content.length,
          filteredLength: filteredContent.length,
          reduction: content.length - filteredContent.length
        });
      }
    } catch (error) {
      logger.warn('Failed to filter thinking content from Gemini response', {
        error: error instanceof Error ? error.message : error
      });
      filteredContent = content;
    }

    // Map usage metadata
    const usageMetadata = geminiResponse?.usageMetadata || geminiResponse?.usage;
    const usage = usageMetadata ? {
      promptTokens: usageMetadata.promptTokenCount || usageMetadata.inputTokens,
      completionTokens: usageMetadata.candidatesTokenCount || usageMetadata.outputTokens,
      totalTokens: usageMetadata.totalTokens || (
        (usageMetadata.promptTokenCount || usageMetadata.inputTokens || 0) +
        (usageMetadata.candidatesTokenCount || usageMetadata.outputTokens || 0)
      )
    } : undefined;

    return {
      content: filteredContent,
      usage,
      model: geminiResponse?.modelVersion || this.config.name
    };
  }
}
