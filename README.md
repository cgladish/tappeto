# Tappeto

Natural language UI & E2E testing using Anthropic's Computer Use tool

## Overview

Tappeto is a powerful and intuitive testing framework that allows you to write UI and E2E tests using natural language commands. By leveraging Anthropic's Computer Use capabilities, it enables you to describe test scenarios in plain English, making test creation more accessible and maintainable.

## Features

This is very much still a WIP, but the goal is to have the following features:

- Natural language test steps
- Browser automation using Playwright
- Configurable display settings
- Flexible validation options
- Easy-to-use fluent API

## Usage

First, set up your environment variables:

```bash
# .env
ANTHROPIC_API_KEY=your_api_key_here
```

Then, create your test file:

```typescript
import { tap } from 'tappeto';

async function runTest() {
  // Configure and initialize
  await tap
    .configure({ debug: true })
    .ready();
  
  // Define test steps in natural language
  tap
    .step('Search Google for "tappeto testing" and click the first result')
    .step('Scroll through the page and take a screenshot')
    .step('Go back to search results and click the second link')
    .step('Find any mention of "testing" on the page and highlight it');

  // Run the test
  const success = await tap.run();
  console.log('Test completed:', success ? 'SUCCESS' : 'FAILURE');
}

runTest().catch(console.error);
```

## Configuration

You can configure Tappeto with the following options:

```typescript
interface TapConfig {
  displayWidth: number;    // Width of the browser window
  displayHeight: number;   // Height of the browser window
  displayNumber: number;   // Display number for multi-monitor setups
  debug?: boolean;         // Enable debug mode
  maxAttempts?: number;    // Maximum retry attempts for actions
}
```

## API Reference

### `tap.configure(config)`
Configure the test runner with custom settings.

### `tap.ready()`
Initialize the test runner. Must be called before adding steps.

### `tap.step(prompt, validation?)`
Add a test step with an optional validation function.

### `tap.run()`
Execute all defined test steps.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
