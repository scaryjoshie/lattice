import { describe, expect, test } from "bun:test";
import { addressOf, browsers, useBrowsers } from "./browsers.ts";

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

describe("tabs", () => {
  const of = (host: string) => useBrowsers.getState().browsers[host]!;

  test("a browser starts with one empty tab, current", () => {
    browsers.ensure("b1");
    expect(of("b1").tabs).toHaveLength(1);
    expect(of("b1").tabs[0]!.url).toBe("");
    expect(of("b1").current).toBe(of("b1").tabs[0]!.id);
  });

  test("a new tab opens beside the current one and becomes current", () => {
    browsers.ensure("b2");
    const first = of("b2").current;
    browsers.open("b2", "https://example.com");
    browsers.select("b2", first);
    browsers.open("b2");
    const ids = of("b2").tabs.map((t) => t.id) as string[];
    expect(ids).toHaveLength(3);
    // Opened from the first, so it sits second, before the example tab.
    expect(ids[0]).toBe(first);
    expect(of("b2").current).toBe(ids[1]!);
    expect(of("b2").tabs[2]!.url).toBe("https://example.com");
  });

  test("closing the current tab makes its neighbour current; the last leaves an empty tab", () => {
    browsers.ensure("b3");
    browsers.open("b3", "https://a.com");
    browsers.open("b3", "https://b.com");
    const [a, b, c] = of("b3").tabs.map((t) => t.id) as [string, string, string];
    browsers.select("b3", b);
    browsers.close("b3", b);
    expect(of("b3").tabs.map((t) => t.id)).toEqual([a, c]);
    expect(of("b3").current).toBe(c);
    browsers.close("b3", a);
    browsers.close("b3", c);
    expect(of("b3").tabs).toHaveLength(1);
    expect(of("b3").tabs[0]!.url).toBe("");
  });
});
