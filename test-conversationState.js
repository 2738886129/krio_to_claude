const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');
const fs = require('fs');

async function test() {
  try {
    const BEARER_TOKEN = loadToken();
    const client = new KiroClient(BEARER_TOKEN);
    
    // 读取调试文件中的 conversationState
    const conversationState = JSON.parse(fs.readFileSync('conversationState-debug.json', 'utf8'));
    
    console.log('测试 conversationState...');
    console.log('History 长度:', conversationState.history.length);
    console.log('当前消息:', conversationState.currentMessage.userInputMessage.content);
    
    // 直接调用 generateAssistantResponse
    const result = await client.generateAssistantResponse(conversationState, (chunk) => {
      if (chunk.type === 'content') {
        process.stdout.write(chunk.data);
      }
    });
    
    console.log('\n\n✅ 成功！');
    console.log('费用:', result.metering?.usage);
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

test();
