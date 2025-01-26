import { Browser, BrowserContext, Page, chromium } from 'playwright';
import {
  TestStep,
  TestStepSchema,
  ComputerConfig,
  ComputerConfigSchema,
  TestRunnerConfig,
  ComputerCommand
} from './types';
import { Runnable } from '@langchain/core/runnables';
import { initChatModel } from "langchain/chat_models/universal";
import { ComputerCommandSchema } from './types';
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { systemMessage } from './system-message';

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

const sharedConfig = {
  maxTokens: 4096,
  temperature: 0,
  maxRetries: 2,
};

export class TestRunner {
  private steps: TestStep[] = [];
  private computerConfig: ComputerConfig;
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private model: Runnable;
  private cursorX = 0;
  private cursorY = 0;
  private actionHistory: Array<{ command: ComputerCommand, result?: any, error?: string }> = [];
  private consecutiveErrors = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 5;
  private debug: boolean;
  private debugTimers: Map<string, { start: number, label: string }> = new Map();

  static async create(computerConfig: ComputerConfig, debug: boolean = false): Promise<TestRunner> {
    try {
      let model = (await initChatModel(primaryModel.model, {
        apiKey: primaryModel.apiKey,
        ...sharedConfig
      })).withStructuredOutput(ComputerCommandSchema, {
        method: "json_mode"
      });

      const fallbackChats: Runnable[] = [];
      for (const model of fallbackModels) {
        const fallbackChat = (await initChatModel(model.model, {
          apiKey: model.apiKey,
          ...sharedConfig
        })).withStructuredOutput(ComputerCommandSchema, {
          method: "json_mode"
        });
        fallbackChats.push(fallbackChat);
      }

      if (fallbackChats.length > 0) {
        model = model.withFallbacks(fallbackChats);
      }
      return new TestRunner({ model, computerConfig, debug });
    } catch (error) {
      console.error("Error initializing TestRunner:", error);
      throw error;
    }
  }

  private constructor({ model, computerConfig, debug = false }: TestRunnerConfig) {
    this.model = model;
    this.debug = debug;
    this.computerConfig = ComputerConfigSchema.parse(computerConfig);
  }

  addStep(step: TestStep): TestRunner {
    const validatedStep = TestStepSchema.parse(step);
    this.steps.push(validatedStep);
    return this;
  }

  async init() {
    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext({
      viewport: {
        width: this.computerConfig.displayWidth,
        height: this.computerConfig.displayHeight
      }
    });
    this.page = await this.context.newPage();
  }

  async cleanup() {
    await this.context?.close();
    await this.browser?.close();
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
    if (!this.page) throw new Error('Browser page not initialized');

    const stepId = this.logDebugStart(`Step: ${step.prompt}`);
    let stepComplete = false;
    let attempts = 0;
    const MAX_ATTEMPTS_PER_STEP = 10;

    while (!stepComplete && attempts < MAX_ATTEMPTS_PER_STEP) {
      if (attempts > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(1.5, attempts - 1)));
      }
      attempts++;
      const attemptId = this.logDebugStart(`Attempt ${attempts}`);

      const screenshotId = this.logDebugStart('Taking screenshot');
      const screenshot = await this.page.screenshot({ 
        type: 'png',
        path: undefined
      });
      const screenshotBase64 = screenshot.toString('base64');
      this.logDebugEnd(screenshotId);
      
      // Only include recent history
      const relevantHistory = this.actionHistory.slice(-10).map(h => 
        `Action: ${h.command.action} (${h.command.goal})` +
        (h.command.text ? ` with text "${h.command.text}"` : '') +
        (h.command.coordinate ? ` at coordinates (${h.command.coordinate.x}, ${h.command.coordinate.y})` : '') +
        (h.error ? ' - Failed' : ' - Success')
      ).join('\n');

      const lastError = this.actionHistory[this.actionHistory.length - 1]?.error;
      
      const messages = [
        new SystemMessage(systemMessage),
        new HumanMessage({
          content: [
            {
              type: "text",
              text: `Previous actions taken:\n${relevantHistory}` + 
                (lastError ? `\n\nLast action failed with error: ${lastError}. Consider a different approach.` : '') +
                `\n\nCurrent goal: ${step.prompt}\n` +
                (attempts > 1 ? `\nPrevious attempts haven't succeeded. Try a different strategy.` : '') +
                `\nDetermine the next action needed to accomplish this goal. Set stepComplete to true only when you're confident the goal has been achieved.\n\n` +
                `Below is a screenshot of the current browser state. Use this to verify the previous action was successful, as well as to determine accurate coordinates for interactions.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${screenshotBase64}`,
                detail: "high"
              }
            }
          ]
        })
      ];

      let command: ComputerCommand;
      try {
        const modelId = this.logDebugStart('Waiting for model response');
        command = await this.model.invoke(messages);
        this.logDebugEnd(modelId, command);

        const executeId = this.logDebugStart('Executing command');
        const result = await this.executeCommand(command);
        this.logDebugEnd(executeId);

        this.actionHistory.push({ command, result });
        stepComplete = command.stepComplete;
        attempts = 0;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.actionHistory.push({ 
          command: command!, 
          error: errorMessage 
        });
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
    if (!this.page) throw new Error('Browser page not initialized');

    try {
      switch (command.action) {
        case 'goto':
          if (!command.url) throw new Error('URL required for goto action');
          await this.page.goto(command.url);
          break;

        case 'key':
          if (!command.text) throw new Error('Text required for key action');
          await this.page.keyboard.press(command.text);
          break;

        case 'type':
          if (!command.text) throw new Error('Text required for type action');
          await this.page.keyboard.type(command.text);
          break;

        case 'mouse_move':
          if (!command.coordinate) throw new Error('Coordinate required for mouse_move action');
          this.cursorX = command.coordinate.x;
          this.cursorY = command.coordinate.y;
          await this.page.mouse.move(this.cursorX, this.cursorY);
          break;

        case 'left_click':
          await this.page.mouse.click(this.cursorX, this.cursorY, { button: 'left' });
          break;

        case 'left_click_drag':
          if (!command.coordinate) throw new Error('Coordinate required for left_click_drag action');
          await this.page.mouse.down();
          await this.page.mouse.move(command.coordinate.x, command.coordinate.y);
          await this.page.mouse.up();
          break;

        case 'right_click':
          await this.page.mouse.click(this.cursorX, this.cursorY, { button: 'right' });
          break;

        case 'middle_click':
          await this.page.mouse.click(this.cursorX, this.cursorY, { button: 'middle' });
          break;

        case 'double_click':
          await this.page.mouse.dblclick(this.cursorX, this.cursorY);
          break;

        case 'cursor_position':
          return { x: this.cursorX, y: this.cursorY };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to execute ${command.action}: ${errorMessage}`);
    }
  }
}