/**
 * Shared in-memory test-mode flag.
 * Toggled by the control-center via POST /api/admin/test-mode.
 * Resets to false on server restart (intentional — test mode is ephemeral).
 * Imported by routes that need to mark or query test data.
 */
let _testMode = false;

export const getTestMode = (): boolean => _testMode;
export const setTestMode = (v: boolean): void => { _testMode = v; };
