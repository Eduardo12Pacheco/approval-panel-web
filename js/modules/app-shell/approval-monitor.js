export function createApprovalMonitor({ refreshQueue, refreshScriptDrafts }) {
  return {
    async refreshApprovalMonitorData() {
      await Promise.allSettled([
        refreshQueue({ silent: true }),
        refreshScriptDrafts({ silent: true }),
      ]);
    },
  };
}
