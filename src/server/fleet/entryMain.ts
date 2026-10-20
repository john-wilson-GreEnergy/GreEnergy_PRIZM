import {readPrivateJson} from '../security/localAccounts';
import {parseFleetEntryConfig, startFleetEntry} from './entryRelay';

async function main() {
  const config = parseFleetEntryConfig(await readPrivateJson(process.env.PRIZM_FLEET_ENTRY_CONFIG ?? ''));
  const relay = await startFleetEntry(config);
  console.info(JSON.stringify({event: 'fleet.entry.started', bindAddress: config.bindAddress, port: config.port}));
  let stopping = false;
  const stop = async (exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 5000); deadline.unref();
    await relay.stop(); clearTimeout(deadline); process.exit(exitCode);
  };
  relay.server.on('error', () => { console.error('Fleet entry listener failed'); void stop(1); });
  process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
}
void main().catch(() => { console.error('Fleet entry startup failed. Check private config and namespace addresses.'); process.exitCode = 1; });
