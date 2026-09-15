import { probeDevice } from "../../packages/core/src/index.ts";

const button = document.querySelector<HTMLButtonElement>("#run-probe");
const output = document.querySelector<HTMLOutputElement>("#result");

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
