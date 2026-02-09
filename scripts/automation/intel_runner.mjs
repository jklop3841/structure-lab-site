import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

function formatDateYYYYMMDD(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function appendJsonl(filePath, obj) {
  await fs.appendFile(filePath, JSON.stringify(obj) + os.EOL, 'utf8');
}

async function writeText(filePath, content) {
  await fs.writeFile(filePath, content, 'utf8');
}

function getDefaultChromeUserDataDirWindows() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  return path.join(localAppData, 'Google', 'Chrome', 'User Data');
}

async function waitForEndOrDomStable(page, {
  endMarker = '<<END>>',
  stableMs = 10_000,
  overallTimeoutMs = 10 * 60_000,
} = {}) {
  const start = Date.now();

  // 1) Prefer end marker
  while (Date.now() - start < overallTimeoutMs) {
    const hasEnd = await page.evaluate((marker) => {
      return document.body && document.body.innerText && document.body.innerText.includes(marker);
    }, endMarker);
    if (hasEnd) return { reason: 'end_marker' };

    // 2) Fallback: DOM stable for stableMs
    const stable = await page.evaluate((ms) => {
      return new Promise((resolve) => {
        let lastChange = Date.now();
        const obs = new MutationObserver(() => {
          lastChange = Date.now();
        });
        obs.observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });

        const timer = setInterval(() => {
          if (Date.now() - lastChange >= ms) {
            clearInterval(timer);
            obs.disconnect();
            resolve(true);
          }
        }, 250);

        // Safety: if page unloads, resolve
        window.addEventListener('beforeunload', () => {
          clearInterval(timer);
          obs.disconnect();
          resolve(false);
        }, { once: true });
      });
    }, stableMs);

    if (stable) return { reason: 'dom_stable' };
  }

  return { reason: 'timeout' };
}

async function safeScreenshot(page, filePath) {
  try {
    await page.screenshot({ path: filePath, fullPage: true });
  } catch {
    // ignore
  }
}

async function runSite({
  siteId,
  url,
  outputFilename,
  triggerText,
  selectors,
  vaultDir,
  runDir,
  indexJsonlPath,
  context,
}) {
  const startedAt = new Date().toISOString();
  const outPath = path.join(runDir, outputFilename);

  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // If you have a pinned conversation URL, you can provide it via url.

    // Focus input
    if (selectors?.input) {
      await page.waitForSelector(selectors.input, { timeout: 30_000 });
      await page.click(selectors.input);
    } else {
      // fallback: try contenteditable true
      const fallback = '[contenteditable="true"]';
      await page.waitForSelector(fallback, { timeout: 30_000 });
      await page.click(fallback);
    }

    // Type trigger
    await page.keyboard.type(triggerText, { delay: 10 });

    // Send
    if (selectors?.sendButton) {
      await page.click(selectors.sendButton);
    } else {
      await page.keyboard.press('Enter');
    }

    const waitResult = await waitForEndOrDomStable(page, {
      endMarker: '<<END>>',
      stableMs: 10_000,
      overallTimeoutMs: 10 * 60_000,
    });

    // Extract output
    // TODO: once selectors are known, narrow this to the assistant output container
    const text = await page.evaluate(() => {
      const t = document.body?.innerText || '';
      return t.trim();
    });

    await writeText(outPath, text + os.EOL);

    const wordCount = text.length;
    const hash = sha256(text);

    await appendJsonl(indexJsonlPath, {
      date: path.basename(runDir),
      site: siteId,
      path: outPath,
      chars: wordCount,
      hash,
      startedAt,
      finishedAt: new Date().toISOString(),
      waitReason: waitResult.reason,
      ok: true,
    });

    await page.close();
    return { ok: true };
  } catch (err) {
    const screenshotPath = path.join(runDir, `${siteId}_error.png`);
    await safeScreenshot(page, screenshotPath);

    await appendJsonl(indexJsonlPath, {
      date: path.basename(runDir),
      site: siteId,
      path: outPath,
      chars: 0,
      hash: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: false,
      error: String(err?.stack || err),
      screenshot: screenshotPath,
    });

    try { await page.close(); } catch {}
    return { ok: false, error: err };
  }
}

async function main() {
  const dateStr = formatDateYYYYMMDD();

  const vaultRoot = process.env.VAULT_ROOT || 'D:\\AI\\vault';
  const vaultDir = path.join(vaultRoot, dateStr);
  await ensureDir(vaultDir);

  const indexJsonlPath = path.join(vaultRoot, 'index.jsonl');

  const chromeUserDataDir = process.env.CHROME_USER_DATA_DIR || getDefaultChromeUserDataDirWindows();
  if (!chromeUserDataDir) {
    throw new Error('无法确定 Chrome User Data 目录，请设置环境变量 CHROME_USER_DATA_DIR');
  }

  const chromeChannel = process.env.CHROME_CHANNEL; // optional: 'chrome' may work on some setups

  // 改为连接已手动启动的调试浏览器，规避反爬
  const context = await chromium.connectOverCDP('http://localhost:9222');
  const defaultContext = context.contexts()[0]; // 获取已存在的上下文

  const triggerText = process.env.TRIGGER_TEXT || '开始今天的';

  // 站点配置：你后续给我“置顶固定对话”的 URL 与选择器后，我会把 selectors 填准确
  const sites = [
    {
      siteId: 'chatgpt',
      url: process.env.URL_CHATGPT || 'https://chat.openai.com/',
      outputFilename: 'source_chatgpt.md',
      selectors: {
        input: process.env.SEL_CHATGPT_INPUT || null,
        sendButton: process.env.SEL_CHATGPT_SEND || null,
      },
    },
    {
      siteId: 'grok',
      url: process.env.URL_GROK || 'https://grok.com/',
      outputFilename: 'source_grok.md',
      selectors: {
        input: process.env.SEL_GROK_INPUT || null,
        sendButton: process.env.SEL_GROK_SEND || null,
      },
    },
    {
      siteId: 'doubao',
      url: process.env.URL_DOUBAO || 'https://www.doubao.com/',
      outputFilename: 'source_doubao.md',
      selectors: {
        input: process.env.SEL_DOUBAO_INPUT || null,
        sendButton: process.env.SEL_DOUBAO_SEND || null,
      },
    },
  ];

  for (const s of sites) {
    // 每站点独立错误处理，不影响其它站点
    await runSite({
      ...s,
      triggerText,
      vaultDir,
      runDir: vaultDir,
      indexJsonlPath,
      context,
    });
  }

  await context.close();
}

main().catch((e) => {
  // 最外层兜底
  // eslint-disable-next-line no-console
  console.error(e);
  process.exitCode = 1;
});

