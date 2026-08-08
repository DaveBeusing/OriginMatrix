import test from "node:test";
import assert from "node:assert/strict";
import { domainMatches, normalizeHostname } from "../src/engine/domain-normalizer.js";

test("normalizes URLs and hostnames", () => {
  assert.equal(normalizeHostname("HTTPS://WWW.Example.COM/path"), "www.example.com");
  assert.equal(normalizeHostname(".Example.COM."), "example.com");
});

test("matches a domain and its subdomains but not suffix lookalikes", () => {
  assert.equal(domainMatches("cdn.example.com", "example.com"), true);
  assert.equal(domainMatches("notexample.com", "example.com"), false);
});
