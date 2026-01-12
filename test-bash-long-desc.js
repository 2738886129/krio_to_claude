/**
 * 测试 Bash 工具的长 description 是否导致问题
 */
const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');
const fs = require('fs');

async function testBashLongDesc() {
  const token = loadToken();
  const client = new KiroClient(token);
  
  // 读取原始的 Bash 工具
  const data = JSON.parse(fs.readFileSync('conversationState-debug.json', 'utf8'));
  const bashTool = data.currentMessage.userInputMessage.userInputMessageContext.tools.find(
    t => t.toolSpecification.name === 'Bash'
  );
  
  const originalDesc = bashTool.toolSpecification.description;
  console.log('原始 description 长度:', originalDesc.length);
  
  // 测试 1: 使用原始的长 description
  console.log('\n=== 测试 1: 原始长 description ===');
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: [bashTool] });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
  
  // 测试 2: 截断 description 到 5000 字符
  console.log('\n=== 测试 2: 截断到 5000 字符 ===');
  const tool5000 = JSON.parse(JSON.stringify(bashTool));
  tool5000.toolSpecification.description = originalDesc.substring(0, 5000);
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: [tool5000] });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
  
  // 测试 3: 截断 description 到 2000 字符
  console.log('\n=== 测试 3: 截断到 2000 字符 ===');
  const tool2000 = JSON.parse(JSON.stringify(bashTool));
  tool2000.toolSpecification.description = originalDesc.substring(0, 2000);
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: [tool2000] });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
  
  // 测试 4: 截断 description 到 1000 字符
  console.log('\n=== 测试 4: 截断到 1000 字符 ===');
  const tool1000 = JSON.parse(JSON.stringify(bashTool));
  tool1000.toolSpecification.description = originalDesc.substring(0, 1000);
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: [tool1000] });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
  
  // 测试 5: 使用简短 description
  console.log('\n=== 测试 5: 简短 description ===');
  const toolShort = JSON.parse(JSON.stringify(bashTool));
  toolShort.toolSpecification.description = 'Execute bash command';
  try {
    const result = await client.chat('说"OK"', { modelId: 'claude-sonnet-4.5', tools: [toolShort] });
    console.log('✅ 成功');
  } catch (e) {
    console.log('❌ 失败:', e.message.substring(0, 100));
  }
}

testBashLongDesc().catch(console.error);
