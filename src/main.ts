import { loadConfig } from "./config.ts";
import { createRuntime } from "./runtime.ts";

try {
  const config = loadConfig();
  const { server } = createRuntime(config);

  server.once("error", (error) => {
    console.error("Não foi possível iniciar o servidor local.", error);
    process.exitCode = 1;
  });

  server.listen(config.port, config.host, () => {
    const displayHost = config.host === "0.0.0.0" ? "localhost" : config.host;
    console.log(`Transcrição fácil: http://${displayHost}:${config.port}/`);
    console.log("Abra o endereço e introduza a palavra-passe do site.");
  });

  const stop = () => {
    server.close(() => {
      process.exitCode = 0;
    });
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
} catch (error) {
  const message = error instanceof Error ? error.message : "Configuração inválida.";
  console.error(`Não foi possível iniciar: ${message}`);
  process.exitCode = 1;
}
