// Child process for manage-files-memory.test.ts: list assets in an isolated process and report peak RSS.
import { listManagedAssets } from '../../manage-files';
import { peakRSS } from './peak-rss';

const result = await listManagedAssets(process.argv[2]!);
const maxRSS = peakRSS();
console.log(JSON.stringify({ result, maxRSS }));
