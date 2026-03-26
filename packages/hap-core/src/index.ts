/**
 * Re-export everything from the published npm package.
 * This thin wrapper keeps the workspace alias @hap/core working
 * so existing imports across the gateway apps don't need to change.
 */
export * from '@humanagencyp/hap-core';
