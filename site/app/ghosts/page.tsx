// site/app/ghosts/page.tsx
import Shell from "@/components/Shell";
import { LineChart, DotPlot, Legend } from "@/components/Charts";
import { latestFleet, boatStats, teams, supabase, RACE } from "@/lib/db";
import { dateline, nm, sgn } from "@/lib/format";
export const revalidate = 900;
export default async function Page() {
  const fleet = await latestFleet(); const [boats, all] = await Promise.all([boatStats(fleet.as_of), teams()]);
  const ghosts = all.filter(t => t.is_ghost);
  const hist = (await supabase.from("fleet_stat").select("as_of, race_day, vdh_dtf_nm, kirsten_dtf_nm, leader_team_id").eq("race_key", RACE).order("as_of")).data ?? [];
  const daily = hist.filter(h => h.as_of.endsWith("T00:00:00+00:00"));
  const leaderDtf = (await supabase.from("boat_stat").select("as_of, dtf_nm, rank").eq("race_key", RACE).in("as_of", daily.map(d => d.as_of)).in("rank", [1, 8, 9])).data ?? [];
  const pick = (asOf: string, rank: number) => leaderDtf.find(r => r.as_of === asOf && r.rank === rank)?.dtf_nm ?? 0;
  const vs = (g: "vdh_dtf_nm" | "kirsten_dtf_nm") => ({ lead: daily.map(d => (d[g] ?? 0) - pick(d.as_of, 1)), med: daily.map(d => (d[g] ?? 0) - (pick(d.as_of, 8) + pick(d.as_of, 9)) / 2) });
  const v1 = vs("vdh_dtf_nm"), v2 = vs("kirsten_dtf_nm"); const xs = daily.map((_, i) => i);
  const lead = boats[0];
  return <Shell active="Ghost race" dateline={dateline(fleet.as_of, fleet.race_day)} title="GHOST RACE" note={`${lead.team.first_name} is ${sgn(lead.vs_vdh_days)} days on Van Den Heede`}>
    <div style={{ maxWidth: 820, fontSize: 19, lineHeight: 1.5 }}>YB replays four historic voyages beside the 2026 fleet, day for day. Two of them — Van Den Heede’s 2018 win and Neuschäfer’s 2022 win — are complete enough to race against.</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16 }}>{ghosts.map(g => <div className="tile" key={g.id}><div className="k">{g.ghost_label}</div><div className="v" style={{ fontSize: 20 }}>{g.name.replace(/ \d{4}.*$/, "")}</div><div className="s"><i>{g.yacht}</i> · {g.model}</div><div className="num" style={{ fontSize: 22, paddingTop: 6 }}>{g.id === 978 ? nm(fleet.vdh_dtf_nm) : g.id === 940 ? nm(fleet.kirsten_dtf_nm) : "—"}{g.id === 978 || g.id === 940 ? " nm" : ""}</div><div className="s" style={{ fontSize: 12 }}>{g.id === 978 || g.id === 940 ? `to go on race day ${fleet.race_day}` : "sparse replay"}</div></div>)}</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
      {([["Against Van Den Heede, 2018", v1], ["Against Neuschäfer, 2022", v2]] as [string, typeof v1][]).map(([t, v]) => <div key={t} style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">{t}</div><div className="small" style={{ fontStyle: "italic" }}>nm ahead (+) or behind (−), same race day</div></div><Legend items={[["Leader", "var(--series-1)"], ["Fleet median", "var(--series-2)"]]} /><div className="panel"><LineChart series={[{ name: "Leader", color: "var(--series-1)", vals: v.lead }, { name: "Fleet median", color: "var(--series-2)", vals: v.med }]} xs={xs} ymin={-200} ymax={600} yticks={[-200, 0, 200, 400, 600]} xlab={i => `d${daily[i].race_day}`} /></div></div>)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "600px minmax(0,1fr)", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}><div className="rule-title"><div className="label">Every boat, in days</div><div className="small" style={{ fontStyle: "italic" }}>race day {fleet.race_day}</div></div>
        <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--graphite)" }}><span>● Van Den Heede 2018</span><span>■ Neuschäfer 2022</span><span>right of zero = ahead</span></div>
        <div className="panel"><DotPlot rows={boats.map(b => ({ label: b.team.first_name ?? b.team.name, a: b.vs_vdh_days ?? 0, b: b.vs_kirsten_days ?? 0 }))} /></div></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="rule-title"><div className="label">How the gap is measured</div></div>
        <div style={{ fontSize: 15, lineHeight: 1.55 }}>A time comparison. Behind a ghost, the replay shows when the ghost passed this boat’s distance to finish, so “−1 d” means the ghost was here a day ago. Ahead of a ghost, the days until it arrives are extrapolated at its pace over the last seven replay days.</div>
        <div style={{ fontSize: 15, lineHeight: 1.55 }}>The 2018 and 2022 fleets sailed slightly different courses. YB places their tracks on the 2026 course, and we take its distance to finish as given.</div></div>
    </div>
  </Shell>;
}
