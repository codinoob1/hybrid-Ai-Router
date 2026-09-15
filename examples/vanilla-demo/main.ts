import { probeDevice } from "../../packages/core/src/index.ts";
import { createRouter } from "../../packages/core/src/orchestrator.ts";

const button = document.querySelector<HTMLButtonElement>("#run-probe");
const output = document.querySelector<HTMLOutputElement>("#result");
const testButton = document.querySelector<HTMLButtonElement>("#run-test");
const testOutput = document.querySelector<HTMLOutputElement>("#test-result");

if (!button || !output) throw new Error("Probe demo elements are missing.");

button.addEventListener("click", async () => {
  button.disabled = true;
  output.textContent = "Probing this browser and device…";

  try {
    console.log("Probing this browser and device…");
    const deviceData = await probeDevice();
    console.log(deviceData);
    output.textContent = JSON.stringify(deviceData, null, 2);
  } catch (error) {
    output.textContent = `Probe failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
  }
});

testButton?.addEventListener("click", async () => {
  if (!testOutput) return;

  testButton.disabled = true;
  testOutput.textContent = "Running orchestrator test…";

  try {
    console.log("Running orchestrator test…");
    const router = createRouter({
      adapters: { webgpu: { load: async () => {}, generate: async () => "local answer" } },
      cloud: { generate: async () => "cloud answer" },
    });
    await router.init();
    const result = await router.generate("test prompt");
    console.log(result);
    testOutput.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    testOutput.textContent = `Orchestrator test failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    testButton.disabled = false;
  }
});