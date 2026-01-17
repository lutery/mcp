#!/usr/bin/env node
/**
 * Vision MCP Server
 *
 * @description MCP Server providing vision capabilities via GLM-4.6V and SiliconFlow
 * This server implements the Model Context Protocol for LLM integration
 *
 * IMPORTANT: This server uses STDIO for MCP communication. Do not use console.log for debugging.
 * Use console.error (stderr) for all logging as required by MCP protocol.
 */

import { config } from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 加载环境变量（如果有 .env 文件）
config();

import { logger } from './utils/logger.js';
import { getVisionTool, VisionToolInputSchema } from './tools/vision-tool.js';
import { toVisionMCPError, toMCPErrorResponse } from './utils/errors.js';

/**
 * 创建并配置 MCP Server
 */
function createMCPServer(): McpServer {
  const server = new McpServer({
    name: 'vision-mcp',
    version: '1.0.0'
  });

  // 初始化视觉工具
  let visionTool: ReturnType<typeof getVisionTool>;

  try {
    visionTool = getVisionTool();
    logger.info('Vision MCP Server initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize vision tool', error);
    throw error;
  }

  // 注册视觉分析工具
  server.tool(
    'analyze_image',
    'Analyze an image using a vision model (GLM-4.6V or SiliconFlow). Supports URL, base64 data URL, or local file path.',
    {
      image: z.string().describe('Image URL, base64 data URL, or local file path'),
      prompt: z.string().describe('Analysis prompt describing what to analyze'),
      output_format: z.enum(['text', 'json']).optional().default('text').describe('Output format preference (text or json)'),
      template: z.string().optional().describe('System prompt template (ui-analysis, object-detection, ocr, etc.)')
    },
    async ({ image, prompt, output_format, template }) => {
      try {
        logger.logRequest('Vision tool called', {
          imageLength: image.length,
          promptLength: prompt.length,
          outputFormat: output_format
        });

        // 验证输入
        const validationResult = VisionToolInputSchema.safeParse({
          image,
          prompt,
          output_format,
          template
        });

        if (!validationResult.success) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Invalid input',
                  details: validationResult.error.errors
                }, null, 2)
              }
            ],
            isError: true
          };
        }

        // 执行分析
        const result = await visionTool.analyze(validationResult.data);

        logger.logRequest('Tool execution completed', {
          outputLength: result.content.length,
          processingTime: result.metadata.processingTimeMs,
          modelType: result.metadata.modelType
        });

        // 返回结果
        return {
          content: [
            {
              type: 'text' as const,
              text: result.content
            }
          ]
        };
      } catch (error) {
        logger.error('Tool execution failed', error);
        return toMCPErrorResponse(toVisionMCPError(error));
      }
    }
  );

  // 注册获取可用模板工具
  server.tool(
    'list_templates',
    'List available system prompt templates for different vision analysis tasks',
    {},
    async () => {
      try {
        logger.logRequest('List templates tool called', {});

        // 导入模板信息
        const { getAvailableTemplates } = await import('./prompts/system.js');
        const templates = getAvailableTemplates();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(templates, null, 2)
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to list templates', error);
        return toMCPErrorResponse(toVisionMCPError(error));
      }
    }
  );

  // 注册获取配置信息工具
  server.tool(
    'get_config',
    'Get current model configuration (model type, name, etc.)',
    {},
    async () => {
      try {
        const { modelConfig } = visionTool.getToolInfo();
        const { maskApiKey } = await import('./config/model-config.js');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  type: modelConfig.type,
                  name: modelConfig.name,
                  baseUrl: modelConfig.baseUrl,
                  apiKey: maskApiKey(modelConfig.apiKey),
                  timeout: modelConfig.timeout,
                  maxRetries: modelConfig.maxRetries
                },
                null,
                2
              )
            }
          ]
        };
      } catch (error) {
        logger.error('Failed to get config', error);
        return toMCPErrorResponse(toVisionMCPError(error));
      }
    }
  );

  return server;
}

/**
 * 主函数
 */
async function main() {
  try {
    logger.info('Starting Vision MCP Server...');

    // 创建服务器
    const server = createMCPServer();

    // 创建传输层
    const transport = new StdioServerTransport();

    // 连接服务器
    await server.connect(transport);

    logger.error('Vision MCP Server is running on stdio');

    // 处理进程信号
    process.on('SIGINT', async () => {
      logger.error('Received SIGINT, shutting down...');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.error('Received SIGTERM, shutting down...');
      process.exit(0);
    });

    // 未捕获异常处理
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`Unhandled rejection at: ${promise}, reason: ${reason}`);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Fatal error starting server', error);
    process.exit(1);
  }
}

// 运行主函数（无条件执行，修复 Windows 路径问题）
main().catch((error) => {
  logger.error('Fatal error in main', error);
  process.exit(1);
});

export { createMCPServer };
