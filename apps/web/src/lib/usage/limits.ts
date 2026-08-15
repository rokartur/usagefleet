/**
 * How long a reported utilization reading stays trustworthy. The collector's
 * limits leg can die on its own (it needs live Claude credentials) while usage
 * upload keeps working, and nothing decays the stored percentage — so past this
 * age a reading is treated as absent rather than current. Shared by the
 * dashboard's "offline" badge and by the prompt-blocking read, which must not
 * refuse work on a percentage whose window has long since reset.
 *
 * ponytail: three times the collector's default 300s limits interval. An
 * operator who raises USAGEFLEET_LIMITS_INTERVAL past this turns prompt
 * blocking off across the fleet, silently. Derive it from the reported interval
 * if that combination ever needs to work.
 */
export const LIMITS_STALE_MS = 15 * 60 * 1000
