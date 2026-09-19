// site/lib/nav.ts — the menu, in the owner's order (18 Sep 2026): the race first (Fleet, Skippers, Course & sprints, Records), then how
// it is sailed (Performance, Conditions), then the boats and the past (Boats, Past races, Ghost race — Past races before Ghost race, his word of 18 Sep, linked 19 Sep), Data, Method last. Every address here needs its
// words in lib/seo.ts (a test holds the two together).
export const NAV: [string, string][] = [["Fleet", "/"], ["Skippers", "/skippers"], ["Course & sprints", "/course"], ["Records", "/records"], ["Performance", "/performance"], ["Conditions", "/conditions"], ["Boats", "/boats"], ["Past races", "/past-races"], ["Ghost race", "/ghosts"], ["Data", "/data"], ["Method", "/method"]];
// Entries a phone's menu leaves out (the owner, 19 Sep 2026): Data hands out spreadsheets, which are a desk's work, and the phone's
// one swiped row is long enough. The page itself still opens on a phone for anyone who has its address.
export const DESKTOP_ONLY: string[] = ["/data"];
