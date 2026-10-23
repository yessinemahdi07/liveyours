import assert from "node:assert/strict";
import { test } from "node:test";
import { signInErrorMessage } from "./signInError.ts";
import { formatMonthLabel, monthKey } from "./month.ts";

test("sign-in gives a credential message only for rejected credentials", () => {
  assert.match(signInErrorMessage({ status: 401 }), /username and password/);
  assert.match(signInErrorMessage({ status: 429 }), /five minutes/);
  assert.match(signInErrorMessage(new TypeError("Failed to fetch")), /connection/);
  assert.match(signInErrorMessage({ status: 503 }), /connection/);
});

test("month helpers safely normalize dates for the mobile objective editor", () => {
  assert.equal(monthKey("2026-7-15"), "2026-07");
  assert.equal(monthKey("2026-13-01"), null);
  assert.equal(monthKey(null), null);
  assert.equal(formatMonthLabel("2026-07-01"), "Jul 2026");
});
