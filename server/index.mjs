import 'dotenv/config';
import { createApp } from './app.mjs';
import { readConfig } from './config.mjs';
import { startLocalVoice } from './local-voice.mjs';
import { startLocalTryOn } from './local-tryon.mjs';
const config = readConfig();
const localTryOn = await startLocalTryOn(config);
const localVoice = startLocalVoice(config);
const app = await createApp(config);
const server = app.listen(config.port, config.host, () => console.log(`Aura Mirror API ready: http://${config.host}:${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    localVoice?.stop();
    localTryOn?.stop();
    server.close(() => process.exit(0));
  });
}
