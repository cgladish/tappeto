import { Browser, BrowserContext, Page, chromium } from 'playwright';
import { IBrowser, BrowserConfig, Coordinate } from './types';

export class PlaywrightBrowser implements IBrowser {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

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
    await this.page.mouse.move(coordinate.x, coordinate.y, {
      steps: 10
    });
  }

  private async highlightClick(coordinate: Coordinate): Promise<void> {
    if (!this.page) return;
    await this.page.evaluate(({ x, y }) => {
      if (!document.getElementById('click-effect-style')) {
        const style = document.createElement('style');
        style.id = 'click-effect-style';
        style.textContent = `
          .click-effect {
            position: absolute;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: rgba(255, 0, 0, 0.5);
            pointer-events: none;
            transform: translate(-50%, -50%);
            animation: click-animation 0.5s ease-out forwards;
            z-index: 999999;
          }
          @keyframes click-animation {
            0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }
      
      const effect = document.createElement('div');
      effect.className = 'click-effect';
      effect.style.left = `${x}px`;
      effect.style.top = `${y}px`;
      document.body.appendChild(effect);
      setTimeout(() => effect.remove(), 500);
    }, coordinate);
  }

  async leftClick(coordinate: Coordinate): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.mouseMove(coordinate);
    await this.highlightClick(coordinate);
    await this.page.mouse.down({ button: 'left' });
    await this.page.mouse.up({ button: 'left' });
  }

  async rightClick(coordinate: Coordinate): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.mouseMove(coordinate);
    await this.highlightClick(coordinate);
    await this.page.mouse.down({ button: 'right' });
    await this.page.mouse.up({ button: 'right' });
  }

  async middleClick(coordinate: Coordinate): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.mouseMove(coordinate);
    await this.highlightClick(coordinate);
    await this.page.mouse.down({ button: 'middle' });
    await this.page.mouse.up({ button: 'middle' });
  }

  async doubleClick(coordinate: Coordinate): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.mouseMove(coordinate);
    await this.highlightClick(coordinate);
    await this.page.mouse.down({ button: 'left' });
    await this.page.mouse.up({ button: 'left' });
    await this.page.mouse.down({ button: 'left' });
    await this.page.mouse.up({ button: 'left' });
  }

  async dragAndDrop(target: Coordinate): Promise<void> {
    if (!this.page) throw new Error('Browser page not initialized');
    await this.highlightClick(target);
    await this.page.mouse.down();
    await this.page.mouse.move(target.x, target.y);
    await this.page.mouse.up();
    await this.highlightClick(target);
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