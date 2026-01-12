const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');
const { v4: uuidv4 } = require('uuid');

async function test() {
  try {
    const BEARER_TOKEN = loadToken();
    const client = new KiroClient(BEARER_TOKEN);
    
    const conversationId = uuidv4();
    
    console.log('第一轮对话...\n');
    const result1 = await client.chat('你好', {
      modelId: 'claude-sonnet-4.5',
      conversationId,
      history: [],
      onChunk: (chunk) => {
        if (chunk.type === 'content') {
          process.stdout.write(chunk.data);
        }
      }
    });
    
    console.log('\n\n第二轮对话（带历史记录）...\n');
    
    // 构建历史记录
    const history = [
      {
        userInputMessage: {
          content: '你好',
          modelId: 'claude-sonnet-4.5',
          origin: 'AI_EDITOR'
        }
      },
      {
        assistantResponseMessage: {
          content: result1.content
        }
      }
    ];
    
    console.log('History 长度:', history.length);
    
    const result2 = await client.chat('我叫什么名字？', {
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
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

test();
