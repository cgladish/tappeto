import { TestRunner } from './TestRunner';

export interface TapConfig {
  displayWidth: number;
  displayHeight: number;
  displayNumber: number;
  debug?: boolean;
  maxAttempts?: number;
}

class TapInterface {
  private runner: TestRunner | null = null;
  private initPromise: Promise<void>;
  private config: TapConfig = {
    displayWidth: 1024,
    displayHeight: 768,
    displayNumber: 1,
    debug: false,
    maxAttempts: 10,
  };

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize() {
    this.runner = await TestRunner.create({
      displayWidth: this.config.displayWidth,
      displayHeight: this.config.displayHeight,
      displayNumber: this.config.displayNumber,
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