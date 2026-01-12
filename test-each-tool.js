/**
 * 逐个测试每个工具，找出哪个导致 500 错误
 */
const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');
const fs = require('fs');

async function testEachTool() {
  const token = loadToken();
  const client = new KiroClient(token);
  
  // 读取 conversationState-debug.json
  const data = JSON.parse(fs.readFileSync('conversationState-debug.json', 'utf8'));
  const tools = data.currentMessage.userInputMessage.userInputMessageContext.tools;
  
  console.log(`总共 ${tools.length} 个工具\n`);
  
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    const toolName = tool.toolSpecification.name;
    
    console.log(`\n=== 测试 ${i + 1}/${tools.length}: ${toolName} ===`);
    
    try {
      const result = await client.chat('说"OK"', {
        modelId: 'claude-sonnet-4.5',
        tools: [tool]
      });
      console.log(`✅ ${toolName}: 成功`);
    } catch (e) {
      console.log(`❌ ${toolName}: 失败 - ${e.message.substring(0, 100)}`);
    }
    
    // 等待一下避免请求过快
    await new Promise(r => setTimeout(r, 500));
  }
}

testEachTool().catch(console.error);
