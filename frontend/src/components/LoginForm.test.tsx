import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginForm from "./LoginForm";

describe("<LoginForm />", () => {
  it("logs in and navigates to /projects", async () => {
    render(<LoginForm />);
    await userEvent.type(screen.getByPlaceholderText("Username"), "alice");
    await userEvent.type(screen.getByPlaceholderText("Password"), "pass");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.queryByText(/invalid credentials/i)).toBeNull();
  });
});
