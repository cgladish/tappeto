import { Browser, BrowserContext, Page, chromium } from 'playwright';
import {
  TestStep,
  TestStepSchema,
  ComputerConfig,
  ComputerConfigSchema,
  TestRunnerConfig,
  ComputerCommand,
  WAIT_TIME
} from './types';
import { Runnable } from '@langchain/core/runnables';
import { initChatModel, InitChatModelFields } from "langchain/chat_models/universal";
import { ComputerCommandSchema } from './types';
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { instructions } from './instructions';
import { IBrowser } from './lib/browser/types';
import { PlaywrightBrowser } from './lib/browser/playwright-browser';
import { wait } from './utils';

interface ModelDefinition {
  model: string;
  apiKey: string;
}

export const primaryModel: ModelDefinition = 
{
  model: "claude-3-5-sonnet-20241022",
  apiKey: process.env.ANTHROPIC_API_KEY!
}
export const fallbackModels: ModelDefinition[] = [
];

const sharedConfig: InitChatModelFields = {
  maxTokens: 4096,
  temperature: 0,
  maxRetries: 2,
};

export class TestRunner {
  private steps: TestStep[] = [];
  private computerConfig: ComputerConfig;
  private browser: IBrowser;
  private model: Runnable;
  private cursorX = 0;
  private cursorY = 0;
  private actionHistory: Array<{
    command: ComputerCommand,
    result?: any, 
    error?: string
  }> = [];
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 5;
  private debug: boolean;
  private debugTimers: Map<string, { start: number, label: string }> = new Map();
  private conversation: (HumanMessage | AIMessage | SystemMessage)[] = [];

  static async create(computerConfig: ComputerConfig, debug: boolean = false): Promise<TestRunner> {
    try {
      let model = (await initChatModel(primaryModel.model, {
        apiKey: primaryModel.apiKey,
        ...sharedConfig,
      })).withStructuredOutput(ComputerCommandSchema, {
        method: "json_mode",
        name: "browser_command"
      });

      const fallbackChats: Runnable[] = [];
      for (const model of fallbackModels) {
        const fallbackChat = (await initChatModel(model.model, {
          apiKey: model.apiKey,
          ...sharedConfig
        })).withStructuredOutput(ComputerCommandSchema, {
          method: "json_mode",
          name: "browser_command"
        });
        fallbackChats.push(fallbackChat);
      }

      if (fallbackChats.length > 0) {
        model = model.withFallbacks(fallbackChats);
      }
      return new TestRunner({ 
        model, 
        computerConfig, 
        debug,
        browser: new PlaywrightBrowser() 
      });
    } catch (error) {
      console.error("Error initializing TestRunner:", error);
      throw error;
    }
  }

  private updateCacheBreakpoints() {
    const noBreakpointIndex = this.conversation.length - 3;
    this.conversation.forEach((msg, i) => {
      // ephemeral for last 3 messages and first message
      if (i < noBreakpointIndex && i !== 0) {
        delete msg.additional_kwargs?.cache_control;
      } else {
        msg.additional_kwargs = {
          ...msg.additional_kwargs,
          cache_control: { type: "ephemeral" }
        }
      }
    });
  }

  private addToConversation(message: HumanMessage | AIMessage | SystemMessage) {
    this.conversation.push(message);
    this.updateCacheBreakpoints();
  }

  private constructor({ model, computerConfig, debug = false, browser }: TestRunnerConfig & { browser: IBrowser }) {
    this.model = model;
    this.debug = debug;
    this.computerConfig = ComputerConfigSchema.parse(computerConfig);
    this.browser = browser;
    
    // Initialize conversation with system message and instructions
    this.addToConversation(new HumanMessage({
      content: instructions,
      additional_kwargs: {
        cache_control: { type: "ephemeral" }
      }
    }));
  }

  addStep(step: TestStep): TestRunner {
    const validatedStep = TestStepSchema.parse(step);
    this.steps.push(validatedStep);
    return this;
  }

  async init() {
    await this.browser.init({
      displayWidth: this.computerConfig.displayWidth,
      displayHeight: this.computerConfig.displayHeight
    });
  }

  async cleanup() {
    await this.browser.cleanup();
  }

  async run(): Promise<boolean> {
    try {
      await this.init();
      
      for (const step of this.steps) {
        try {
          const result = await this.executeStep(step);
          if (step.validation && !(await step.validation(result))) {
            console.error(`Validation failed for step: ${step.prompt}`);
            this.consecutiveErrors++;
          } else {
            this.consecutiveErrors = 0; // Reset on success
          }
        } catch (error) {
          console.error(`Error executing step: ${step.prompt}`, error);
          this.consecutiveErrors++;
        }

        if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
          console.error(`Aborting: ${this.MAX_CONSECUTIVE_ERRORS} consecutive errors reached`);
          return false;
        }
      }
      return this.consecutiveErrors === 0;
    } finally {
      await this.cleanup();
    }
  }

  private logDebug(message: string, data?: any) {
    if (this.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${message}`);
      if (data) console.log(JSON.stringify(data, null, 2));
    }
  }

  private logDebugStart(label: string): string {
    if (!this.debug) return '';
    const id = Math.random().toString(36).substring(2, 15);
    this.debugTimers.set(id, { start: Date.now(), label });
    this.logDebug(`Starting: ${label}`);
    return id;
  }

  private logDebugEnd(id: string, data?: any) {
    if (!this.debug || !id) return;
    const timer = this.debugTimers.get(id);
    if (!timer) return;
    
    const duration = Date.now() - timer.start;
    this.logDebug(`Completed: ${timer.label} (${duration}ms)`, data);
    this.debugTimers.delete(id);
  }

  private async executeStep(step: TestStep): Promise<any> {
    const stepId = this.logDebugStart(`Step: ${step.prompt}`);
    let stepComplete = false;
    let attempts = 0;
    const MAX_ATTEMPTS_PER_STEP = 10;

    while (!stepComplete && attempts < MAX_ATTEMPTS_PER_STEP) {
      if (attempts > 1) {
        await wait(1000 * Math.pow(1.5, attempts - 1));
      }
      attempts++;
      const attemptId = this.logDebugStart(`Attempt ${attempts}`);

      const screenshotId = this.logDebugStart('Taking screenshot');
      const screenshotBase64 = await this.browser.takeScreenshot()
      this.logDebugEnd(screenshotId);

      // Add the current step as a human message
      const humanMessage = new HumanMessage({
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${screenshotBase64}`,
              detail: "high"
            }
          },
          {
            type: "text",
            text: `Current goal: ${step.prompt}\n` +
              (attempts > 1 ? `\nPrevious attempts haven't succeeded. Try a different strategy.` : '') +
              `\nDetermine the next action needed to accomplish this goal. Set stepComplete to true only when you're confident the goal has been achieved.`
          }
        ]
      });

      this.addToConversation(humanMessage);

      let command: ComputerCommand;
      try {
        const modelId = this.logDebugStart('Waiting for model response');
        command = await this.model.invoke(this.conversation);
        this.logDebugEnd(modelId, command);

        this.addToConversation(new AIMessage({
          content: JSON.stringify(command),
          additional_kwargs: { command }
        }));

        if (command.action === 'finish') {
          stepComplete = true;
          break;
        }

        const executeId = this.logDebugStart('Executing command');
        const result = await this.executeCommand(command);
        this.logDebugEnd(executeId);

        await wait(1000);

        // Add result to conversation
        this.addToConversation(new AIMessage({
          content: `Action completed successfully: ${command.action}`,
          additional_kwargs: { result }
        }));

        attempts = 0;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Add error to conversation
        this.addToConversation(new AIMessage({
          content: `Action failed: ${errorMessage}`,
          additional_kwargs: { error: errorMessage }
        }));
        
        this.logDebug(`Attempt failed: ${errorMessage}`);
      }
      this.logDebugEnd(attemptId);
    }

    if (!stepComplete) {
      this.logDebug(`Step failed after ${attempts} attempts`);
      throw new Error(`Failed to complete step after ${MAX_ATTEMPTS_PER_STEP} attempts`);
    }
    this.logDebugEnd(stepId);
  }

  private async executeCommand(command: ComputerCommand): Promise<any> {
    try {
      switch (command.action) {
        case 'wait':
          await wait(WAIT_TIME * 1000);
          break;

        case 'goto':
          if (!command.url) throw new Error('URL required for goto action');
          await this.browser.goto(command.url);
          break;

        case 'key':
          if (!command.text) throw new Error('Text required for key action');
          await this.browser.pressKey(command.text);
          break;

        case 'type':
          if (!command.text) throw new Error('Text required for type action');
          await this.browser.type(command.text);
          break;

        case 'mouse_move':
          if (!command.coordinate) throw new Error('Coordinate required for mouse_move action');
          await this.browser.mouseMove(command.coordinate);
          break;

        case 'left_click':
          if (!command.coordinate) throw new Error('Coordinate required for left_click action');
          await this.browser.leftClick(command.coordinate);
          break;

        case 'left_click_drag':
          if (!command.coordinate) throw new Error('Coordinate required for left_click_drag action');
          await this.browser.dragAndDrop(command.coordinate);
          break;

        case 'right_click':
          if (!command.coordinate) throw new Error('Coordinate required for right_click action');
          await this.browser.rightClick(command.coordinate);
          break;

        case 'middle_click':
          if (!command.coordinate) throw new Error('Coordinate required for middle_click action');
          await this.browser.middleClick(command.coordinate);
          break;

        case 'double_click':
          if (!command.coordinate) throw new Error('Coordinate required for double_click action');
          await this.browser.doubleClick(command.coordinate);
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to execute ${command.action}: ${errorMessage}`);
    }
  }
}