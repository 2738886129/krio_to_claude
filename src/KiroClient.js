const axios = require('axios');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const util = require('util');
const fs = require('fs');
const path = require('path');

// 日志文件路径
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}
const KIRO_LOG_FILE = path.join(LOGS_DIR, 'kiro-client-debug.log');

// 初始化日志文件
fs.writeFileSync(KIRO_LOG_FILE, `=== Kiro Client 日志启动于 ${new Date().toISOString()} ===\n\n`, 'utf8');

// 日志函数 - 同时输出到控制台和文件
function logToFile(message, consoleMessage = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  // 写入文件（详细信息）
  fs.appendFileSync(KIRO_LOG_FILE, logMessage, 'utf8');
  
  // 输出到控制台（简略信息）
  if (consoleMessage !== null) {
    console.log(consoleMessage);
  } else {
    // 如果没有提供简略信息，输出简化版本
    const shortMessage = message.length > 100 ? message.substring(0, 100) + '...' : message;
    console.log(`[Kiro] ${shortMessage}`);
  }
}

/**
 * Kiro AI API 客户端
 * 用于调用真实的 Amazon Q Developer API
 */
class KiroClient {
  /**
   * @param {string} bearerToken - 从 mitmproxy 或应用配置中获取的 Bearer Token
   * @param {object} options - 可选配置
   */
  constructor(bearerToken, options = {}) {
    this.baseURL = options.baseURL || 'https://q.us-east-1.amazonaws.com';
    this.token = bearerToken;
    this.userAgent = options.userAgent || 'aws-sdk-js/1.0.0 KiroIDE-0.8.0-c550b87543e105c1e1124702d94e55647c94c9368cc47e5b3b19030bce23ac7a';
    this.sdkUserAgent = options.sdkUserAgent || 'aws-sdk-js/1.0.0 ua/2.1 os/win32#10.0.19045 lang/js md/nodejs#22.21.1 api/codewhispererruntime#1.0.0 m/N,E KiroIDE-0.8.0';

    // HTTPS 连接池配置
    this.httpsAgent = new https.Agent({
      keepAlive: true,           // 启用 keep-alive 复用连接
      maxSockets: options.maxSockets || 10,        // 最大并发连接数
      maxFreeSockets: options.maxFreeSockets || 5, // 空闲连接池大小
      timeout: options.socketTimeout || 60000,     // socket 超时
      scheduling: 'lifo'         // 后进先出，优先复用最近的连接
    });

    // Axios 实例
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: options.timeout || 30000,
      httpsAgent: this.httpsAgent,
      headers: {
        'Connection': 'keep-alive'
      }
    });
    
    logToFile(
      `[KiroClient] 初始化连接池: maxSockets=${this.httpsAgent.maxSockets}, maxFreeSockets=${this.httpsAgent.maxFreeSockets}`,
      '[Kiro] 连接池已初始化'
    );

    // 添加响应拦截器来捕获错误详情
    this.client.interceptors.response.use(
      response => response,
      async error => {
        // 如果是 400 错误且响应是流，尝试读取完整内容
        if (error.response && error.response.status === 400) {
          if (error.response.data && typeof error.response.data.on === 'function') {
            // 响应是流，读取完整内容
            const chunks = [];
            error.response.data.on('data', chunk => chunks.push(chunk));
            
            await new Promise((resolve, reject) => {
              error.response.data.on('end', resolve);
              error.response.data.on('error', reject);
            });
            
            const fullData = Buffer.concat(chunks).toString('utf8');
            console.error('[400 错误原始响应]', fullData);
            error.response.data = fullData;
          }
        }
        throw error;
      }
    );
  }

  /**
   * 生成通用请求头
   */
  _getHeaders(extraHeaders = {}) {
    return {
      'Authorization': `Bearer ${this.token}`,
      'x-amz-user-agent': this.userAgent,
      'user-agent': this.sdkUserAgent,
      'amz-sdk-invocation-id': uuidv4(),
      'amz-sdk-request': 'attempt=1; max=1',
      ...extraHeaders
    };
  }

  /**
   * 获取用户配额信息
   * @param {object} params - 查询参数
   * @returns {Promise<object>} 配额信息
   */
  async getUsageLimits(params = {}) {
    try {
      const response = await this.client.get('/getUsageLimits', {
        params: {
          origin: params.origin || 'AI_EDITOR',
          resourceType: params.resourceType || 'AGENTIC_REQUEST'
        },
        headers: this._getHeaders()
      });
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * 获取可用模型列表
   * @param {object} params - 查询参数
   * @returns {Promise<object>} 模型列表，包含 modelsMap 和原始数据
   */
  async listAvailableModels(params = {}) {
    try {
      const response = await this.client.get('/ListAvailableModels', {
        params: {
          origin: params.origin || 'AI_EDITOR'
        },
        headers: this._getHeaders()
      });
      
      const data = response.data;
      
      // 创建 modelId -> 模型详情 的 Map
      const modelsMap = new Map();
      if (data.models) {
        data.models.forEach(model => {
          modelsMap.set(model.modelId, {
            name: model.modelName,
            id: model.modelId,
            rateMultiplier: model.rateMultiplier,
            maxInputTokens: model.tokenLimits?.maxInputTokens || null,
            maxOutputTokens: model.tokenLimits?.maxOutputTokens || null
          });
        });
      }
      
      return {
        modelsMap,           // Map<modelId, modelInfo>
        defaultModelId: data.defaultModel?.modelId,
        raw: data            // 原始响应数据
      };
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * 生成 AI 助手响应（流式）
   * @param {object} conversationState - 对话状态
   * @param {function} onChunk - 接收数据块的回调函数
   * @returns {Promise<object>} 完整的响应数据
   */
  async generateAssistantResponse(conversationState, onChunk = null) {
    try {
      const response = await this.client.post('/generateAssistantResponse',
        { conversationState },
        {
          headers: this._getHeaders({
            'Content-Type': 'application/json'
          }),
          responseType: 'stream',
          validateStatus: function (status) {
            // 允许所有状态码通过，我们自己处理错误
            return true;
          }
        }
      );

      // 检查是否是错误响应
      if (response.status >= 400) {
        // 读取流式错误响应
        return new Promise((resolve, reject) => {
          let errorBody = '';
          response.data.on('data', (chunk) => {
            errorBody += chunk.toString('utf8');
          });
          response.data.on('end', () => {
            console.error(`[Kiro API Error ${response.status}]`, errorBody);
            reject(new Error(`API Error ${response.status}: ${errorBody || '未知错误'}`));
          });
          response.data.on('error', (err) => {
            reject(new Error(`API Error ${response.status}: ${err.message}`));
          });
        });
      }

      return new Promise((resolve, reject) => {
        let fullContent = '';
        let meteringData = null;
        let contextUsage = null;
        let binaryBuffer = Buffer.alloc(0);  // 使用 Buffer 累积二进制数据
        let toolCalls = {};  // 累积工具调用数据
        // 上下文窗口大小（用于从 contextUsagePercentage 计算 input_tokens）
        const MAX_CONTEXT_TOKENS = 200000;

        response.data.on('data', (chunk) => {
          logToFile(
            `[调试] 收到 chunk，长度: ${chunk.length}`,
            `[Kiro] 收到 chunk: ${chunk.length} 字节`
          );
          
          // 累积二进制数据
          binaryBuffer = Buffer.concat([binaryBuffer, chunk]);
          
          // 解析 AWS Event Stream 格式
          // 格式: [4字节总长度][4字节headers长度][4字节prelude CRC][headers][payload][4字节message CRC]
          while (binaryBuffer.length >= 12) {  // 最小消息长度: prelude(12) + message CRC(4) = 16
            const totalLength = binaryBuffer.readUInt32BE(0);
            const headersLength = binaryBuffer.readUInt32BE(4);
            
            // 检查是否有完整的消息
            if (binaryBuffer.length < totalLength) {
              break;  // 等待更多数据
            }
            
            // 提取 payload
            const payloadStart = 12 + headersLength;  // prelude(12) + headers
            const payloadLength = totalLength - payloadStart - 4;  // 减去 message CRC
            
            if (payloadLength > 0) {
              const payload = binaryBuffer.subarray(payloadStart, payloadStart + payloadLength);
              const payloadStr = payload.toString('utf8');
              
              logToFile(
                `[调试] 解析到 payload: ${payloadStr.substring(0, 200)}`,
                null
              );
              
              // 尝试解析 JSON
              try {
                const data = JSON.parse(payloadStr);
                
                // 内容块
                if (data.content !== undefined) {
                  fullContent += data.content;
                  
                  logToFile(
                    `[调试] 解析到内容: ${data.content}`,
                    `[Kiro] +${data.content.length}字符`
                  );
                  
                  if (onChunk) {
                    onChunk({
                      type: 'content',
                      data: data.content
                    });
                  }
                }
                
                // 工具调用 - Kiro 返回 JSON 格式的工具调用
                if (data.name && data.toolUseId) {
                  const isNewTool = !toolCalls[data.toolUseId];
                  
                  // 初始化或更新工具调用
                  if (isNewTool) {
                    toolCalls[data.toolUseId] = {
                      name: data.name,
                      toolUseId: data.toolUseId,
                      input: ''
                    };
                    logToFile(
                      `[调试] 开始工具调用: ${data.name} (${data.toolUseId})`,
                      `[Kiro] 工具调用: ${data.name}`
                    );
                    
                    // 流式回调：工具调用开始
                    if (onChunk) {
                      onChunk({
                        type: 'tool_use_start',
                        toolUseId: data.toolUseId,
                        name: data.name
                      });
                    }
                  }
                  
                  // 累积 input 并流式发送
                  if (data.input !== undefined) {
                    toolCalls[data.toolUseId].input += data.input;
                    
                    // 流式回调：工具调用输入增量
                    if (onChunk) {
                      onChunk({
                        type: 'tool_use_delta',
                        toolUseId: data.toolUseId,
                        name: data.name,
                        inputDelta: data.input
                      });
                    }
                  }
                  
                  // 工具调用结束
                  if (data.stop === true) {
                    logToFile(
                      `[调试] 工具调用结束: ${data.name}, input: ${toolCalls[data.toolUseId].input}`,
                      `[Kiro] 工具调用完成: ${data.name}`
                    );
                    
                    // 流式回调：工具调用结束
                    if (onChunk) {
                      let parsedInput = {};
                      try {
                        parsedInput = JSON.parse(toolCalls[data.toolUseId].input);
                      } catch (e) {
                        parsedInput = { raw: toolCalls[data.toolUseId].input };
                      }
                      
                      onChunk({
                        type: 'tool_use_stop',
                        toolUseId: data.toolUseId,
                        name: data.name,
                        input: parsedInput
                      });
                    }
                  }
                }
                
                // Token 计数信息（Kiro 可能返回，但我们主要用 contextUsagePercentage）
                if (data.inputTokenCount !== undefined) {
                  logToFile(
                    `[调试] Kiro 返回输入 token 数: ${data.inputTokenCount}`,
                    `[Kiro] Kiro 输入 tokens: ${data.inputTokenCount}`
                  );
                }
                
                if (data.outputTokenCount !== undefined) {
                  logToFile(
                    `[调试] Kiro 返回输出 token 数: ${data.outputTokenCount}`,
                    `[Kiro] Kiro 输出 tokens: ${data.outputTokenCount}`
                  );
                }
                
                // 费用信息
                if (data.usage !== undefined) {
                  meteringData = data;
                  if (onChunk) {
                    onChunk({
                      type: 'metering',
                      data: meteringData
                    });
                  }
                }
                
                // 上下文使用率
                if (data.contextUsagePercentage !== undefined) {
                  contextUsage = data;
                  if (onChunk) {
                    onChunk({
                      type: 'contextUsage',
                      data: contextUsage
                    });
                  }
                }
              } catch (e) {
                // 不是 JSON，可能是其他类型的消息
                logToFile(
                  `[调试] 非 JSON payload: ${payloadStr.substring(0, 100)}`,
                  null
                );
              }
            }
            
            // 移除已处理的消息
            binaryBuffer = binaryBuffer.subarray(totalLength);
          }
        });

        response.data.on('end', () => {
          // 记录完整内容用于调试
          logToFile(
            `[调试] 响应结束, fullContent 长度: ${fullContent.length}, 内容: ${fullContent.substring(0, 500)}`,
            `[Kiro] 响应完成: ${fullContent.length} 字符`
          );
          
          if (fullContent.length === 0 && Object.keys(toolCalls).length === 0) {
            logToFile(
              '[调试] 警告：Kiro API 返回了空内容！',
              '[Kiro] ⚠️ 空响应'
            );
          }
          
          // 转换工具调用为 Claude API 格式
          const toolUses = Object.values(toolCalls).map(tc => {
            let parsedInput = {};
            try {
              parsedInput = JSON.parse(tc.input);
            } catch (e) {
              parsedInput = { raw: tc.input };
            }
            return {
              type: 'tool_use',
              id: tc.toolUseId,
              name: tc.name,
              input: parsedInput
            };
          });
          
          if (toolUses.length > 0) {
            logToFile(
              `[调试] 解析到 ${toolUses.length} 个工具调用`,
              `[Kiro] 工具调用: ${toolUses.length} 个`
            );
          }
          
          // 计算 input_tokens：使用 contextUsagePercentage
          let inputTokens = 0;
          if (contextUsage && contextUsage.contextUsagePercentage !== undefined) {
            inputTokens = Math.round(MAX_CONTEXT_TOKENS * contextUsage.contextUsagePercentage / 100);
            logToFile(
              `[调试] 从 contextUsagePercentage (${contextUsage.contextUsagePercentage}%) 计算 input_tokens: ${inputTokens}`,
              `[Kiro] input_tokens: ${inputTokens} (${contextUsage.contextUsagePercentage}%)`
            );
          }
          
          // 计算 output_tokens：使用 _estimateTokens 估算
          let outputTokens = 0;
          // 文本部分
          if (fullContent) {
            outputTokens += this._estimateTokens(fullContent);
          }
          // 工具调用部分
          for (const tc of toolUses) {
            outputTokens += this._estimateTokens(tc.name);
            if (tc.input) {
              outputTokens += this._estimateTokens(JSON.stringify(tc.input));
            }
            outputTokens += 10; // 固定开销
          }
          logToFile(
            `[调试] 估算 output_tokens: ${outputTokens}`,
            `[Kiro] output_tokens: ${outputTokens}`
          );
          
          resolve({
            content: fullContent,
            parsedContent: {
              text: fullContent,
              toolUses: toolUses
            },
            metering: meteringData,
            contextUsage: contextUsage,
            usage: {
              input_tokens: inputTokens,
              output_tokens: outputTokens
            }
          });
        });

        response.data.on('error', (error) => {
          reject(this._handleError(error));
        });
      });
    } catch (error) {
      // 特殊处理：如果是 4xx 或 5xx 错误，尝试读取响应体
      if (error.response && (error.response.status >= 400)) {
        let errorBody = '';
        
        if (error.response.data) {
          if (Buffer.isBuffer(error.response.data)) {
            errorBody = error.response.data.toString('utf8');
          } else if (typeof error.response.data === 'string') {
            errorBody = error.response.data;
          } else if (typeof error.response.data === 'object') {
            try {
              // 使用 util.inspect 来正确显示对象
              errorBody = util.inspect(error.response.data, { depth: 5, colors: false });
              
              // 同时尝试提取关键字段
              if (error.response.data.message) {
                errorBody = `${error.response.data.message}\n详细: ${errorBody}`;
              } else if (error.response.data.error) {
                const errDetail = typeof error.response.data.error === 'string' 
                  ? error.response.data.error 
                  : util.inspect(error.response.data.error, { depth: 3 });
                errorBody = `错误: ${errDetail}\n详细: ${errorBody}`;
              }
            } catch (e) {
              errorBody = String(error.response.data);
            }
          } else {
            errorBody = String(error.response.data);
          }
        }
        
        // 记录详细错误到日志
        console.error(`[Kiro API Error ${error.response.status}]`, errorBody);
        
        throw new Error(`API Error ${error.response.status} ${error.response.statusText || ''}: ${errorBody || '未知错误'}`);
      }
      
      throw this._handleError(error);
    }
  }

  /**
   * 发送消息并获取回复
   * @param {string} message - 用户消息
   * @param {object} options - 可选参数
   * @returns {Promise<object>} 响应结果
   */
  async chat(message, options = {}) {
    // 构建 userInputMessageContext
    const userInputMessageContext = {};
    
    // 添加工具定义（如果有）
    if (options.tools && options.tools.length > 0) {
      userInputMessageContext.tools = options.tools;
    }
    
    // 添加工具结果（如果有）
    if (options.toolResults && options.toolResults.length > 0) {
      userInputMessageContext.toolResults = options.toolResults;
    }
    
    // 合并其他 context
    if (options.context) {
      Object.assign(userInputMessageContext, options.context);
    }
    
    // 构建 userInputMessage
    const userInputMessage = {
      content: message,
      modelId: options.modelId || 'claude-sonnet-4.5',
      origin: options.origin || 'AI_EDITOR',
      userInputMessageContext: userInputMessageContext
    };
    
    // 添加图片（如果有）
    if (options.images && options.images.length > 0) {
      userInputMessage.images = options.images;
    }
    
    const conversationState = {
      agentTaskType: options.agentTaskType || 'vibe',
      chatTriggerType: options.chatTriggerType || 'MANUAL',
      conversationId: options.conversationId || uuidv4(),
      currentMessage: {
        userInputMessage: userInputMessage
      },
      history: options.history || []
    };
    
    // 添加 agentContinuationId（如果有）
    if (options.agentContinuationId) {
      conversationState.agentContinuationId = options.agentContinuationId;
    }

    // 调试：打印请求体（可选）
    if (options.debug) {
      console.log('[DEBUG] 请求体:', JSON.stringify(conversationState, null, 2));
    }

    // 调用 API
    return await this.generateAssistantResponse(conversationState, options.onChunk);
  }

  /**
   * 调用 MCP 端点
   * @param {object} payload - 请求体
   * @returns {Promise<object>} 响应数据
   */
  async mcp(payload) {
    try {
      const response = await this.client.post('/mcp', payload, {
        headers: this._getHeaders({
          'Content-Type': 'application/json'
        })
      });
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * 解析 XML 格式的工具调用，转换为 Claude API 格式
   * @param {string} content - 包含 XML 工具调用的内容
   * @returns {object} { text: string, toolUses: array }
   */
  _parseToolCalls(content) {
    if (!content || typeof content !== 'string') {
      return { text: content || '', toolUses: [] };
    }

    const toolUses = [];
    let textContent = content;

    // 提取 <function_calls> 之前的文本内容
    const functionCallsMatch = content.match(/([\s\S]*?)<function_calls>/);
    if (functionCallsMatch) {
      textContent = functionCallsMatch[1].trim();
    }

    // 匹配所有 <invoke> 块
    const invokeRegex = /<invoke name="([^"]+)">([\s\S]*?)<\/invoke>/g;
    let match;

    while ((match = invokeRegex.exec(content)) !== null) {
      const toolName = match[1];
      const invokeContent = match[2];
      
      // 提取所有参数
      const input = {};
      const paramRegex = /<parameter name="([^"]+)">([^<]*)<\/parameter>/g;
      let paramMatch;
      
      while ((paramMatch = paramRegex.exec(invokeContent)) !== null) {
        const paramName = paramMatch[1];
        const paramValue = paramMatch[2];
        
        // 尝试解析 JSON 参数
        try {
          input[paramName] = JSON.parse(paramValue);
        } catch (e) {
          // 如果不是 JSON，就作为字符串
          input[paramName] = paramValue;
        }
      }

      toolUses.push({
        type: 'tool_use',
        id: `toolu_${uuidv4().replace(/-/g, '').substring(0, 24)}`,
        name: toolName,
        input: input
      });
    }

    return { text: textContent, toolUses: toolUses };
  }

  /**
   * 过滤掉响应中的工具调用 XML 标签（用于流式响应）
   * @param {string} content - 原始内容
   * @returns {string} 过滤后的内容
   */
  _filterToolCalls(content) {
    if (!content || typeof content !== 'string') {
      return content;
    }
    
    // 不要在流式响应中过滤，让完整内容累积后统一处理
    return content;
  }

  /**
   * 智能估算文本的 token 数量
   * 区分中文、英文和代码，使用不同的估算系数
   * @param {string} text - 要估算的文本
   * @returns {number} 估算的 token 数
   */
  _estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    
    // 统计中文字符数（包括中文标点）
    const chineseChars = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    
    // 统计英文单词数（连续的字母数字）
    const englishWords = (text.match(/[a-zA-Z0-9]+/g) || []).length;
    
    // 统计特殊符号和标点（非中文非英文字母数字）
    const symbols = (text.match(/[^\u4e00-\u9fff\u3000-\u303f\uff00-\uffef\s\w]/g) || []).length;
    
    // 估算规则：
    // - 中文：约 1.5 tokens/字符（Claude 对中文的 tokenization）
    // - 英文单词：约 1.3 tokens/单词（考虑到子词分割）
    // - 符号：约 1 token/符号
    const estimatedTokens = Math.round(
      chineseChars * 1.5 +
      englishWords * 1.3 +
      symbols * 1
    );
    
    // 至少返回 1
    return Math.max(1, estimatedTokens);
  }

  /**
   * 获取连接池状态（用于监控）
   * @returns {object} 连接池状态信息
   */
  getPoolStatus() {
    const agent = this.httpsAgent;
    return {
      totalSockets: Object.keys(agent.sockets).reduce((sum, key) => sum + (agent.sockets[key]?.length || 0), 0),
      freeSockets: Object.keys(agent.freeSockets).reduce((sum, key) => sum + (agent.freeSockets[key]?.length || 0), 0),
      pendingRequests: Object.keys(agent.requests).reduce((sum, key) => sum + (agent.requests[key]?.length || 0), 0),
      maxSockets: agent.maxSockets,
      maxFreeSockets: agent.maxFreeSockets
    };
  }

  /**
   * 销毁连接池（优雅关闭时调用）
   */
  destroy() {
    if (this.httpsAgent) {
      this.httpsAgent.destroy();
      logToFile('[KiroClient] 连接池已销毁', '[Kiro] 连接池已销毁');
    }
  }

  /**
   * 错误处理
   */
  _handleError(error) {
    // 提取关键信息，避免循环引用
    if (error.response) {
      // 服务器返回错误响应
      const status = error.response.status;
      const statusText = error.response.statusText || '';
      const data = error.response.data;
      
      // 安全地序列化响应数据
      let dataStr = '';
      try {
        if (typeof data === 'string') {
          dataStr = data;
        } else if (Buffer.isBuffer(data)) {
          dataStr = data.toString('utf8');
        } else if (data && typeof data === 'object') {
          // 尝试提取关键错误信息
          if (data.message) {
            dataStr = data.message;
          } else if (data.error) {
            dataStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
          } else {
            dataStr = JSON.stringify(data);
          }
        } else {
          dataStr = String(data);
        }
      } catch (e) {
        dataStr = '[无法序列化响应数据]';
      }
      
      return new Error(`API Error ${status} ${statusText}: ${dataStr}`);
    } else if (error.request) {
      // 请求发出但没有收到响应
      // 不要尝试序列化 request 对象，它包含循环引用
      return new Error(`Network Error: No response received from API (${error.message || '未知错误'})`);
    } else {
      // 其他错误
      return new Error(`Request Error: ${error.message || '未知错误'}`);
    }
  }

  /**
   * 获取剩余 credits
   * @returns {Promise<number>} 剩余 credits
   */
  async getRemainingCredits() {
    const usage = await this.getUsageLimits();
    const trialInfo = usage.usageBreakdownList?.[0]?.freeTrialInfo;
    if (trialInfo) {
      return trialInfo.usageLimit - trialInfo.currentUsage;
    }
    return null;
  }

  /**
   * 获取订阅信息
   * @returns {Promise<object>} 订阅信息
   */
  async getSubscriptionInfo() {
    const usage = await this.getUsageLimits();
    return usage.subscriptionInfo;
  }

  /**
   * 获取特定模型的信息
   * @param {string} modelId - 模型 ID
   * @returns {Promise<object|null>} 模型信息，如果不存在返回 null
   */
  async getModelInfo(modelId) {
    const result = await this.listAvailableModels();
    return result.modelsMap.get(modelId) || null;
  }

  /**
   * 获取所有可用的模型 ID 列表
   * @returns {Promise<string[]>} 模型 ID 数组
   */
  async getAvailableModelIds() {
    const result = await this.listAvailableModels();
    return Array.from(result.modelsMap.keys());
  }
}

module.exports = KiroClient;
