interface UsageGuardConfig {
  maxConcurrent: number;
  maxPerClientPerHour: number;
  maxPerDay: number;
  now?: () => number;
}

export type UsageLease =
  | { allowed: false; code: "BUSY" | "RATE_LIMIT" | "DAILY_LIMIT" }
  | { allowed: true; release: () => void };

export interface UsageGuard {
  acquire(clientKey: string): UsageLease;
}

export function createUsageGuard(config: UsageGuardConfig): UsageGuard {
  let concurrent = 0;
  const now = config.now ?? Date.now;
  let dailyRequests = {
    count: 0,
    day: Math.floor(now() / (24 * 60 * 60 * 1_000)),
  };
  const hourlyRequests = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();

  return {
    acquire(clientKey) {
      if (concurrent >= config.maxConcurrent) {
        return { allowed: false, code: "BUSY" };
      }

      const currentTime = now();
      const currentDay = Math.floor(currentTime / (24 * 60 * 60 * 1_000));
      if (dailyRequests.day !== currentDay) {
        dailyRequests = { count: 0, day: currentDay };
      }

      if (dailyRequests.count >= config.maxPerDay) {
        return { allowed: false, code: "DAILY_LIMIT" };
      }

      const existingWindow = hourlyRequests.get(clientKey);
      const clientWindow =
        existingWindow !== undefined &&
        currentTime - existingWindow.windowStartedAt < 60 * 60 * 1_000
          ? existingWindow
          : { count: 0, windowStartedAt: currentTime };

      if (clientWindow.count >= config.maxPerClientPerHour) {
        return { allowed: false, code: "RATE_LIMIT" };
      }

      concurrent += 1;
      dailyRequests.count += 1;
      clientWindow.count += 1;
      hourlyRequests.set(clientKey, clientWindow);
      let released = false;

      return {
        allowed: true,
        release() {
          if (!released) {
            concurrent -= 1;
            released = true;
          }
        },
      };
    },
  };
}
