import { describe, expect, it } from "vitest";
import { signInRedirects } from "./oauth-redirects";
import { PAID_PLANS } from "./plans";

describe("sign-in redirect targets", () => {
  // The regression this guards: an errorCallbackURL of "/login?error=oauth"
  // makes better-auth produce "/login?error=oauth&error=signup_disabled", which
  // decodes to error: ["oauth", "signup_disabled"]. Every string comparison on
  // the login page then fails and a rejected sign-in shows no message at all.
  it("never hands better-auth an error param to collide with", () => {
    for (const plan of [undefined, ...PAID_PLANS]) {
      expect(signInRedirects(plan).errorCallbackURL).not.toContain("error=");
    }
  });

  it("carries the chosen plan through both success and failure", () => {
    expect(signInRedirects("solo")).toEqual({
      callbackURL: "/billing?plan=solo",
      errorCallbackURL: "/login?plan=solo",
    });
  });

  it("falls back to the dashboard when no plan was chosen", () => {
    expect(signInRedirects()).toEqual({
      callbackURL: "/dashboard",
      errorCallbackURL: "/login",
    });
  });
});
