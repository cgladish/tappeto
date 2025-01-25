import { tap } from '../src';

async function runTest() {
  await tap.ready();
  
  tap
    .step('Navigate to google.com and wait for the page to load')
    .step('Find the search input box and type "tappeto testing"')
    .step('Click the Google Search button and wait for results');

  const success = await tap.run();
  console.log('Test completed:', success ? 'SUCCESS' : 'FAILURE');
}

runTest().catch(console.error);