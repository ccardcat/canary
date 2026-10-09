import {test, expect} from "@playwright/test";
import {redactDiagnostic, sanitizeDetails} from "../src/services/privacy";
import {technicalDetails} from "../src/services/errors";

test("opaque provider tokens, Xbox tickets and proxy credentials are removed", () => {
  for (const text of [
    'token=synthetic-opaque-token', 'secret: synthetic-private-value',
    'identityToken="XBL3.0 x=123;synthetic-xbox-token"',
    'RpsTicket="d=synthetic-microsoft-token"',
    'UserTokens=["synthetic-first-token","synthetic-second-token"]',
    'Proxy-Authorization: NTLM synthetic-proxy-token',
  ]) expect(redactDiagnostic(text)).not.toContain("synthetic-");
});

test("escaped quotes in passwords cannot leave a secret suffix in diagnostics", () => {
  expect(redactDiagnostic('password="synthetic-start\\\"synthetic-end"; code=network')).not.toContain("synthetic-");
  expect(redactDiagnostic("password='synthetic-start\\'synthetic-end'; stage=login")).not.toContain("synthetic-");
});

test("structured sensitive fields mask arrays, objects and non-JWT tokens before Copy Details", () => {
  const details = {code: "network", stage: "login", message: "Token expired", token: "synthetic-opaque-token", IdentityToken: "synthetic-identity-token", UserTokens: ["synthetic-first", "synthetic-second"], credentials: {value: "synthetic-credential"}, cookies: [{name: "session", value: "synthetic-cookie"}], headers: {"Proxy-Authorization": "NTLM synthetic-proxy-token"}};
  const safe = technicalDetails(details);
  expect(safe).not.toContain("synthetic-");
  expect(sanitizeDetails(details)).toMatchObject({code: "network", stage: "login", message: "Token expired"});
  expect(safe).toContain('"code": "network"');
  expect(safe).toContain('"stage": "login"');
  expect(safe).toContain("Token expired");
});

test("ordinary token error messages and machine-readable error codes remain useful", () => {
  for (const text of ["Token expired; sign in again", "Secret storage is unavailable", '[ERROR] Could not load mod: missing dependency', '{"code":"unsafe_path","stage":"download","message":"File size mismatch"}']) {
    expect(redactDiagnostic(text)).toBe(text);
  }
});

test("nested metadata is sanitized without changing unrelated fields", () => {
  expect(sanitizeDetails({code: "network", request: {id: "request-1", secret: "synthetic-secret", retries: 2}})).toEqual({code: "network", request: {id: "request-1", secret: "<redacted>", retries: 2}});
});
