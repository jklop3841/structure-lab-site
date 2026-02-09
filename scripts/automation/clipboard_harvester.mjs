import clipboard from 'clipboardy';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const VAULT_ROOT = 'D:\\AI\\vault';

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// 自动识别站点特征
function identifySite(text) {
  const content = text.toLowerCase();
  
  // 识别逻辑（根据常见的 UI 文本特征）
  if (content.includes('openai') || content.includes('chatgpt') || content.includes('model: 4o')) {
    return 'chatgpt';
  }
  if (content.includes('grok') || content.includes('x.com')) {
    return 'grok';
  }
  if (content.includes('豆包') || content.includes('doubao') || content.includes('字节跳动')) {
    return 'doubao';
  }
  
  // 默认规则：如果无法识别，提示用户或标记为 unknown
  return 'unknown';
}

async function saveContent(text) {
  const site = identifySite(text);
  const dateStr = new Date().toISOString().split('T')[0];
  const runDir = path.join(VAULT_ROOT, dateStr);
  
  await fs.mkdir(runDir, { recursive: true });
  
  const fileName = `source_${site}.md`;
  const filePath = path.join(runDir, fileName);
  
  // 如果当天已存在，则追加内容并用分割线隔开
  const timestamp = new Date().toLocaleTimeString();
  const formattedContent = `\n\n--- [Captured at ${timestamp}] ---\n\n${text}`;
  
  if (site === 'unknown') {
    console.log('⚠️ 收到未知来源内容，未自动保存。文本前 50 字：', text.substring(0, 50).replace(/\n/g, ' '));
    return;
  }

  await fs.appendFile(filePath, formattedContent, 'utf8');
  
  // 写入索引
  const entry = {
    date: dateStr,
    site,
    path: filePath,
    chars: text.length,
    hash: sha256(text),
    capturedAt: new Date().toISOString()
  };
  
  await fs.appendFile(path.join(VAULT_ROOT, 'index.jsonl'), JSON.stringify(entry) + os.EOL);
  
  console.log(`✅ [${site}] 内容已保存至 ${filePath} (${text.length} 字)`);
}

async function start() {
  console.log('🚀 剪贴板监听器已启动...');
  console.log(`📂 存储目录: ${VAULT_ROOT}`);
  console.log('💡 使用方法: 在浏览器全选复制 AI 回答，程序将自动分类保存。');

  let lastContent = await clipboard.read();

  setInterval(async () => {
    try {
      const currentContent = await clipboard.read();
      if (currentContent && currentContent !== lastContent && currentContent.trim().length > 10) {
        lastContent = currentContent;
        await saveContent(currentContent);
      }
    } catch (err) {
      // 忽略部分剪贴板读取错误
    }
  }, 1000);
}

start().catch(console.error);


