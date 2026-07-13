process.env.BUDDIO_GEN_BINDINGS = "1";
const result = Bun.spawnSync(["cargo", "check", "-p", "buddio"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.exitCode ?? 1);
