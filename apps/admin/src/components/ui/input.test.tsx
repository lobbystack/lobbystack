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

  it("drops the native look on date and time fields, so iOS keeps them inside the field's width", () => {
    render(<><Input aria-label="date" type="date" /><Input aria-label="when" type="datetime-local" /><Input aria-label="name" type="text" /></>);
    for (const label of ["date", "when"]) {
      const field = screen.getByLabelText(label);
      expect(field.className).toContain("appearance-none");
      expect(field.className).toContain("min-w-0");
      expect(field.className).toContain("h-10");
    }
    expect(screen.getByLabelText("name").className).not.toContain("appearance-none");
  });
});
