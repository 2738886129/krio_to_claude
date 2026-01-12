const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');
const { v4: uuidv4 } = require('uuid');

async function test() {
  try {
    const BEARER_TOKEN = loadToken();
    const client = new KiroClient(BEARER_TOKEN);
    
    const conversationId = uuidv4();
    
    console.log('测试带短 system prompt 的请求...\n');
    
    // 构建历史记录，包含短的 system prompt
    const history = [
      {
        userInputMessage: {
          content: 'You are a helpful assistant.',
          modelId: 'claude-sonnet-4.5',
          origin: 'AI_EDITOR'
        }
      }
    ];
    
    const result = await client.chat('你好', {
      modelId: 'claude-sonnet-4.5',
      conversationId,
      history,
      onChunk: (chunk) => {
        if (chunk.type === 'content') {
          process.stdout.write(chunk.data);
        }
      }
    });
    
    console.log('\n\n✅ 成功！');
    console.log('费用:', result.metering?.usage);
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

test();
