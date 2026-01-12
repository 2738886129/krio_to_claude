const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');

async function test() {
  try {
    const BEARER_TOKEN = loadToken();
    const client = new KiroClient(BEARER_TOKEN);
    
    console.log('测试最简单的请求（无历史记录）...\n');
    
    const result = await client.chat('你好', {
      modelId: 'claude-sonnet-4.5',
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
