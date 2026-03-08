export function toLabel(value: string): string {
  if (value.includes("_")) {
    return value
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
