import { TestRunner } from './TestRunner';

class TapInterface {
  private runner: TestRunner | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize() {
    this.runner = await TestRunner.create({
      displayWidth: 1920,
      displayHeight: 1080
    });
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

  // Add configuration methods
  configure(config: { displayWidth?: number; displayHeight?: number }) {
    this.initPromise = this.initialize();
    return this;
  }
}

export const tap = new TapInterface();

export * from './types';