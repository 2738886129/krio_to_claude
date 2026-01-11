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

        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 解析 SSE 事件
            if (line.startsWith(':event-type...assistantResponseEvent')) {
              // 下一行可能是 content-type，再下一行是数据
              const dataLine = lines[i + 2];
              if (dataLine && dataLine.startsWith('{')) {
                try {
                  const data = JSON.parse(dataLine);
                  if (data.content) {
                    fullContent += data.content;
                    if (onChunk) {
                      onChunk({
                        type: 'content',
                        data: data.content
                      });
                    }
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            } else if (line.startsWith(':event-type...meteringEvent')) {
              const dataLine = lines[i + 2];
              if (dataLine && dataLine.startsWith('{')) {
                try {
                  meteringData = JSON.parse(dataLine);
                  if (onChunk) {
                    onChunk({
                      type: 'metering',
                      data: meteringData
                    });
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            } else if (line.startsWith(':event-type...contextUsageEvent')) {
              const dataLine = lines[i + 2];
              if (dataLine && dataLine.startsWith('{')) {
                try {
                  contextUsage = JSON.parse(dataLine);
                  if (onChunk) {
                    onChunk({
                      type: 'contextUsage',
                      data: contextUsage
                    });
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        });

        response.data.on('end', () => {
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
   * 意图分类系统提示词
   */
  _getIntentClassificationPrompt(userMessage) {
    return `
You are an intent classifier for a language model.

Your job is to classify the user's intent based on their conversation history into one of two main categories:

1. **Do mode** (default for most requests)
2. **Spec mode** (only for specific specification/planning requests)

Return ONLY a JSON object with 3 properties (chat, do, spec) representing your confidence in each category. The values must always sum to 1.

### Category Definitions

#### 1. Do mode (DEFAULT CHOICE)
Input belongs in do mode if it:
- Is NOT explicitly about creating or working with specifications
- Requests modifications to code or the workspace
- Is an imperative sentence asking for action
- Starts with a base-form verb (e.g., "Write," "Create," "Generate")
- Has an implied subject ("you" is understood)
- Requests to run commands or make changes to files
- Asks for information, explanation, or clarification
- Ends with a question mark (?)
- Seeks information or explanation
- Examples include:
  - "Write a function to reverse a string."
  - "Create a new file called index.js."
  - "What is the capital of France?"
  - "How do promises work in JavaScript?"

#### 2. Spec mode (ONLY for specification requests)
Input belongs in spec mode ONLY if it EXPLICITLY:
- Asks to create a specification (or spec)
- Uses the word "spec" or "specification" to request creating a formal spec
- Mentions creating a formal requirements document
- Examples include:
  - "Create a spec for this feature"
  - "Generate a specification for the login system"

IMPORTANT: When in doubt, classify as "Do" mode. Only classify as "Spec" when the user is explicitly requesting to create or work with a formal specification document.

IMPORTANT: Respond ONLY with a raw JSON object. No explanation, no commentary, no additional text, no markdown formatting, no code fences (\`\`\`), no backticks.

Example response (exactly this format):
{"chat": 0.0, "do": 0.9, "spec": 0.1}

Here is the last user message:
${userMessage}`;
  }

  /**
   * 意图分类请求
   * @param {string} message - 用户消息
   * @param {object} options - 可选参数
   * @returns {Promise<object>} 分类结果 {chat: 0.0, do: 1.0, spec: 0.0}
   */
  async classifyIntent(message, options = {}) {
    const agentContinuationId = uuidv4();
    const conversationState = {
      agentContinuationId: agentContinuationId,
      agentTaskType: 'vibe',
      chatTriggerType: 'MANUAL',
      conversationId: options.conversationId || uuidv4(),
      currentMessage: {
        userInputMessage: {
          content: message,
          modelId: 'simple-task',
          origin: 'AI_EDITOR',
          userInputMessageContext: {}
        }
      },
      history: [
        {
          userInputMessage: {
            content: this._getIntentClassificationPrompt(message),
            modelId: 'simple-task',
            origin: 'AI_EDITOR'
          }
        },
        {
          assistantResponseMessage: {
            content: 'I will follow these instructions',
            toolUses: []
          }
        }
      ]
    };

    try {
      const response = await this.client.post('/generateAssistantResponse',
        { conversationState },
        {
          headers: this._getHeaders({
            'Content-Type': 'application/json',
            'x-amzn-kiro-agent-mode': 'intent-classification',
            'x-amzn-codewhisperer-optout': 'true'
          }),
          responseType: 'stream'
        }
      );

      return new Promise((resolve, reject) => {
        let fullContent = '';

        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith(':event-type') && line.includes('assistantResponseEvent')) {
              const dataLine = lines[i + 2];
              if (dataLine && dataLine.startsWith('{')) {
                try {
                  const data = JSON.parse(dataLine);
                  if (data.content) {
                    fullContent += data.content;
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        });

        response.data.on('end', () => {
          try {
            // 尝试解析 JSON 响应
            // 响应格式可能是: {"chat": 1.0, "do": 0.0, "spec": 0.0}
            // 或流式片段: {\  chat\  : 1  .0, \  do\  : 0  .0, \  spec\  : 0  .0}

            // 清理转义字符
            let cleaned = fullContent.replace(/\\/g, '');

            // 尝试直接解析
            try {
              const result = JSON.parse(cleaned);
              if (result.chat !== undefined && result.do !== undefined && result.spec !== undefined) {
                resolve(result);
                return;
              }
            } catch (e) {
              // 如果直接解析失败，尝试从文本中提取数字
            }

            // 从文本中提取数值
            const chatMatch = fullContent.match(/chat["\s:]*([0-9.]+)/i);
            const doMatch = fullContent.match(/do["\s:]*([0-9.]+)/i);
            const specMatch = fullContent.match(/spec["\s:]*([0-9.]+)/i);

            if (chatMatch && doMatch && specMatch) {
              resolve({
                chat: parseFloat(chatMatch[1]),
                do: parseFloat(doMatch[1]),
                spec: parseFloat(specMatch[1])
              });
            } else {
              // 如果无法解析，返回默认值（chat模式）
              console.warn('无法解析意图分类结果，使用默认值');
              resolve({ chat: 1.0, do: 0.0, spec: 0.0 });
            }
          } catch (error) {
            console.warn('解析意图分类响应失败:', error.message);
            resolve({ chat: 1.0, do: 0.0, spec: 0.0 });
          }
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
   * 根据意图分类结果选择 agent 模式
   * @param {object} intent - 意图分类结果
   * @returns {string} agent 模式
   */
  _selectAgentMode(intent) {
    if (intent.spec > 0.5) {
      return 'spec-creation';
    } else if (intent.do > 0.5) {
      return 'task-execution';
    } else {
      return 'vibe'; // chat 模式
    }
  }

  /**
   * 根据意图分类结果选择模型
   * @param {object} intent - 意图分类结果
   * @returns {string} 模型 ID
   */
  _selectModel(intent) {
    if (intent.chat > 0.8) {
      // 纯聊天可以使用较小的模型
      return 'claude-haiku-4.5';
    } else {
      // 需要执行任务或创建规范，使用更强大的模型
      return 'claude-sonnet-4.5';
    }
  }

  /**
   * 两步式对话：先进行意图分类，再发送主对话
   * @param {string} message - 用户消息
   * @param {object} options - 可选参数
   * @returns {Promise<object>} 响应结果
   */
  async chatWithIntent(message, options = {}) {
    // 步骤 1: 意图分类
    if (options.onIntentClassified) {
      options.onIntentClassified({ status: 'classifying' });
    }

    const intent = await this.classifyIntent(message, options);

    if (options.onIntentClassified) {
      options.onIntentClassified({ status: 'classified', intent });
    }

    // 步骤 2: 根据意图选择模式和模型
    const agentTaskType = options.agentTaskType || this._selectAgentMode(intent);
    const modelId = options.modelId || this._selectModel(intent);

    // 步骤 3: 发送主对话
    return this.chat(message, {
      ...options,
      agentTaskType,
      modelId
    });
  }

  /**
   * 简化版：发送消息并获取回复（单步，不进行意图分类）
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
          modelId: options.modelId || 'simple-task',
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
    if (error.response) {
      // 服务器返回错误响应
      return new Error(`API Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // 请求发出但没有收到响应
      return new Error('Network Error: No response received from API');
    } else {
      // 其他错误
      return new Error(`Request Error: ${error.message}`);
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
