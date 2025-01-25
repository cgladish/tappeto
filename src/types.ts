import { z } from 'zod';
import { Runnable } from '@langchain/core/runnables';

export const CoordinateSchema = z.object({
  x: z.number(),
  y: z.number()
}).describe('(x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates');

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
    'cursor_position',
    'goto'
  ]),
  coordinate: CoordinateSchema.optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  goal: z.string(),
  stepComplete: z.boolean().describe('Whether this command completes the current step'),
  reasoning: z.string().describe('Explanation of why this action was chosen')
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
  computerConfig?: Partial<ComputerConfig>;
  debug?: boolean;
} 