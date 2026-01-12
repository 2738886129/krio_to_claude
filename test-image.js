/**
 * 测试图片（多模态）功能
 * 
 * 使用方法：
 * 1. 启动服务器: node claude-api-server.js
 * 2. 运行测试: node test-image.js
 */

const fs = require('fs');
const path = require('path');

// 一个简单的 1x1 红色像素 JPEG 图片的 base64
const TINY_RED_JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEEhEAxEAPwCwAB//2Q==';

async function testImageAPI() {
  console.log('🖼️  测试图片（多模态）API...\n');
  
  // 构建 Claude API 格式的请求
  const requestBody = {
    model: 'claude-sonnet-4.5',
    max_tokens: 1024,
    stream: false,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: TINY_RED_JPEG
            }
          },
          {
            type: 'text',
            text: '这是一张什么颜色的图片？请简短回答。'
          }
        ]
      }
    ]
  };
  
  console.log('📤 发送请求...');
  console.log('   - 图片格式: image/jpeg');
  console.log('   - 图片大小:', TINY_RED_JPEG.length, '字符 (base64)');
  console.log('   - 问题: 这是一张什么颜色的图片？\n');
  
  try {
    const response = await fetch('http://localhost:3000/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 请求失败:', response.status, errorText);
      return;
    }
    
    const result = await response.json();
    
    console.log('📥 收到响应:');
    console.log('   - stop_reason:', result.stop_reason);
    
    if (result.content && result.content.length > 0) {
      for (const block of result.content) {
        if (block.type === 'text') {
          console.log('\n💬 AI 回复:');
          console.log('   ', block.text);
        }
      }
    }
    
    console.log('\n✅ 图片 API 测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 测试图片格式转换函数
function testImageConversion() {
  console.log('\n🔧 测试图片格式转换...\n');
  
  // Claude API 格式
  const claudeImage = {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    }
  };
  
  // 转换为 Kiro 格式
  let format = 'jpeg';
  if (claudeImage.source.media_type) {
    const parts = claudeImage.source.media_type.split('/');
    if (parts.length === 2) {
      format = parts[1];
    }
  }
  
  const kiroImage = {
    format: format,
    source: {
      bytes: claudeImage.source.data
    }
  };
  
  console.log('Claude API 格式:');
  console.log(JSON.stringify(claudeImage, null, 2));
  
  console.log('\nKiro API 格式:');
  console.log(JSON.stringify(kiroImage, null, 2));
  
  console.log('\n✅ 格式转换测试完成！');
}

// 运行测试
testImageConversion();
testImageAPI();
