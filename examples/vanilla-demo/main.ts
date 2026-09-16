import { probeDevice } from "../../packages/core/src/index.ts";
import { createRouter } from "../../packages/core/src/orchestrator.ts";
import { WebLLMAdapter } from "../../packages/adapter-webllm/src/index.ts";

const button = document.querySelector<HTMLButtonElement>("#run-probe");
const output = document.querySelector<HTMLOutputElement>("#result");
const testButton = document.querySelector<HTMLButtonElement>("#run-test");
const testOutput = document.querySelector<HTMLOutputElement>("#test-result");
const AdaptorButton = document.querySelector<HTMLButtonElement>("#run-Adaptor");
const AdaptorOutput = document.querySelector<HTMLOutputElement>("#logs-result-Apatpor");

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


AdaptorButton?.addEventListener("click", async () => {
  if (!AdaptorOutput) return;

  AdaptorButton.disabled = true;
  AdaptorOutput.textContent = "Running Adaptor logs…";

  try {
    console.log("Running Adaptor logs…");
    const Adaptor = new WebLLMAdapter(); //fucking object ! ah ! 
    await Adaptor.load("Phi-3-mini-4k-instruct-q4f16_1-MLC");
    const result = await Adaptor.generate("test prompt");
    console.log(result);
    AdaptorOutput.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    AdaptorOutput.textContent = `Adaptor logs failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    AdaptorButton.disabled = false;
  }
});