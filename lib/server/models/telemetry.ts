import type {TelemetryOptions} from 'ai';

/** Direct research calls may be observed by diagnostic subscribers even without
 * a registered exporter. Keep structural diagnostics, never customer content.
 * This does not redact application results used for evidence and accounting. */
export const contentFreeModelTelemetry = Object.freeze({
 recordInputs: false,
 recordOutputs: false,
} satisfies TelemetryOptions);
