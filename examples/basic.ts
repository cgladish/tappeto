import { config } from "dotenv";
config();

import { tap } from '../src';

async function runTest() {
  await tap
    .configure({ debug: true })
    .ready();
  
  tap
    .step('Search Google for "tappeto testing" and click the first result')
    .step('Scroll through the page and take a screenshot')
    .step('Go back to search results and click the second link')
    .step('Find any mention of "testing" on the page and highlight it');

  const success = await tap.run();
  console.log('Test completed:', success ? 'SUCCESS' : 'FAILURE');
}

runTest().catch(console.error);