import { TestRunner } from './TestRunner';

export interface TapConfig {
  displayWidth?: number;
  displayHeight?: number;
  debug?: boolean;
  maxAttempts?: number;
  screenshotOnError?: boolean;
  screenshotDir?: string;
}

class TapInterface {
  private runner: TestRunner | null = null;
  private initPromise: Promise<void>;
  private config: TapConfig = {
    displayWidth: 1920,
    displayHeight: 1080,
    debug: false,
    maxAttempts: 10,
    screenshotOnError: true,
    screenshotDir: './screenshots'
  };

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize() {
    this.runner = await TestRunner.create({
      displayWidth: this.config.displayWidth,
      displayHeight: this.config.displayHeight,
    }, this.config.debug);
  }

  step(prompt: string, validation?: (result: any) => Promise<boolean> | boolean) {
    if (!this.runner) {
      throw new Error('Tap not initialized. Ensure you await tap.ready() before adding steps');
    }
    this.runner.addStep({ prompt, validation });
    return this;
  }

  async ready() {
    await this.initPromise;
    return this;
  }

  async run() {
    if (!this.runner) {
      throw new Error('Tap not initialized. Ensure you await tap.ready() before running');
    }
    return this.runner.run();
  }

  configure(config: Partial<TapConfig>) {
    this.config = { ...this.config, ...config };
    this.initPromise = this.initialize();
    return this;
  }
}

export const tap = new TapInterface();

export * from './types';