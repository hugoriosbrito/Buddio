import { createConfig } from "./wdio.shared.mjs";

export const config = createConfig({
  fakeDevices: "novirtual",
  specs: ["./specs/onboarding-route-error.e2e.mjs"],
});
