/**
 * Logger Utility
 *
 * @description 统一的日志工具，确保只使用 stderr 输出
 * 符合 MCP 协议要求：stdout 用于 JSON-RPC 通信，日志使用 stderr
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: keyof typeof LogLevel;
  message: string;
  requestId?: string;
  modelType?: string;
  latency?: number;
  [key: string]: any;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;

  private constructor() {
    // 从环境变量读取日志级别，默认为 INFO
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'DEBUG':
        this.logLevel = LogLevel.DEBUG;
        break;
      case 'WARN':
        this.logLevel = LogLevel.WARN;
        break;
      case 'ERROR':
        this.logLevel = LogLevel.ERROR;
        break;
      default:
        this.logLevel = LogLevel.INFO;
    }
  }

  /**
   * 脱敏可能包含敏感信息的字符串（如 URL 中的 API key）
   * @param text - 可能包含敏感信息的文本
   * @returns 脱敏后的文本
   */
  private sanitizeForLogging(text: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // 匹配 URL 中的敏感查询参数
    // 支持: ?key=, ?api_key=, ?apikey=, ?token=, ?access_token=, ?api-key=
    // 正确捕获: 第1组捕获 "key=" 前缀，第2组捕获值（不使用），替换为 "$1***"
    return text.replace(
      /([?&](?:key|api_key|apikey|token|access_token|api-key)=)([^&\s'"\\]+)/gi,
      '$1***'
    );
  }

  /**
   * 递归脱敏对象中的所有字符串值
   * @param obj - 要脱敏的对象
   * @returns 脱敏后的对象
   */
  private sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];

        if (typeof value === 'string') {
          sanitized[key] = this.sanitizeForLogging(value);
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
    }
    return sanitized;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 写入日志到 stderr
   * @param entry 日志条目
   */
  private write(entry: LogEntry): void {
    // MCP 协议要求：stdout 用于 JSON-RPC，日志必须使用 stderr
    console.error(JSON.stringify(entry));
  }

  /**
   * 记录 DEBUG 级别日志
   */
  public debug(message: string, meta?: Record<string, any>): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.write({
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        message,
        ...(meta ? this.sanitizeObject(meta) : {})
      });
    }
  }

  /**
   * 记录 INFO 级别日志
   */
  public info(message: string, meta?: Record<string, any>): void {
    if (this.logLevel <= LogLevel.INFO) {
      this.write({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message,
        ...(meta ? this.sanitizeObject(meta) : {})
      });
    }
  }

  /**
   * 记录 WARN 级别日志
   */
  public warn(message: string, meta?: Record<string, any>): void {
    if (this.logLevel <= LogLevel.WARN) {
      this.write({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        message,
        ...(meta ? this.sanitizeObject(meta) : {})
      });
    }
  }

  /**
   * 记录 ERROR 级别日志
   */
  public error(message: string, error?: Error | unknown, meta?: Record<string, any>): void {
    if (this.logLevel <= LogLevel.ERROR) {
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message,
        ...(meta ? this.sanitizeObject(meta) : {})
      };

      if (error) {
        if (error instanceof Error) {
          const errorObj: Record<string, string> = {
            name: error.name,
            message: this.sanitizeForLogging(error.message)
          };
          // Stack trace may not be available in all environments
          if (error.stack) {
            errorObj.stack = this.sanitizeForLogging(error.stack);
          }
          logEntry.error = errorObj;
        } else {
          logEntry.error = this.sanitizeForLogging(String(error));
        }
      }

      this.write(logEntry);
    }
  }

  /**
   * 为请求添加上下文信息的日志记录
   */
  public logRequest(message: string, context: {
    requestId?: string;
    modelType?: string;
    latency?: number;
    [key: string]: any;
  }): void {
    const { requestId, modelType, latency, ...rest } = context;

    this.info(message, {
      ...(requestId && { requestId }),
      ...(modelType && { modelType }),
      ...(latency !== undefined && { latency }),
      ...rest
    });
  }
}

// 导出单例实例
export const logger = Logger.getInstance();

/**
 * 装饰器：记录函数执行时间和错误
 */
export function withLogging(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    logger.debug(`[${propertyKey}] Starting execution`, { requestId });

    try {
      const result = await originalMethod.apply(this, args);
      const latency = Date.now() - startTime;

      logger.logRequest(`[${propertyKey}] Completed successfully`, {
        requestId,
        latency
      });

      return result;
    } catch (error) {
      const latency = Date.now() - startTime;

      logger.error(`[${propertyKey}] Execution failed`, error, {
        requestId,
        latency
      });

      throw error;
    }
  };

  return descriptor;
}
