export const validRegisterPayload = {
  email: "owner@example.com",
  password: "SuperSecret123",
  firstName: "Ada",
  lastName: "Lovelace",
  companyName: "Acme Rentals",
  countryCode: "US",
  defaultLanguage: "en",
  defaultCurrency: "USD",
  timezone: "America/New_York",
};

export function extractCookie(headers: Record<string, unknown>, name: string): string {
  const setCookie = headers["set-cookie"] as string[] | undefined;
  const cookieHeader = setCookie?.find((c) => c.startsWith(`${name}=`));
  if (!cookieHeader) {
    throw new Error(`Cookie ${name} not found in response`);
  }
  return cookieHeader.split(";")[0]!;
}
