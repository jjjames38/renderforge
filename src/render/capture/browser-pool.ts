import puppeteer, { Browser, Page } from 'puppeteer-core';
import { config } from '../../config/index.js';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.connect({
      browserWSEndpoint: config.chromium.wsEndpoint,
    });
  }
  return browser;
}

export async function acquirePage(width: number, height: number): Promise<Page> {
  const b = await getBrowser();
  const page = await b.newPage();
  await page.setViewport({ width, height });
  return page;
}

export async function releasePage(page: Page): Promise<void> {
  try {
    await page.close();
  } catch {
    // ignore errors on close
  }
}
