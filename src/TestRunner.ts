import { Browser, BrowserContext, Page, chromium } from 'playwright';
import {
  TestStep,
  TestStepSchema,
  ComputerConfig,
  ComputerConfigSchema,
  ComputerCommands,
  ComputerCommandsSchema,
  TestRunnerConfig,
  ComputerCommand
} from './types';
import { Runnable } from '@langchain/core/runnables';
import { initChatModel } from "langchain/chat_models/universal";

interface ModelDefinition {
  model: string;
  apiKey: string;
}

const primaryModel: ModelDefinition = {
  model: "gpt-4-0125-preview",
  apiKey: process.env.OPENAI_API_KEY as string
};

const fallbackModels: ModelDefinition[] = [
  {
    model: "claude-3-sonnet-20240229",
    apiKey: process.env.ANTHROPIC_API_KEY as string
  }
];

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

  static async create(computerConfig: Partial<ComputerConfig> = {}): Promise<TestRunner> {
    const sharedConfig = {
      maxTokens: 4096,
      temperature: 0,
      maxRetries: 2,
      systemMessage: `You are a UI testing assistant that generates computer interaction commands.
For each step, analyze what needs to be done and output a JSON array of commands.
Each command should have:
- An 'action' field for the specific interaction
- Optional 'coordinate' or 'text' fields as needed
- A 'goal' field explaining the current high-level objective being accomplished

Your goals should be clear and descriptive of the overall task being performed, not just the mechanical action.
For example, instead of "Click login button", use "Log in to application" as the goal.

Example output:
[
  {
    "action": "mouse_move",
    "coordinate": [100, 200],
    "goal": "Log in to application"
  },
  {
    "action": "type",
    "text": "username@example.com",
    "goal": "Log in to application"
  },
  {
    "action": "key",
    "text": "Tab",
    "goal": "Log in to application"
  },
  {
    "action": "type",
    "text": "password123",
    "goal": "Log in to application"
  },
  {
    "action": "key",
    "text": "Return",
    "goal": "Log in to application"
  }
]`
    };

    try {
      const primaryChat = (await initChatModel(primaryModel.model, {
        apiKey: primaryModel.apiKey,
        ...sharedConfig
      })).withStructuredOutput(ComputerCommandsSchema, {
        method: "json_mode"
      });

      const fallbackChats: Runnable[] = [];
      for (const model of fallbackModels) {
        const fallbackChat = (await initChatModel(model.model, {
          apiKey: model.apiKey,
          ...sharedConfig
        })).withStructuredOutput(ComputerCommandsSchema, {
          method: "json_mode"
        });
        fallbackChats.push(fallbackChat);
      }

      const model = primaryChat.withFallbacks(fallbackChats);
      return new TestRunner({ model, computerConfig });
    } catch (error) {
      console.error("Error initializing TestRunner:", error);
      throw error;
    }
  }

  private constructor({ model, computerConfig = {} }: TestRunnerConfig) {
    this.model = model;
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
            return false;
          }
        } catch (error) {
          console.error(`Error executing step: ${step.prompt}`, error);
          return false;
        }
      }
      return true;
    } finally {
      await this.cleanup();
    }
  }

  private async executeStep(step: TestStep): Promise<any> {
    if (!this.page) throw new Error('Browser page not initialized');

    const historyContext = this.actionHistory.map(h => 
      `Action: ${h.command.action} (${h.command.goal})` +
      (h.command.text ? ` with text "${h.command.text}"` : '') +
      (h.command.coordinate ? ` at coordinates ${h.command.coordinate}` : '') +
      (h.error ? ' - Failed' : ' - Success')
    ).join('\n');

    const lastError = this.actionHistory[this.actionHistory.length - 1]?.error;
    const prompt = `Previous actions taken:\n${historyContext}` + 
      (lastError ? `\n\nLast action failed with error: ${lastError}` : '') +
      `\n\nNext step: ${step.prompt}`;
    
    let response: ComputerCommands;
    try {
      response = await this.model.invoke(prompt);
    } catch (error) {
      throw new Error(`Failed to get model response: ${error}`);
    }

    try {
      const result = await this.executeCommands(response);
      response.forEach((command: ComputerCommand) => {
        this.actionHistory.push({ command, result });
      });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.actionHistory.push({ 
        command: response[response.length - 1], 
        error: errorMessage 
      });
      throw error;
    }
  }

  private async executeCommands(commands: ComputerCommands): Promise<any> {
    if (!this.page) throw new Error('Browser page not initialized');

    for (const command of commands) {
      try {
        switch (command.action) {
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
            [this.cursorX, this.cursorY] = command.coordinate;
            await this.page.mouse.move(this.cursorX, this.cursorY);
            break;

          case 'left_click':
            await this.page.mouse.click(this.cursorX, this.cursorY, { button: 'left' });
            break;

          case 'left_click_drag':
            if (!command.coordinate) throw new Error('Coordinate required for left_click_drag action');
            await this.page.mouse.down();
            await this.page.mouse.move(command.coordinate[0], command.coordinate[1]);
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

          case 'screenshot':
            await this.page.screenshot({ path: `screenshot-${Date.now()}.png` });
            break;

          case 'cursor_position':
            return { x: this.cursorX, y: this.cursorY };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.actionHistory.push({ command, error: errorMessage });
        throw new Error(`Failed to execute ${command.action}: ${errorMessage}`);
      }
    }
  }
}