// Child process for manage-files-memory.test.ts: list assets in an isolated process and report peak RSS.
import { listManagedAssets } from '../../manage-files';

const result = await listManagedAssets(process.argv[2]!);
// resourceUsage().maxRSS is in kilobytes on every platform; report bytes.
const maxRSS = process.resourceUsage().maxRSS * 1024;
console.log(JSON.stringify({ result, maxRSS }));
