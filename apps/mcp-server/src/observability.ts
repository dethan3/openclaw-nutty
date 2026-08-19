export interface Logger {
  info(event: string, attributes?: Readonly<Record<string, unknown>>): void;
  error(event: string, attributes?: Readonly<Record<string, unknown>>): void;
}

export class JsonLogger implements Logger {
  info(event: string, attributes: Readonly<Record<string, unknown>> = {}): void {
    this.write("info", event, attributes);
  }

  error(event: string, attributes: Readonly<Record<string, unknown>> = {}): void {
    this.write("error", event, attributes);
  }

  private write(
    level: "info" | "error",
    event: string,
    attributes: Readonly<Record<string, unknown>>,
  ): void {
    process.stdout.write(
      `${JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...attributes })}\n`,
    );
  }
}

export class Metrics {
  private readonly calls = new Map<string, number>();
  private readonly durations = new Map<string, number>();

  record(tool: string, outcome: "success" | "error", durationMilliseconds: number): void {
    const key = `${tool}:${outcome}`;
    this.calls.set(key, (this.calls.get(key) ?? 0) + 1);
    this.durations.set(tool, (this.durations.get(tool) ?? 0) + durationMilliseconds);
  }

  snapshot(): Record<string, unknown> {
    return {
      calls: Object.fromEntries(this.calls),
      totalDurationMilliseconds: Object.fromEntries(this.durations),
    };
  }
}
