import { describe, it, expect } from "vitest";
import { globToRegex, hasGlob } from "../src/lib/glob-to-regex.js";

describe("globToRegex", () => {
  it("exact pattern matches only itself", () => {
    const re = globToRegex("bash");
    expect(re.test("bash")).toBe(true);
    expect(re.test("bash_execute")).toBe(false);
    expect(re.test("BASH")).toBe(true); // case-insensitive
  });

  it("trailing * matches any non-slash suffix", () => {
    const re = globToRegex("bash*");
    expect(re.test("bash")).toBe(true);
    expect(re.test("bash_execute")).toBe(true);
    expect(re.test("run_bash_command")).toBe(false);
    expect(re.test("bash/sub")).toBe(false);
  });

  it("leading and trailing * matches any non-slash containing", () => {
    const re = globToRegex("*delete*");
    expect(re.test("file_delete")).toBe(true);
    expect(re.test("delete_file")).toBe(true);
    expect(re.test("read_file")).toBe(false);
  });

  it("single * in path stops at slash", () => {
    const re = globToRegex("/etc/*");
    expect(re.test("/etc/hosts")).toBe(true);
    expect(re.test("/etc/ssh/sshd_config")).toBe(false);
    expect(re.test("/home/user/file")).toBe(false);
  });

  it("** in path crosses slashes", () => {
    const re = globToRegex("/etc/**");
    expect(re.test("/etc/hosts")).toBe(true);
    expect(re.test("/etc/ssh/sshd_config")).toBe(true);
    expect(re.test("/home/user/file")).toBe(false);
  });

  it("escapes regex metacharacters", () => {
    const re = globToRegex("a.b");
    expect(re.test("a.b")).toBe(true);
    expect(re.test("aXb")).toBe(false);
    expect(re.test("a_b")).toBe(false);
  });

  it("escapes regex metacharacters mixed with wildcard", () => {
    const re = globToRegex("a.b*");
    expect(re.test("a.b")).toBe(true);
    expect(re.test("a.bcd")).toBe(true);
    expect(re.test("aXb")).toBe(false);
  });

  it("escapes parens and other metacharacters", () => {
    const re = globToRegex("foo(bar)");
    expect(re.test("foo(bar)")).toBe(true);
    expect(re.test("foobar")).toBe(false);
  });
});

describe("hasGlob", () => {
  it("detects wildcard", () => {
    expect(hasGlob("bash*")).toBe(true);
    expect(hasGlob("*delete*")).toBe(true);
    expect(hasGlob("/etc/**")).toBe(true);
  });

  it("returns false for plain patterns", () => {
    expect(hasGlob("bash")).toBe(false);
    expect(hasGlob("/etc/hosts")).toBe(false);
    expect(hasGlob("a.b")).toBe(false);
  });
});
