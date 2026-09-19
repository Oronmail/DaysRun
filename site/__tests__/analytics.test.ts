// site/__tests__/analytics.test.ts
import { describe, it, expect } from "vitest";
import { gaMeasurementId, gtagSnippet } from "../lib/analytics";
const ID = "G-TEST123456";
const BAD = ["UA-12345-1", "GTM-ABC123", "G-", "g-test123456", "G-TEST 123", "G-TEST');alert(1);('", "G-TEST</script>", "xG-TEST123456"];
describe("gaMeasurementId", () => {
  it("gives the id on Vercel's production build, and only there", () => {
    expect(gaMeasurementId({ GA_MEASUREMENT_ID: ID, VERCEL_ENV: "production" })).toBe(ID);
    expect(gaMeasurementId({ GA_MEASUREMENT_ID: ID, VERCEL_ENV: "preview" })).toBeNull();        // a preview deploy counts nobody
    expect(gaMeasurementId({ GA_MEASUREMENT_ID: ID, VERCEL_ENV: "development" })).toBeNull();
    expect(gaMeasurementId({ GA_MEASUREMENT_ID: ID })).toBeNull();                               // a build on someone's own machine
  });
  it("gives nothing when no id is set, so a copy of this repository reports to nobody", () => {
    expect(gaMeasurementId({ VERCEL_ENV: "production" })).toBeNull();
    expect(gaMeasurementId({ GA_MEASUREMENT_ID: "", VERCEL_ENV: "production" })).toBeNull();
    expect(gaMeasurementId({ GA_MEASUREMENT_ID: "   ", VERCEL_ENV: "production" })).toBeNull();
  });
  it("forgives the white space a pasted value brings with it", () => {
    expect(gaMeasurementId({ GA_MEASUREMENT_ID: ` ${ID}\n`, VERCEL_ENV: "production" })).toBe(ID);
  });
  it("refuses anything that is not a Google Analytics 4 id: the value is written into a script on every page", () => {
    for (const bad of BAD) expect(gaMeasurementId({ GA_MEASUREMENT_ID: bad, VERCEL_ENV: "production" })).toBeNull();
  });
});
// The snippet is run here as a browser would run it, against a stand-in window, document and navigator.
type Tag = { src?: string; async?: boolean };
function visit(navigator: { webdriver?: boolean; userAgent: string }) {
  const window: { dataLayer?: unknown[][]; gtag?: (...a: unknown[]) => void } = {}, added: Tag[] = [];
  const document = { createElement: (): Tag => ({}), head: { appendChild: (s: Tag) => { added.push(s); } } };
  new Function("window", "document", "navigator", gtagSnippet(ID))(window, document, navigator);
  return { window, added };
}
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
describe("gtagSnippet", () => {
  it("for a reader: Google's two opening commands, then Google's file for this id", () => {
    const { window, added } = visit({ webdriver: false, userAgent: CHROME });
    const sent = (window.dataLayer ?? []).map(a => Array.from(a));
    expect(sent.map(a => a[0])).toEqual(["js", "config"]);
    expect(sent[0][1]).toBeInstanceOf(Date); expect(sent[1][1]).toBe(ID);
    expect(added).toEqual([{ async: true, src: `https://www.googletagmanager.com/gtag/js?id=${ID}` }]);
  });
  it("leaves gtag() where a later script can reach it, as Google's own snippet does", () => {
    const { window } = visit({ webdriver: false, userAgent: CHROME });
    window.gtag!("event", "x");
    expect(Array.from(window.dataLayer![2])).toEqual(["event", "x"]);
  });
  it("for a browser driven by a program (our own screenshots and checks): nothing at all, not even Google's file", () => {
    for (const nav of [{ webdriver: true, userAgent: CHROME }, { webdriver: false, userAgent: CHROME.replace("Chrome/", "HeadlessChrome/") }]) {
      const { window, added } = visit(nav);
      expect(window.dataLayer).toBeUndefined(); expect(window.gtag).toBeUndefined(); expect(added).toEqual([]);
    }
  });
  it("will not be built round anything but an id", () => {
    for (const bad of BAD) expect(() => gtagSnippet(bad)).toThrow();
  });
});
