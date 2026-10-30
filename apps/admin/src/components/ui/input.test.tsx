// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Input, PASSWORD_PLACEHOLDER } from "./input";

afterEach(cleanup);

describe("Input", () => {
  it("gives a password field eight bullets and the monospace font, and only that field", () => {
    render(<><Input aria-label="password" type="password" /><Input aria-label="email" placeholder="name@example.com" type="email" /></>);
    const password = screen.getByLabelText("password") as HTMLInputElement;
    expect(PASSWORD_PLACEHOLDER).toBe("••••••••");
    expect(password.placeholder).toBe("••••••••");
    expect(password.className).toContain("font-mono");
    const email = screen.getByLabelText("email") as HTMLInputElement;
    expect(email.placeholder).toBe("name@example.com");
    expect(email.className).not.toContain("font-mono");
  });

  it("lets a caller's placeholder and classes win", () => {
    render(<Input aria-label="password" className="font-sans" placeholder="Secret" type="password" />);
    const password = screen.getByLabelText("password") as HTMLInputElement;
    expect(password.placeholder).toBe("Secret");
    expect(password.className).toContain("font-sans");
    expect(password.className).not.toContain("font-mono");
  });
});
