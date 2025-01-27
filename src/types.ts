import { z } from 'zod';
import { Runnable } from '@langchain/core/runnables';

export const WAIT_TIME = 5; // Seconds

export const CoordinateSchema = z.object({
  x: z.number().describe('The x (pixels from the left edge) coordinate'),
  y: z.number().describe('The y (pixels from the top edge) coordinate')
});

export const ComputerCommandSchema = z.object({
  goal: z.string().describe('The overarching goal of the current sequence of actions'),
  reasoning: z.string().describe('Explanation of why this action was chosen'),
  action: z.enum([
    'wait',
    'key',
    'type',
    'mouse_move',
    'left_click',
    'left_click_drag',
    'right_click',
    'middle_click',
    'double_click',
    'goto'
  ]).describe('The type of action to perform'),
  coordinate: CoordinateSchema.optional().describe('The coordinates to trigger a mouse action at, if applicable'),
  text: z.string().optional().describe('The text to type, if applicable'),
  url: z.string().optional().describe('The URL to navigate to, if applicable'),
  stepComplete: z.boolean().describe('Whether this command completes the current step'),
});

export type ComputerCommand = z.infer<typeof ComputerCommandSchema>;

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
  displayNumber: z.number().default(1),
});

export type ComputerConfig = z.infer<typeof ComputerConfigSchema>;

export interface TestRunnerConfig {
  model: Runnable;
  computerConfig: ComputerConfig;
  debug?: boolean;
} 