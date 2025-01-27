import { Builder, By, Key, WebDriver, Origin } from 'selenium-webdriver';
import { IBrowser, BrowserConfig, Coordinate } from './types';
import { clickEffectScript } from './click-effect';

export class SeleniumBrowser implements IBrowser {
  private driver?: WebDriver;

  private async moveTo(coordinate: Coordinate): Promise<void> {
    await this.driver?.actions().move({
      x: coordinate.x,
      y: coordinate.y,
      origin: Origin.VIEWPORT,
      duration: 500
    }).perform();
  }

  async init(config: BrowserConfig): Promise<void> {
    this.driver = await new Builder().forBrowser('chrome').build();
    await this.driver.manage().window().setRect({
      width: config.displayWidth,
      height: config.displayHeight
    });
  }

  async cleanup(): Promise<void> {
    await this.driver?.quit();
  }

  async goto(url: string): Promise<void> {
    if (!this.driver) throw new Error('Browser not initialized');
    await this.driver.get(url);
  }

  async pressKey(key: string): Promise<void> {
    if (!this.driver) throw new Error('Browser not initialized');
    let seleniumKey = Key[key.toUpperCase() as keyof typeof Key];
    if (typeof seleniumKey === 'function') {
      seleniumKey = seleniumKey();
    }
    await this.driver.actions().sendKeys(seleniumKey).perform();
  }

  async type(text: string): Promise<void> {
    if (!this.driver) throw new Error('Browser not initialized');
    await this.driver.actions().sendKeys(text).perform();
  }

  async mouseMove(coordinate: Coordinate): Promise<void> {
    if (!this.driver) throw new Error('Browser not initialized');
    await this.moveTo(coordinate);
  }

  private async highlightClick(coordinate: Coordinate): Promise<void> {
    if (!this.driver) return;
    await this.driver.executeScript(clickEffectScript(coordinate));
  }

  async leftClick(coordinate: Coordinate): Promise<void> {
    if (!this.driver) throw new Error('Browser not initialized');
    await this.moveTo(coordinate);
    await this.highlightClick(coordinate);
    await this.driver.actions().click().perform();
  }

  async rightClick(coordinate: Coordinate): Promise<void> {
    if (!this.driver) throw new Error('Browser not initialized');
    await this.moveTo(coordinate);
    await this.highlightClick(coordinate);
    await this.driver.actions().contextClick().perform();
  }

  async middleClick(coordinate: Coordinate): Promise<void> {
    if (!this.driver) throw new Error('Browser not initialized');
    await this.moveTo(coordinate);
    await this.highlightClick(coordinate);
    await this.driver.actions().click().perform();
  }

  async doubleClick(coordinate: Coordinate): Promise<void> {
    if (!this.driver) throw new Error('Browser not initialized');
    await this.moveTo(coordinate);
    await this.highlightClick(coordinate);
    await this.driver.actions().doubleClick().perform();
  }

  async dragAndDrop(target: Coordinate): Promise<void> {
    if (!this.driver) throw new Error('Browser not initialized');
    await this.driver.actions().press().perform();
    await this.highlightClick(target);
    await this.moveTo(target);
    await this.driver.actions().release().perform();
    await this.highlightClick(target);
  }

  async takeScreenshot(): Promise<string> {
    if (!this.driver) throw new Error('Browser not initialized');
    const screenshot = await this.driver.takeScreenshot();
    return screenshot;
  }
} 