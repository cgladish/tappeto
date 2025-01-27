import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { IBrowser, BrowserConfig, Coordinate } from './types';

export class PlaywrightBrowser implements IBrowser {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private cursorX = 0;
  private cursorY = 0;

  async init(config: BrowserConfig): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext({
      viewport: {
        width: config.displayWidth,
        height: config.displayHeight
      }
    });
    this.page = await this.context.newPage();
  }

  async cleanup(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
  }

  async goto(url: string): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.page.goto(url);
  }

  async pressKey(key: string): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.page.keyboard.press(key);
  }

  async type(text: string): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.page.keyboard.type(text);
  }

  async mouseMove(coordinate: Coordinate): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    this.cursorX = coordinate.x;
    this.cursorY = coordinate.y;
    await this.page.mouse.move(this.cursorX, this.cursorY);
  }

  async leftClick(coordinate: Coordinate): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    this.cursorX = coordinate.x;
    this.cursorY = coordinate.y;
    await this.page.mouse.click(this.cursorX, this.cursorY, { button: 'left' });
  }

  async rightClick(): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.page.mouse.click(this.cursorX, this.cursorY, { button: 'right' });
  }

  async middleClick(): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.page.mouse.click(this.cursorX, this.cursorY, { button: 'middle' });
  }

  async doubleClick(): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.page.mouse.dblclick(this.cursorX, this.cursorY);
  }

  async dragAndDrop(target: Coordinate): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.page.mouse.down();
    await this.page.mouse.move(target.x, target.y);
    await this.page.mouse.up();
  }

  async takeScreenshot(): Promise<string> {
    if (!this.page) throw new Error('Browser page not initialized');
    const screenshot = await this.page.screenshot({ 
      type: 'png',
      path: undefined
    });
    return screenshot.toString('base64');
  }
} 