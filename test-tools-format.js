/**
 * 测试 Kiro API 是否接受不同的 tools 格式
 */
const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');

async function testToolsFormat() {
  const token = loadToken();
  const client = new KiroClient(token);
  
  // 测试 1: 不带 tools
  console.log('\n=== 测试 1: 不带 tools ===');
  try {
    const result1 = await client.chat('说"测试成功"', {
      modelId: 'claude-sonnet-4.5'
    });
    console.log('✅ 成功:', result1.content.substring(0, 100));
  } catch (e) {
    console.log('❌ 失败:', e.message);
  }
  
  // 测试 2: 带一个最简单的 tool (模仿 Kiro 格式)
  console.log('\n=== 测试 2: 带简单 tool (Kiro 格式) ===');
  const simpleKiroTool = [{
    toolSpecification: {
      name: 'test_tool',
      description: 'A simple test tool',
      inputSchema: {
        json: {
          '$schema': 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message'
            }
          },
          required: ['message'],
          additionalProperties: false
        }
      }
    }
  }];
  
  try {
    const result2 = await client.chat('说"测试成功"', {
      modelId: 'claude-sonnet-4.5',
      tools: simpleKiroTool
    });
    console.log('✅ 成功:', result2.content.substring(0, 100));
  } catch (e) {
    console.log('❌ 失败:', e.message);
  }
  
  // 测试 3: 带可选参数的 tool (使用 anyOf 格式)
  console.log('\n=== 测试 3: 带可选参数 tool (anyOf 格式) ===');
  const toolWithOptional = [{
    toolSpecification: {
      name: 'test_tool_optional',
      description: 'A test tool with optional param',
      inputSchema: {
        json: {
          '$schema': 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message'
            },
            optional_param: {
              anyOf: [
                {
                  anyOf: [
                    { not: {} },
                    { type: 'string', description: 'Optional parameter' }
                  ],
                  description: 'Optional parameter'
                },
                { type: 'null' }
              ],
              description: 'Optional parameter'
            }
          },
          required: ['message'],
          additionalProperties: false
        }
      }
    }
  }];
  
  try {
    const result3 = await client.chat('说"测试成功"', {
      modelId: 'claude-sonnet-4.5',
      tools: toolWithOptional
    });
    console.log('✅ 成功:', result3.content.substring(0, 100));
  } catch (e) {
    console.log('❌ 失败:', e.message);
  }
  
  // 测试 4: 不带 anyOf 的可选参数
  console.log('\n=== 测试 4: 简单可选参数 (不带 anyOf) ===');
  const toolSimpleOptional = [{
    toolSpecification: {
      name: 'test_tool_simple',
      description: 'A test tool with simple optional param',
      inputSchema: {
        json: {
          '$schema': 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message'
            },
            optional_param: {
              type: 'string',
              description: 'Optional parameter'
            }
          },
          required: ['message'],
          additionalProperties: false
        }
      }
    }
  }];
  
  try {
    const result4 = await client.chat('说"测试成功"', {
      modelId: 'claude-sonnet-4.5',
      tools: toolSimpleOptional
    });
    console.log('✅ 成功:', result4.content.substring(0, 100));
  } catch (e) {
    console.log('❌ 失败:', e.message);
  }
}

testToolsFormat().catch(console.error);
