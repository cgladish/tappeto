import { z } from 'zod';
import { Runnable } from '@langchain/core/runnables';

export const CoordinateSchema = z.tuple([z.number(), z.number()])
  .describe('(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates');

export const ComputerCommandSchema = z.object({
  action: z.enum([
    'key',
    'type',
    'mouse_move',
    'left_click',
    'left_click_drag',
    'right_click',
    'middle_click',
    'double_click',
    'screenshot',
    'cursor_position'
  ]).describe(`The action to perform. Available actions:
    * key: Press a key or key-combination (e.g., "Return", "alt+Tab", "ctrl+s")
    * type: Type a string of text
    * mouse_move: Move cursor to coordinates
    * left_click: Click left mouse button
    * left_click_drag: Click and drag to coordinates
    * right_click: Click right mouse button
    * middle_click: Click middle mouse button
    * double_click: Double-click left mouse button
    * screenshot: Take a screenshot
    * cursor_position: Get current cursor coordinates`),
  coordinate: CoordinateSchema.optional(),
  text: z.string().optional()
    .describe('Required for type and key actions'),
  goal: z.string()
    .describe('The current high-level goal this command is trying to achieve (e.g., "Log in to application", "Navigate to settings")')
});

export const ComputerCommandsSchema = z.array(ComputerCommandSchema);

export type ComputerCommand = z.infer<typeof ComputerCommandSchema>;
export type ComputerCommands = z.infer<typeof ComputerCommandsSchema>;

export const TestStepSchema = z.object({
  prompt: z.string(),
  validation: z.function()
    .args(z.any())
    .returns(z.union([z.boolean(), z.promise(z.boolean())]))
    .optional()
});

export type TestStep = z.infer<typeof TestStepSchema>;

export const ComputerConfigSchema = z.object({
  displayWidth: z.number().default(1024),
  displayHeight: z.number().default(768),
  displayNumber: z.number().default(1)
});

export type ComputerConfig = z.infer<typeof ComputerConfigSchema>;

export interface TestRunnerConfig {
  model: Runnable;
  computerConfig?: Partial<ComputerConfig>;
} 