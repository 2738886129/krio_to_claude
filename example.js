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
  "aoaAAAAAGljCYEtxb5CGcKFY3CFUZOshJPv8mw47Ed_l4DmN21A4MIn6u2vzgr92SUiMhZL3jCGoScSRVBW32gDFIBkc0:MGQCMHiZn7uL49yBAZBg6zqQLSM5X/1PoZX09f1W5twbtbDaWJefiR7udFdOm7z98gH5YwIwQrDO7COCh7EiE8lOmfFxwLvp77sudv5NjAHAjJCfFNhJJJMqoEMsF2rmJfNSBcTv"; // 替换为真实的 token

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

    const result = await client.chat("你好", {
      modelId: "simple-task",
      onChunk: (chunk) => {
        if (chunk.type === "content") {
          process.stdout.write(chunk.data);
        }
      },
    });

    console.log(
      "\n\n费用:",
      result.metering?.usage,
      result.metering?.unitPlural
    );
    console.log(
      "上下文使用:",
      result.contextUsage?.contextUsagePercentage?.toFixed(2) + "%"
    );
  } catch (error) {
    console.error("错误:", error.message);
  }
}

// ========== 示例 4: 使用不同模型 ==========
async function example4_differentModels() {
  console.log("\n========== 示例 4: 使用不同模型 ==========");

  const message = "写一个 Python 函数计算斐波那契数列";
  const models = ["simple-task", "claude-haiku-4.5", "claude-sonnet-4.5"];

  for (const modelId of models) {
    console.log(`\n--- 使用模型: ${modelId} ---`);
    try {
      const result = await client.chat(message, {
        modelId: modelId,
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

// ========== 示例 7: 两步式对话（带意图分类）==========
async function example7_chatWithIntent() {
  console.log("\n========== 示例 7: 两步式对话（带意图分类）==========");

  const testMessages = [
    "你好，今天天气怎么样？", // 预期: chat 模式
    "帮我写一个计算斐波那契数列的函数", // 预期: do 模式
    "创建一个用户登录功能的规范", // 预期: spec 模式
  ];

  for (const message of testMessages) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`用户消息: "${message}"`);
    console.log("=".repeat(60));

    try {
      const result = await client.chatWithIntent(message, {
        onIntentClassified: ({ status, intent }) => {
          if (status === "classifying") {
            console.log("\n[步骤 1] 正在分类用户意图...");
          } else if (status === "classified") {
            console.log(`[步骤 1] 意图分类完成:`);
            console.log(`  - Chat (聊天): ${(intent.chat * 100).toFixed(1)}%`);
            console.log(`  - Do (执行任务): ${(intent.do * 100).toFixed(1)}%`);
            console.log(
              `  - Spec (创建规范): ${(intent.spec * 100).toFixed(1)}%`
            );

            // 显示选择的模式和模型
            const mode =
              intent.spec > 0.5
                ? "spec-creation"
                : intent.do > 0.5
                ? "task-execution"
                : "vibe";
            const model =
              intent.chat > 0.8 ? "claude-haiku-4.5" : "claude-sonnet-4.5";
            console.log(`  → 选择模式: ${mode}`);
            console.log(`  → 选择模型: ${model}`);
            console.log("\n[步骤 2] 发送主对话请求...");
          }
        },
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

// ========== 示例 8: 对比单步与两步式对话 ==========
async function example8_compareApproaches() {
  console.log("\n========== 示例 8: 对比单步与两步式对话 ==========");

  const message = "JavaScript 中的闭包是什么？";

  // 方法 1: 单步式（直接调用，手动指定参数）
  console.log("\n--- 方法 1: 单步式对话 ---");
  console.log(`消息: "${message}"`);
  console.log("手动指定: agentTaskType=vibe, modelId=simple-task\n");

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

  // 方法 2: 两步式（先分类意图，自动选择参数）
  console.log("\n--- 方法 2: 两步式对话（智能选择）---");
  console.log(`消息: "${message}"`);

  try {
    const result2 = await client.chatWithIntent(message, {
      onIntentClassified: ({ status, intent }) => {
        if (status === "classified") {
          console.log(
            `意图: chat=${intent.chat}, do=${intent.do}, spec=${intent.spec}`
          );
          const mode =
            intent.spec > 0.5
              ? "spec-creation"
              : intent.do > 0.5
              ? "task-execution"
              : "vibe";
          const model =
            intent.chat > 0.8 ? "claude-haiku-4.5" : "claude-sonnet-4.5";
          console.log(`自动选择: agentTaskType=${mode}, modelId=${model}\n`);
        }
      },
      onChunk: (chunk) => {
        if (chunk.type === "content") {
          process.stdout.write(chunk.data);
        }
      },
    });
    console.log(`\n\n总费用: ${result2.metering?.usage} credits`);
  } catch (error) {
    console.error("错误:", error.message);
  }
}

// ========== 主函数 ==========
async function main() {
  console.log("🚀 Kiro API 客户端示例");
  console.log("=".repeat(50));

  // 检查 token
  if (BEARER_TOKEN === "YOUR_BEARER_TOKEN_HERE") {
    console.error("\n❌ 错误: 请先配置 Bearer Token!");
    console.log("\n获取 Token 的方法:");
    console.log("1. 使用 mitmproxy 捕获 Kiro 应用的网络流量");
    console.log("2. 从 Authorization 头中提取 Bearer Token");
    console.log("3. 将 token 填入本文件的 BEARER_TOKEN 变量");
    return;
  }

  // 运行示例（按需取消注释）
  // await example1_getUsageLimits();
  // await example2_listModels();
  // await example3_simpleChat();
  // await example4_differentModels();
  // await example5_multiTurnConversation();
  // await example6_getRemainingCredits();

  // 新增：两步式对话示例
  await example7_chatWithIntent();
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
