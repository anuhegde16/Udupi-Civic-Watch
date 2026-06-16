export function getGreeting(name: string | null | undefined): string {
  const h = new Date().getHours();
  const tod =
    h >= 5 && h < 12 ? "morning" :
    h >= 12 && h < 17 ? "afternoon" :
    "evening";
  const first = (name ?? "").split(" ")[0] || "there";
  return `Good ${tod}, ${first}`;
}
