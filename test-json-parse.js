// 测试 JSON 解析
const testData = `{"content":"让我读取并分析这个 package.json 文件。\\n\\n<function_calls>\\n<invoke name=\\"readFile\\">\\n<parameter name=\\"path\\">TestSimple/package.json</parameter>\\n</invoke>\\n</function_calls>"}
{"usage":0.5}`;

const lines = testData.split('\n');

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  
  try {
    const data = JSON.parse(trimmed);
    console.log('解析成功:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.content) {
      console.log('\n原始 content:');
      console.log(data.content);
    }
  } catch (e) {
    console.error('解析失败:', e.message);
    console.error('行内容:', trimmed);
  }
}
