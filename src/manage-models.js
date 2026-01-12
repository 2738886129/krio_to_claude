const fs = require('fs');
const path = require('path');
const KiroClient = require('./KiroClient');
const { loadToken } = require('./loadToken');

const MAPPING_FILE = path.join(__dirname, '..', 'config', 'model-mapping.json');

/**
 * 显示当前的模型映射
 */
function showMappings() {
  console.log('\n========== 当前模型映射 ==========\n');
  
  try {
    const config = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    const mappings = config.mappings || {};
    
    console.log(`默认模型: ${config.defaultModel}\n`);
    console.log('映射列表:');
    
    // 按 Kiro 模型分组
    const grouped = {};
    for (const [claude, kiro] of Object.entries(mappings)) {
      if (!grouped[kiro]) {
        grouped[kiro] = [];
      }
      grouped[kiro].push(claude);
    }
    
    for (const [kiro, claudes] of Object.entries(grouped)) {
      const note = config.notes?.[kiro] || '';
      console.log(`\n  ${kiro} ${note ? `(${note})` : ''}`);
      claudes.forEach(claude => {
        console.log(`    ← ${claude}`);
      });
    }
    
    console.log(`\n总计: ${Object.keys(mappings).length} 个映射\n`);
  } catch (error) {
    console.error('❌ 读取映射文件失败:', error.message);
  }
}

/**
 * 添加新的映射
 */
function addMapping(claudeModel, kiroModel) {
  try {
    const config = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    
    if (config.mappings[claudeModel]) {
      console.log(`⚠️  映射已存在: ${claudeModel} -> ${config.mappings[claudeModel]}`);
      console.log(`是否要更新为: ${claudeModel} -> ${kiroModel}?`);
      console.log('请手动编辑 config/model-mapping.json 文件');
      return;
    }
    
    config.mappings[claudeModel] = kiroModel;
    
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✅ 添加映射成功: ${claudeModel} -> ${kiroModel}`);
    console.log('请重启服务器以应用更改');
  } catch (error) {
    console.error('❌ 添加映射失败:', error.message);
  }
}

/**
 * 删除映射
 */
function removeMapping(claudeModel) {
  try {
    const config = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    
    if (!config.mappings[claudeModel]) {
      console.log(`⚠️  映射不存在: ${claudeModel}`);
      return;
    }
    
    const kiroModel = config.mappings[claudeModel];
    delete config.mappings[claudeModel];
    
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✅ 删除映射成功: ${claudeModel} -> ${kiroModel}`);
    console.log('请重启服务器以应用更改');
  } catch (error) {
    console.error('❌ 删除映射失败:', error.message);
  }
}

/**
 * 获取 Kiro 支持的模型
 */
async function listKiroModels() {
  console.log('\n========== Kiro API 支持的模型 ==========\n');
  
  try {
    const BEARER_TOKEN = loadToken();
    const client = new KiroClient(BEARER_TOKEN);
    
    const result = await client.listAvailableModels();
    
    console.log(`默认模型: ${result.defaultModelId}\n`);
    console.log('可用模型:');
    
    result.modelsMap.forEach((info, id) => {
      console.log(`  - ${id}`);
      console.log(`    名称: ${info.name}`);
      console.log(`    费率: ${info.rateMultiplier}x`);
      if (info.maxInputTokens) {
        console.log(`    最大输入: ${info.maxInputTokens} tokens`);
      }
      console.log('');
    });
  } catch (error) {
    console.error('❌ 获取 Kiro 模型失败:', error.message);
  }
}

/**
 * 测试映射
 */
function testMapping(claudeModel) {
  console.log(`\n========== 测试映射: ${claudeModel} ==========\n`);
  
  try {
    const config = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
    const mappings = config.mappings || {};
    
    if (mappings[claudeModel]) {
      console.log(`✅ 精确匹配: ${claudeModel} -> ${mappings[claudeModel]}`);
      return;
    }
    
    // 模糊匹配
    const lower = claudeModel.toLowerCase();
    if (lower.includes('sonnet')) {
      console.log(`⚠️  模糊匹配: ${claudeModel} -> claude-sonnet-4.5 (包含 'sonnet')`);
    } else if (lower.includes('haiku')) {
      console.log(`⚠️  模糊匹配: ${claudeModel} -> claude-haiku-4.5 (包含 'haiku')`);
    } else if (lower.includes('opus')) {
      console.log(`⚠️  模糊匹配: ${claudeModel} -> claude-opus-4.5 (包含 'opus')`);
    } else {
      console.log(`⚠️  使用默认: ${claudeModel} -> ${config.defaultModel}`);
    }
    
    console.log('\n建议: 添加精确映射以避免模糊匹配');
    console.log(`命令: node src/manage-models.js add "${claudeModel}" "目标Kiro模型ID"`);
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

/**
 * 显示帮助
 */
function showHelp() {
  console.log(`
模型映射管理工具

配置文件位置: config/model-mapping.json

用法:
  node src/manage-models.js <命令> [参数]

命令:
  show                          显示当前所有映射
  list                          获取 Kiro API 支持的模型列表
  add <claude-id> <kiro-id>     添加新的映射
  remove <claude-id>            删除映射
  test <claude-id>              测试模型 ID 的映射结果
  help                          显示此帮助信息

示例:
  node src/manage-models.js show
  node src/manage-models.js list
  node src/manage-models.js add "claude-3-5-sonnet-20260101" "claude-sonnet-4.5"
  node src/manage-models.js remove "claude-3-5-sonnet-20260101"
  node src/manage-models.js test "claude-3-5-haiku-latest"
`);
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'show':
      showMappings();
      break;
      
    case 'list':
      await listKiroModels();
      break;
      
    case 'add':
      if (args.length < 3) {
        console.error('❌ 用法: node src/manage-models.js add <claude-id> <kiro-id>');
        process.exit(1);
      }
      addMapping(args[1], args[2]);
      break;
      
    case 'remove':
      if (args.length < 2) {
        console.error('❌ 用法: node src/manage-models.js remove <claude-id>');
        process.exit(1);
      }
      removeMapping(args[1]);
      break;
      
    case 'test':
      if (args.length < 2) {
        console.error('❌ 用法: node src/manage-models.js test <claude-id>');
        process.exit(1);
      }
      testMapping(args[1]);
      break;
      
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
      
    default:
      console.error(`❌ 未知命令: ${command}`);
      showHelp();
      process.exit(1);
  }
}

// 运行
if (require.main === module) {
  main().catch(error => {
    console.error('错误:', error);
    process.exit(1);
  });
}
