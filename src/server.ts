import { createKoralServer } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const { server } = createKoralServer(config);

server.listen(config.port, config.host, () => {
  console.log(`Koral Chat listening on http://${config.host}:${config.port}`);
});
