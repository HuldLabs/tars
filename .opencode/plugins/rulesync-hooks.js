export const RulesyncHooksPlugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        await $`bash "./.ai/guards/stop-unfinished-work.sh"`;
      }
    },
    "tool.execute.before": async (input) => {
      {
        const __re = new RegExp("Bash|PowerShell");
        if (__re.test(input.tool)) {
          await $`bash "./.ai/guards/block-secret-dump.sh"`;
        }
      }
      {
        const __re = new RegExp("Bash|PowerShell");
        if (__re.test(input.tool)) {
          await $`bash "./.ai/guards/block-destructive-commands.sh"`;
        }
      }
      {
        const __re = new RegExp("Bash");
        if (__re.test(input.tool)) {
          await $`node "./.ai/gates/prod-guard/gate.mjs"`;
        }
      }
    },
  };
};
