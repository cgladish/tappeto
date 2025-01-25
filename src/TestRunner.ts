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
import sharp from 'sharp';

interface ModelDefinition {
  model: string;
  apiKey: string;
}

export const primaryModel: ModelDefinition = {
  model: "gpt-4o-2024-08-06",
  apiKey: process.env.OPENAI_API_KEY!
};
export const fallbackModels: ModelDefinition[] = [
  {
    model: "claude-3-5-sonnet-20241022",
    apiKey: process.env.ANTHROPIC_API_KEY!
  }
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

  static async create(computerConfig: Partial<ComputerConfig> = {}, debug: boolean = false): Promise<TestRunner> {
    try {
      const primaryChat = (await initChatModel(primaryModel.model, {
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

      const model = primaryChat.withFallbacks(fallbackChats);
      return new TestRunner({ model, computerConfig, debug });
    } catch (error) {
      console.error("Error initializing TestRunner:", error);
      throw error;
    }
  }

  private constructor({ model, computerConfig = {}, debug = false }: TestRunnerConfig) {
    this.model = model;
    this.debug = debug;
    this.computerConfig = ComputerConfigSchema.parse({
      displayWidth: 1024,
      displayHeight: 768,
      displayNumber: 1,
      ...computerConfig
    });
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

  private async getGridScreenshots(screenshot: Buffer): Promise<{ section: string, image: string }[]> {
    const GRID_SIZE = 100;
    const sections: { section: string, image: string }[] = [];
    
    const image = await sharp(screenshot);
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not get image dimensions');
    }

    for (let y = 0; y < metadata.height; y += GRID_SIZE) {
      for (let x = 0; x < metadata.width; x += GRID_SIZE) {
        const width = Math.min(GRID_SIZE, metadata.width - x);
        const height = Math.min(GRID_SIZE, metadata.height - y);

        // Skip if dimensions would be invalid
        if (width <= 0 || height <= 0) continue;

        try {
          const sectionImage = await image
            .clone()  // Create a new instance for each extraction
            .extract({ 
              left: x, 
              top: y, 
              width, 
              height 
            })
            .toBuffer();

          sections.push({
            section: `Section (${x},${y})-(${x + width},${y + height})`,
            image: `data:image/png;base64,${sectionImage.toString('base64')}`
          });
        } catch (error) {
          console.error(`Failed to extract section at (${x},${y}):`, error);
          // Continue with other sections even if one fails
        }
      }
    }
    
    return sections;
  }

  private async executeStep(step: TestStep): Promise<any> {
    if (!this.page) throw new Error('Browser page not initialized');

    let stepComplete = false;
    let attempts = 0;
    const MAX_ATTEMPTS_PER_STEP = 10;

    while (!stepComplete && attempts < MAX_ATTEMPTS_PER_STEP) {
      attempts++;

      const screenshot = await this.page.screenshot({ 
        type: 'png',
        path: undefined
      });

      const gridSections = await this.getGridScreenshots(screenshot);
      
      const historyContext = this.actionHistory.map(h => 
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
              text: `Previous actions taken:\n${historyContext}` + 
                (lastError ? `\n\nLast action failed with error: ${lastError}. Consider a different approach.` : '') +
                `\n\nCurrent goal: ${step.prompt}\n` +
                (attempts > 1 ? `\nPrevious attempts haven't succeeded. Try a different strategy.` : '') +
                `\nDetermine the next action needed to accomplish this goal. Set stepComplete to true only when you're confident the goal has been achieved.\n\n` +
                `Below are screenshots of each 100x100 pixel section of the current browser state. Use these to determine accurate coordinates for interactions.`
            },
            ...gridSections.map(section => ({
              type: "text",
              text: section.section
            })),
            ...gridSections.map(section => ({
              type: "image_url",
              image_url: {
                url: section.image,
                detail: "high"
              }
            }))
          ]
        })
      ];

      let command: ComputerCommand;
      try {
        command = await this.model.invoke(messages);
        if (this.debug) {
          console.log('\nModel Response:', JSON.stringify(command, null, 2));
        }
        const result = await this.executeCommand(command);
        this.actionHistory.push({ command, result });
        stepComplete = command.stepComplete;
        attempts = 0;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.actionHistory.push({ 
          command: command!, 
          error: errorMessage 
        });
        console.error(`Attempt ${attempts} failed:`, errorMessage);
      }
    }

    if (!stepComplete) {
      throw new Error(`Failed to complete step after ${MAX_ATTEMPTS_PER_STEP} attempts`);
    }
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