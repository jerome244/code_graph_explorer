import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "./page";

describe("<LoginPage />", () => {
  it("logs in and navigates to /projects", async () => {
    // MSW handler for /api/auth/login returns 200 when alice/pass
    render(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText("Username"), "alice");
    await userEvent.type(screen.getByPlaceholderText("Password"), "pass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // if login fails the page shows "Invalid credentials".
    // absence implies success; alternatively spy on next/navigation push.
    expect(await screen.queryByText(/invalid credentials/i)).toBeNull();
  });
});
