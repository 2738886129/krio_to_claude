const KiroClient = require("./KiroClient");

/**
 * 使用示例
 *
 * 重要：需要先获取真实的 Bearer Token
 * 方法 1: 使用 mitmproxy 捕获流量
 * 方法 2: 从 Kiro 应用配置文件中提取
 */

// ========== 配置 ==========
const BEARER_TOKEN =
  "aoaAAAAAGljIR8jukm5NvO0Qz2IbRztsjy3xmc9cgB2fezRN4V--AG5IJENI-oMVUeuc4TB6TMownVuT3QC9DIVlcBkc0:MGYCMQD84NJZOqfD4nGjFR5YiD+MhnOuY9iV3uKVcjjJPgr4QoHIEjRITm6x5+RFpJ7ieyUCMQDdKBto6DPt5GV9dm2fi7qiWxrRMqxRujPlil0nxOhcfrcePDv6CEDX/Aq7E9lgqaY"; // 替换为真实的 token

// ========== 初始化客户端 ==========
const client = new KiroClient(BEARER_TOKEN);

// ========== 示例 1: 获取配额信息 ==========
async function example1_getUsageLimits() {
  console.log("\n========== 配额信息 ==========\n");
  try {
    const usage = await client.getUsageLimits();
    const breakdown = usage.usageBreakdownList[0];
    const trialInfo = breakdown.freeTrialInfo;

    // 订阅类型
    console.log(`订阅类型: ${usage.subscriptionInfo.subscriptionTitle}`);

    // 试用 Credits
    const trialUsed = trialInfo.currentUsageWithPrecision;
    const trialTotal = trialInfo.usageLimit;
    const trialRemaining = (trialTotal - trialUsed).toFixed(2);
    console.log(
      `试用 Credits: ${trialUsed} / ${trialTotal} 已使用 → 剩余 ${trialRemaining}`
    );

    // 月度 Credits
    const monthlyUsed = breakdown.currentUsage;
    const monthlyTotal = breakdown.usageLimit;
    const monthlyRemaining = monthlyTotal - monthlyUsed;
    console.log(
      `月度 Credits: ${monthlyUsed} / ${monthlyTotal} 已使用 → 剩余 ${monthlyRemaining}`
    );

    // 试用到期
    const now = Date.now();
    const expiryTime = trialInfo.freeTrialExpiry * 1000; // 转换为毫秒
    const daysRemaining = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24));
    const expiryDate = new Date(expiryTime);
    console.log(
      `试用到期: 约 ${daysRemaining} 天后（${expiryDate.toLocaleDateString(
        "zh-CN"
      )}）`
    );

    // 超额费率
    console.log(`超额费率: $${breakdown.overageRate} / credit`);
  } catch (error) {
    console.error("错误:", error.message);
  }
}

// ========== 示例 2: 获取可用模型 ==========
async function example2_listModels() {
  console.log("\n========== 示例 2: 获取可用模型 ==========");
  try {
    const models = await client.listAvailableModels();
    console.log("默认模型:", models.defaultModel.modelName);
    console.log("\n可用模型列表:");
    models.models.forEach((model) => {
      console.log(`  - ${model.modelName} (${model.modelId})`);
      console.log(
        `    费率: ${model.rateMultiplier}x, Token 上限: ${
          model.tokenLimits.maxInputTokens || "unlimited"
        }`
      );
    });
  } catch (error) {
    console.error("错误:", error.message);
  }
}

// ========== 示例 3: 简单对话 ==========
async function example3_simpleChat() {
  console.log("\n========== 示例 3: 简单对话 ==========");
  try {
    console.log('发送消息: "你好"');
    console.log('配置: modelId=claude-sonnet-4.5, agentTaskType=vibe\n');

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

// ========== 示例 4: 使用不同模型 ==========
async function example4_differentModels() {
  console.log("\n========== 示例 4: 使用不同模型 ==========");

  const message = "写一个 Python 函数计算斐波那契数列";
  const configs = [
    { modelId: "simple-task", agentTaskType: "task-execution" },
    { modelId: "claude-haiku-4.5", agentTaskType: "task-execution" },
    { modelId: "claude-sonnet-4.5", agentTaskType: "task-execution" }
  ];

  for (const config of configs) {
    console.log(`\n--- 模型: ${config.modelId} ---`);
    try {
      const result = await client.chat(message, {
        ...config,
        onChunk: (chunk) => {
          if (chunk.type === "content") {
            process.stdout.write(chunk.data);
          }
        },
      });

      console.log(`\n费用: ${result.metering?.usage} credits`);
    } catch (error) {
      console.error("错误:", error.message);
    }
  }
}

// ========== 示例 5: 多轮对话 ==========
async function example5_multiTurnConversation() {
  console.log("\n========== 示例 5: 多轮对话 ==========");

  const conversationId = require("uuid").v4();
  const history = [];

  const messages = [
    "我想学习 JavaScript",
    "从哪里开始比较好？",
    "推荐一些学习资源",
  ];

  for (const message of messages) {
    console.log(`\n用户: ${message}`);
    console.log("AI: ");

    try {
      const result = await client.chat(message, {
        conversationId: conversationId,
        history: history,
        modelId: "claude-sonnet-4.5",
        agentTaskType: "vibe",
        onChunk: (chunk) => {
          if (chunk.type === "content") {
            process.stdout.write(chunk.data);
          }
        },
      });

      // 更新历史记录
      history.push({
        userMessage: { content: message },
        assistantMessage: { content: result.content },
      });

      console.log(`\n[费用: ${result.metering?.usage} credits]`);
    } catch (error) {
      console.error("错误:", error.message);
      break;
    }
  }
}

// ========== 示例 6: 获取剩余 credits ==========
async function example6_getRemainingCredits() {
  console.log("\n========== 示例 6: 快速获取剩余 credits ==========");
  try {
    const remaining = await client.getRemainingCredits();
    console.log("剩余 credits:", remaining);
  } catch (error) {
    console.error("错误:", error.message);
  }
}

// ========== 示例 7: 不同任务类型 ==========
async function example7_chatWithIntent() {
  console.log("\n========== 示例 7: 不同任务类型 ==========");

  const testCases = [
    {
      message: "你好，今天天气怎么样？",
      agentTaskType: "vibe",
      modelId: "claude-haiku-4.5"
    },
    {
      message: "帮我写一个计算斐波那契数列的函数",
      agentTaskType: "task-execution",
      modelId: "claude-sonnet-4.5"
    },
    {
      message: "创建一个用户登录功能的规范",
      agentTaskType: "spec-creation",
      modelId: "claude-sonnet-4.5"
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`用户消息: "${testCase.message}"`);
    console.log(`任务类型: ${testCase.agentTaskType}`);
    console.log(`模型: ${testCase.modelId}`);
    console.log("=".repeat(60));

    try {
      const result = await client.chat(testCase.message, {
        agentTaskType: testCase.agentTaskType,
        modelId: testCase.modelId,
        onChunk: (chunk) => {
          if (chunk.type === "content") {
            process.stdout.write(chunk.data);
          }
        },
      });

      console.log(
        `\n\n[完成] 费用: ${result.metering?.usage || "N/A"} credits`
      );
      console.log(
        `[完成] 上下文使用: ${
          result.contextUsage?.contextUsagePercentage?.toFixed(2) || "N/A"
        }%`
      );
    } catch (error) {
      console.error("错误:", error.message);
    }
  }
}

// ========== 示例 8: 对比不同配置 ==========
async function example8_compareApproaches() {
  console.log("\n========== 示例 8: 对比不同配置 ==========");

  const message = "JavaScript 中的闭包是什么？";

  // 配置 1: 使用简单模型
  console.log("\n--- 配置 1: simple-task + vibe ---");
  console.log(`消息: "${message}"\n`);

  try {
    const result1 = await client.chat(message, {
      agentTaskType: "vibe",
      modelId: "simple-task",
      onChunk: (chunk) => {
        if (chunk.type === "content") {
          process.stdout.write(chunk.data);
        }
      },
    });
    console.log(`\n\n费用: ${result1.metering?.usage} credits\n`);
  } catch (error) {
    console.error("错误:", error.message);
  }

  // 配置 2: 使用强大模型
  console.log("\n--- 配置 2: claude-sonnet-4.5 + vibe ---");
  console.log(`消息: "${message}"\n`);

  try {
    const result2 = await client.chat(message, {
      agentTaskType: "vibe",
      modelId: "claude-sonnet-4.5",
      onChunk: (chunk) => {
        if (chunk.type === "content") {
          process.stdout.write(chunk.data);
        }
      },
    });
    console.log(`\n\n费用: ${result2.metering?.usage} credits`);
  } catch (error) {
    console.error("错误:", error.message);
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

  // 运行示例（按需取消注释）
  // await example1_getUsageLimits();
  // await example2_listModels();
  await example3_simpleChat();
  // await example4_differentModels();
  // await example5_multiTurnConversation();
  // await example6_getRemainingCredits();
  // await example7_chatWithIntent();
  // await example8_compareApproaches();

  console.log("\n\n✅ 示例运行完成!");
}

// 运行
if (require.main === module) {
  main().catch((error) => {
    console.error("致命错误:", error);
    process.exit(1);
  });
}
