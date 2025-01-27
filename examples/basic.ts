import { config } from "dotenv";
config();

import { tap } from '../src';

async function runTest() {
  await tap
    .configure({ debug: true })
    .ready();
  
  tap
    .step('Go to localhost:3000 and login in the RollCredits app with the username producer@gmail.com and password "password"')
    .step('Change your password to "passwordpassword" from the settings page')
    .step('Logout of the app')

  const success = await tap.run();
  console.log('Test completed:', success ? 'SUCCESS' : 'FAILURE');
}

runTest().catch(console.error);