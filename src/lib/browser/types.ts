export interface Coordinate {
  x: number;
  y: number;
}

export interface BrowserConfig {
  displayWidth: number;
  displayHeight: number;
}

export interface IBrowser {
  init(config: BrowserConfig): Promise<void>;
  cleanup(): Promise<void>;
  goto(url: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  type(text: string): Promise<void>;
  mouseMove(coordinate: Coordinate): Promise<void>;
  leftClick(): Promise<void>;
  rightClick(): Promise<void>;
  middleClick(): Promise<void>;
  doubleClick(): Promise<void>;
  dragAndDrop(target: Coordinate): Promise<void>;
  getCursorPosition(): Coordinate;
  takeScreenshot(): Promise<string>; // Returns base64 string
} 