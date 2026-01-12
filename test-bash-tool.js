/**
 * 测试 Bash 工具的不同 schema 变体
 */
const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');

async function testBashTool() {
  const token = loadToken();
  const client = new KiroClient(token);
  
  // 测试 1: 最简单的 Bash 工具
  console.log('\n=== 测试 1: 最简单的 Bash 工具 ===');
  const simpleBash = [{
    toolSpecification: {
      name: 'Bash',
      description: 'Execute bash command',
      inputSchema: {
        json: {
          '$schema': 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The command' }
          },
          required: ['command'],
          additionalProperties: false
        }
      }
    }
  }];
  
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: simpleBash });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
  
  // 测试 2: 带嵌套对象的 Bash 工具
  console.log('\n=== 测试 2: 带嵌套对象 ===');
  const bashWithNested = [{
    toolSpecification: {
      name: 'Bash',
      description: 'Execute bash command',
      inputSchema: {
        json: {
          '$schema': 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The command' },
            nested: {
              type: 'object',
              properties: {
                filePath: { type: 'string' },
                content: { type: 'string' }
              },
              required: ['filePath', 'content'],
              additionalProperties: false
            }
          },
          required: ['command'],
          additionalProperties: false
        }
      }
    }
  }];
  
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: bashWithNested });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
  
  // 测试 3: 带 description 字段名的属性
  console.log('\n=== 测试 3: 带 description 属性名 ===');
  const bashWithDescProp = [{
    toolSpecification: {
      name: 'Bash',
      description: 'Execute bash command',
      inputSchema: {
        json: {
          '$schema': 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The command' },
            description: { type: 'string', description: 'Command description' }
          },
          required: ['command'],
          additionalProperties: false
        }
      }
    }
  }];
  
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: bashWithDescProp });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
  
  // 测试 4: 完整的 Bash 工具（不带 _simulatedSedEdit）
  console.log('\n=== 测试 4: 完整 Bash（不带 _simulatedSedEdit）===');
  const bashFull = [{
    toolSpecification: {
      name: 'Bash',
      description: 'Execute bash command',
      inputSchema: {
        json: {
          '$schema': 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The command' },
            timeout: { type: 'number', description: 'Timeout' },
            description: { type: 'string', description: 'Description' },
            run_in_background: { type: 'boolean', description: 'Run in background' },
            dangerouslyDisableSandbox: { type: 'boolean', description: 'Disable sandbox' }
          },
          required: ['command'],
          additionalProperties: false
        }
      }
    }
  }];
  
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: bashFull });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
  
  // 测试 5: 带 _simulatedSedEdit 的 Bash 工具
  console.log('\n=== 测试 5: 带 _simulatedSedEdit ===');
  const bashWithSed = [{
    toolSpecification: {
      name: 'Bash',
      description: 'Execute bash command',
      inputSchema: {
        json: {
          '$schema': 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The command' },
            _simulatedSedEdit: {
              type: 'object',
              description: 'Internal',
              properties: {
                filePath: { type: 'string' },
                newContent: { type: 'string' }
              },
              required: ['filePath', 'newContent'],
              additionalProperties: false
            }
          },
          required: ['command'],
          additionalProperties: false
        }
      }
    }
  }];
  
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: bashWithSed });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
}

testBashTool().catch(console.error);
