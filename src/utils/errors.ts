/**
 * Vision MCP Error Types
 *
 * @description 统一错误处理系统，提供清晰的错误分类和信息
 */

export enum VisionMCPErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  MODEL_CONFIG_ERROR = 'MODEL_CONFIG_ERROR',
  IMAGE_LOAD_ERROR = 'IMAGE_LOAD_ERROR',
  MODEL_API_ERROR = 'MODEL_API_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface VisionMCPErrorOptions {
  message: string;
  code: VisionMCPErrorCode;
  details?: Record<string, any>;
  cause?: unknown;
}

export class VisionMCPError extends Error {
  public readonly code: VisionMCPErrorCode;
  public readonly details?: Record<string, any>;
  public readonly timestamp: Date;

  constructor({ message, code, details, cause }: VisionMCPErrorOptions) {
    super(message);
    this.name = 'VisionMCPError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();

    if (cause) {
      this.cause = cause;
    }

    // 保持正确的错误堆栈
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VisionMCPError);
    }
  }

  toJSON() {
    // 从错误响应中移除堆栈跟踪（仅保留在日志中）
    const { stack, ...detailsWithoutStack } = this.details || {};

    return {
      error: {
        message: this.message,
        code: this.code,
        details: detailsWithoutStack,
        timestamp: this.timestamp.toISOString()
      }
    };
  }
}

export class InvalidInputError extends VisionMCPError {
  constructor(message: string, details?: Record<string, any>, cause?: unknown) {
    super({
      message: `Invalid input: ${message}`,
      code: VisionMCPErrorCode.INVALID_INPUT,
      details,
      cause
    });
    this.name = 'InvalidInputError';
  }
}

export class ModelConfigError extends VisionMCPError {
  constructor(message: string, details?: Record<string, any>, cause?: unknown) {
    super({
      message: `Model configuration error: ${message}`,
      code: VisionMCPErrorCode.MODEL_CONFIG_ERROR,
      details,
      cause
    });
    this.name = 'ModelConfigError';
  }
}

export class ImageLoadError extends VisionMCPError {
  constructor(message: string, details?: Record<string, any>, cause?: unknown) {
    super({
      message: `Failed to load image: ${message}`,
      code: VisionMCPErrorCode.IMAGE_LOAD_ERROR,
      details,
      cause
    });
    this.name = 'ImageLoadError';
  }
}

export class ModelAPIError extends VisionMCPError {
  constructor(message: string, details?: Record<string, any>, cause?: unknown) {
    super({
      message: `Model API error: ${message}`,
      code: VisionMCPErrorCode.MODEL_API_ERROR,
      details: ModelAPIError.sanitizeDetails(details || {}),
      cause
    });
    this.name = 'ModelAPIError';
  }

  /**
   * 递归脱敏 details 中的 URL（移除 query 参数中的敏感信息如 API key）
   * @param details - 原始 details 对象
   * @returns 脱敏后的 details 对象
   */
  private static sanitizeDetails(details: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const key in details) {
      const value = details[key];

      if (typeof value === 'string') {
        // 脱敏 URL 中的 query 参数（如 ?key=xxx）
        sanitized[key] = ModelAPIError.sanitizeUrlInString(value);
      } else if (Array.isArray(value)) {
        // 递归处理数组
        sanitized[key] = value.map(item =>
          typeof item === 'string' ? ModelAPIError.sanitizeUrlInString(item) :
          typeof item === 'object' && item !== null ? ModelAPIError.sanitizeDetails(item) :
          item
        );
      } else if (typeof value === 'object' && value !== null) {
        // 递归处理嵌套对象
        sanitized[key] = ModelAPIError.sanitizeDetails(value);
      } else {
        // 保留其他类型不变（布尔值、数字等）
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 脱敏字符串中的 URL（移除 query 参数中的敏感信息）
   * @param text - 可能包含 URL 的文本
   * @returns 脱敏后的文本
   */
  private static sanitizeUrlInString(text: string): string {
    // 匹配 URL 中的 ?key= 参数（匹配各种常见的 API key 参数名）
    // 支持: ?key=, ?api_key=, ?apikey=, ?token=, ?access_token=
    return text.replace(
      /[?&](?:key|api_key|apikey|token|access_token|api-key|apikey)=([^&\s]+)/gi,
      (match, param, offset, string) => {
        const separator = match[0] === '?' ? '?' : '&';
        return `${separator}${match.slice(1).split('=')[0]}=***`;
      }
    );
  }
}

export class TimeoutError extends VisionMCPError {
  constructor(message: string, details?: Record<string, any>, cause?: unknown) {
    super({
      message: `Request timeout: ${message}`,
      code: VisionMCPErrorCode.TIMEOUT_ERROR,
      details,
      cause
    });
    this.name = 'TimeoutError';
  }
}

/**
 * 将未知错误转换为 VisionMCPError
 */
export function toVisionMCPError(error: unknown, context?: string): VisionMCPError {
  if (error instanceof VisionMCPError) {
    return error;
  }

  if (error instanceof Error) {
    // 堆栈跟踪只记录在日志中，不包含在错误详情中
    const details: Record<string, any> = {
      originalError: error.name
    };

    // 仅当 LOG_LEVEL 为 debug 时才包含堆栈跟踪
    if (process.env.LOG_LEVEL === 'debug') {
      details.stack = error.stack;
    }

    return new VisionMCPError({
      message: context ? `${context}: ${error.message}` : error.message,
      code: VisionMCPErrorCode.UNKNOWN_ERROR,
      details,
      cause: error
    });
  }

  return new VisionMCPError({
    message: context || 'An unknown error occurred',
    code: VisionMCPErrorCode.UNKNOWN_ERROR,
    details: {
      error: String(error)
    }
  });
}

/**
 * 将错误映射为 MCP 工具响应格式
 */
export function toMCPErrorResponse(error: VisionMCPError) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(error.toJSON(), null, 2)
      }
    ],
    isError: true
  };
}
