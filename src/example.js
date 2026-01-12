const KiroClient = require("./KiroClient");
const { loadToken } = require("./loadToken");

/**
 * 使用示例
 *
 * Token 从 kiro-auth-token.json 文件读取
 */

// ========== 初始化客户端 ==========
let client;
try {
  const BEARER_TOKEN = loadToken();
  client = new KiroClient(BEARER_TOKEN);
  console.log("✅ Token 加载成功");
} catch (error) {
  console.error("❌ Token 加载失败:", error.message);
  process.exit(1);
}

// ========== 示例 2: 获取可用模型 ==========
async function example2_listModels() {
  console.log("\n========== 示例 2: 获取可用模型 ==========");
  try {
    const result = await client.listAvailableModels();
    
    console.log("默认模型:", result.defaultModelId);
    console.log("\n可用模型列表:");
    
    // 使用 Map 遍历
    result.modelsMap.forEach((model, modelId) => {
      console.log(`  - ${model.name} (${modelId})`);
      console.log(`    费率: ${model.rateMultiplier}x, Token 上限: ${model.maxInputTokens || "unlimited"}`);
    });
    
    return result;
  } catch (error) {
    console.error("错误:", error.message);
  }
}

// ========== 示例 3: 简单对话 ==========
async function example3_simpleChat() {
  console.log("\n========== 示例 3: 简单对话 ==========");
  try {
    console.log('发送消息: "你好"');
    console.log('配置: modelId=claude-sonnet-4.5\n');

    const result = await client.chat("你好", {
      modelId: "claude-sonnet-4.5",
      agentTaskType: "vibe",
      onChunk: (chunk) => {
        if (chunk.type === "content") {
          process.stdout.write(chunk.data);
        } else if (chunk.type === "metering") {
          console.log("\n[收到费用信息]", chunk.data);
        } else if (chunk.type === "contextUsage") {
          console.log("\n[收到上下文信息]", chunk.data);
        }
      },
    });

    console.log("\n\n[最终结果]");
    console.log("内容长度:", result.content?.length || 0);
    console.log("费用:", result.metering?.usage, result.metering?.unitPlural);
    console.log("上下文使用:", result.contextUsage?.contextUsagePercentage?.toFixed(2) + "%");
  } catch (error) {
    console.error("错误:", error.message);
    console.error("完整错误:", error);
  }
}



// ========== 主函数 ==========
async function main() {
  console.log("🚀 Kiro API 客户端示例");
  console.log("=".repeat(50));

  // 验证 Token
  try {
    const usage = await client.getUsageLimits();
    console.log("\n✅ Token 验证成功");
    console.log(`订阅类型: ${usage.subscriptionInfo.subscriptionTitle}`);
    const remaining = await client.getRemainingCredits();
    console.log(`剩余 credits: ${remaining}`);
  } catch (error) {
    console.error("\n❌ Token 验证失败:", error.message);
    return;
  }

  // await example2_listModels();
  await example3_simpleChat();

  console.log("\n\n✅ 示例运行完成!");
}

// 运行
if (require.main === module) {
  main().catch((error) => {
    console.error("致命错误:", error);
    process.exit(1);
  });
}
