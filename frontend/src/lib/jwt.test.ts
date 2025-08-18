import { cookies } from "next/headers";
import { setAuthCookies, getAccessToken, getRefreshToken, clearAuthCookies } from "./jwt";

describe("jwt cookie helpers", () => {
  it("sets and reads cookies", () => {
    setAuthCookies("A1", "R1");
    expect(getAccessToken()).toBe("A1");
    expect(getRefreshToken()).toBe("R1");

    clearAuthCookies();
    expect(getAccessToken()).toBeUndefined();
    expect(getRefreshToken()).toBeUndefined();
  });
});
