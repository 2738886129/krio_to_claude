const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');

async function test() {
  try {
    const token = loadToken();
    const client = new KiroClient(token);
    
    console.log('发送简单请求到 Kiro API...');
    
    const result = await client.chat('你好，请说"测试成功"', {
      modelId: 'claude-sonnet-4.5',
      history: []  // 空历史记录
    });
    
    console.log('\n=== 结果 ===');
    console.log('content 长度:', result.content.length);
    console.log('content:', result.content);
    
  } catch (error) {
    console.error('错误:', error.message);
  }
}

test();
