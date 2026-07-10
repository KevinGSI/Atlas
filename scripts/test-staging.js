import { runStagingSmoke } from '../src/staging-smoke.js';
try{const report=await runStagingSmoke(process.env.STAGING_BASE_URL);console.log(JSON.stringify(report,null,2));}catch(error){console.error(error.message);process.exit(1);}
