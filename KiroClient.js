const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

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

    // Axios 实例
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: options.timeout || 30000,
      headers: {
        'Connection': 'close'
      }
    });
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
   * @returns {Promise<object>} 模型列表
   */
  async listAvailableModels(params = {}) {
    try {
      const response = await this.client.get('/ListAvailableModels', {
        params: {
          origin: params.origin || 'AI_EDITOR'
        },
        headers: this._getHeaders()
      });
      return response.data;
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
          responseType: 'stream'
        }
      );

      return new Promise((resolve, reject) => {
        let fullContent = '';
        let meteringData = null;
        let contextUsage = null;
        let rawBuffer = Buffer.alloc(0);

        response.data.on('data', (chunk) => {
          // 累积原始 Buffer
          rawBuffer = Buffer.concat([rawBuffer, chunk]);
          
          // 转换为字符串
          const str = rawBuffer.toString('utf8');
          
          // 使用正则表达式查找所有 JSON 对象
          const jsonRegex = /\{"[^"]+":"[^"]*"\}/g;
          let match;
          let lastIndex = 0;
          
          while ((match = jsonRegex.exec(str)) !== null) {
            lastIndex = jsonRegex.lastIndex;
            
            try {
              const data = JSON.parse(match[0]);
              
              // 内容块
              if (data.content !== undefined) {
                fullContent += data.content;
                if (onChunk) {
                  onChunk({
                    type: 'content',
                    data: data.content
                  });
                }
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
              // JSON 解析失败，忽略
            }
          }
          
          // 保留未处理的部分（可能是不完整的 JSON）
          if (lastIndex > 0) {
            rawBuffer = Buffer.from(str.substring(lastIndex), 'utf8');
          }
        });

        response.data.on('end', () => {
          // 处理剩余的缓冲区
          if (rawBuffer.length > 0) {
            const str = rawBuffer.toString('utf8');
            const jsonRegex = /\{[^}]+\}/g;
            let match;
            
            while ((match = jsonRegex.exec(str)) !== null) {
              try {
                const data = JSON.parse(match[0]);
                
                if (data.content !== undefined) {
                  fullContent += data.content;
                }
                if (data.usage !== undefined) {
                  meteringData = data;
                }
                if (data.contextUsagePercentage !== undefined) {
                  contextUsage = data;
                }
              } catch (e) {
                // 忽略
              }
            }
          }
          
          resolve({
            content: fullContent,
            metering: meteringData,
            contextUsage: contextUsage
          });
        });

        response.data.on('error', (error) => {
          reject(this._handleError(error));
        });
      });
    } catch (error) {
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
    const conversationState = {
      agentTaskType: options.agentTaskType || 'vibe',
      chatTriggerType: options.chatTriggerType || 'MANUAL',
      conversationId: options.conversationId || uuidv4(),
      currentMessage: {
        userInputMessage: {
          content: message,
          modelId: options.modelId || 'claude-sonnet-4.5',
          origin: options.origin || 'AI_EDITOR',
          userInputMessageContext: options.context || {}
        }
      },
      history: options.history || []
    };

    return this.generateAssistantResponse(conversationState, options.onChunk);
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
        } else if (data && typeof data === 'object') {
          dataStr = JSON.stringify(data);
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
}

module.exports = KiroClient;
