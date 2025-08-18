import { cookies } from "next/headers";
import { setAuthCookies, getAccessTokenServer, getRefreshToken, clearAuthCookies } from "./jwt";

describe("jwt cookie helpers", () => {
  it("sets and reads cookies", () => {
    setAuthCookies("A1", "R1");
    expect(getAccessTokenServer()).toBe("A1");
    expect(getRefreshToken()).toBe("R1");

    clearAuthCookies();
    expect(getAccessTokenServer()).toBeUndefined();
    expect(getRefreshToken()).toBeUndefined();
  });
});
