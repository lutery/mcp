/**
 * Vision Tool
 *
 * @description MCP 视觉分析工具，提供统一的图片分析接口
 */

import { z } from 'zod';
import { ModelConfig, loadModelConfig, validateModelConfig } from '../config/model-config.js';
import { VisionModelAdapter } from '../adapters/base-adapter.js';
import { normalizeImageInput, NormalizedImageInput } from '../utils/image-input.js';
import { InvalidInputError, ModelConfigError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { buildPrompt } from '../prompts/system.js';
import { registry } from '../providers/provider-registry.js';

/**
 * 工具参数 Schema
 */
export const VisionToolInputSchema = z.object({
  /**
   * 图片输入：支持 URL、base64(data URL) 或本地路径
   * @example "https://example.com/image.jpg"
   * @example "data:image/jpeg;base64,/9j/4AAQ..."
   * @example "/path/to/local/image.png"
   */
  image: z.string().describe('Image URL, base64 data URL, or local file path'),

  /**
   * 分析提示词：描述要执行的分析任务
   * @example "Describe this UI design and extract all components"
   * @example "Detect objects and provide their coordinates"
   * @example "Extract text using OCR"
   */
  prompt: z.string().describe('Analysis prompt describing the task'),

  /**
   * 输出格式：可选，指定为 "text" 或 "json"
   * @default "text"
   */
  output_format: z.enum(['text', 'json']).optional().default('text').describe('Output format preference'),

  /**
   * 系统提示词模板：可选，指定使用的模板
   * @default auto-detected based on prompt
   * @example "ui-analysis"
   * @example "object-detection"
   */
  template: z.string().optional().describe('System prompt template to use')
}).strict();

export type VisionToolInput = z.infer<typeof VisionToolInputSchema>;

/**
 * 工具响应格式
 */
export interface VisionToolResponse {
  content: string;
  format: 'text' | 'json';
  metadata: {
    modelType: string;
    modelName: string;
    imageFormat: string;
    processingTimeMs: number;
    imageSize: number;
  };
}

/**
 * 视觉工具类
 */
export class VisionTool {
  private modelConfig: ModelConfig;
  private adapter: VisionModelAdapter;

  constructor(config?: ModelConfig) {
    // 加载配置
    this.modelConfig = config || loadModelConfig();

    // 验证配置
    validateModelConfig(this.modelConfig);

    // 创建适配器
    this.adapter = this.createAdapter(this.modelConfig);

    logger.info('Vision tool initialized', {
      modelType: this.modelConfig.type,
      modelName: this.modelConfig.name
    });
  }

  /**
   * 创建模型适配器（使用 registry）
   */
  private createAdapter(config: ModelConfig): VisionModelAdapter {
    const provider = registry.get(config.type);
    if (!provider) {
      throw new ModelConfigError(`Unsupported model type: ${config.type}`);
    }

    return provider.createAdapter(config);
  }

  /**
   * 执行视觉分析
   */
  public async analyze(input: VisionToolInput): Promise<VisionToolResponse> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    logger.logRequest('Vision analysis started', {
      requestId,
      modelType: this.modelConfig.type,
      imageInputLength: input.image.length,
      hasTemplate: !!input.template
    });

    try {
      // 1. 规范化图片输入
      logger.debug('Normalizing image input', { requestId });
      const normalizedImage = await normalizeImageInput(input.image);

      logger.debug('Image normalized successfully', {
        requestId,
        type: normalizedImage.type,
        mimeType: normalizedImage.mimeType,
        dataLength: normalizedImage.dataUrl.length
      });

      // 2. 构建完整提示词
      logger.debug('Building prompt', { requestId });
      const fullPrompt = buildPrompt(input.template, input.prompt);

      logger.debug('Prompt built', {
        requestId,
        promptLength: fullPrompt.length,
        templateUsed: input.template || 'auto-detected'
      });

      // 3. 调用视觉模型
      logger.logRequest('Calling vision model', {
        requestId,
        modelType: this.modelConfig.type,
        modelName: this.modelConfig.name
      });

      const modelResponse = await this.adapter.analyzeWithResponse(
        normalizedImage.dataUrl,
        fullPrompt
      );

      // 4. 构建响应
      const response: VisionToolResponse = {
        content: modelResponse.content,
        format: input.output_format,
        metadata: {
          modelType: this.modelConfig.type,
          modelName: this.modelConfig.name,
          imageFormat: normalizedImage.mimeType,
          processingTimeMs: Date.now() - startTime,
          imageSize: normalizedImage.dataUrl.length
        }
      };

      logger.logRequest('Vision analysis completed', {
        requestId,
        processingTimeMs: response.metadata.processingTimeMs,
        outputLength: response.content.length
      });

      return response;
    } catch (error) {
      logger.error('Vision analysis failed', error as Error, {
        requestId,
        processingTimeMs: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * 构建元数据
   */
  private buildMetadata(normalizedImage: NormalizedImageInput, startTime: number) {
    return {
      modelType: this.modelConfig.type,
      modelName: this.modelConfig.name,
      imageFormat: normalizedImage.mimeType,
      processingTimeMs: Date.now() - startTime,
      imageSize: normalizedImage.dataUrl.length
    };
  }

  /**
   * 获取工具信息
   */
  public getToolInfo(): {
    modelConfig: ModelConfig;
  } {
    return {
      modelConfig: this.modelConfig
    };
  }
}

/**
 * 创建工具实例（单例模式）
 */
let toolInstance: VisionTool | undefined;

export function getVisionTool(config?: ModelConfig): VisionTool {
  if (!toolInstance) {
    toolInstance = new VisionTool(config);
  }
  return toolInstance;
}
