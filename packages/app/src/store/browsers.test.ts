import { describe, expect, test } from "bun:test";
import { addressOf } from "./browsers.ts";

describe("the address bar", () => {
  test("an address with a scheme is taken as typed", () => {
    expect(addressOf("https://example.com/a", "google")).toBe("https://example.com/a");
    expect(addressOf("about:blank", "google")).toBe("about:blank");
  });

  test("something that looks like a host is an address", () => {
    expect(addressOf("github.com", "google")).toBe("https://github.com");
    expect(addressOf("docs.rs/tauri/latest", "google")).toBe("https://docs.rs/tauri/latest");
    expect(addressOf("localhost:5277", "google")).toBe("http://localhost:5277");
  });

  test("anything else is a search with the chosen engine, and nothing is nothing", () => {
    expect(addressOf("tauri child webview", "google")).toBe("https://www.google.com/search?q=tauri%20child%20webview");
    expect(addressOf("tauri child webview", "kagi")).toBe("https://kagi.com/search?q=tauri%20child%20webview");
    expect(addressOf("   ", "google")).toBeNull();
  });
});
