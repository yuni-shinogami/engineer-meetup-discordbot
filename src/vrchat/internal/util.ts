export function env(key: string, options: { required?: boolean; default?: string } = {}): string {
  const { required = true, default: defaultValue } = options;
  const value = process.env[key] ?? defaultValue;
  if (required && !value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value ?? '';
}
