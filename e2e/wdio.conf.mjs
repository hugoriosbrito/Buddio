import { createConfig } from "./wdio.shared.mjs";

export const config = createConfig({
  fakeDevices: "full",
  specs: [
    "./specs/onboarding.e2e.mjs",
    "./specs/main-app.e2e.mjs",
    "./specs/mini-app.e2e.mjs",
    "./specs/mic-route.e2e.mjs",
  ],
});
