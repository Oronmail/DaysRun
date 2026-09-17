# worker/ggrstats/names.py
"""Display names. A single name is always the FIRST name. Team ids are YB's."""
FIRST = {1: "Gunnar", 2: "Louis", 3: "Guido", 4: "Daniel", 5: "Guy", 6: "Damien", 8: "Selim", 9: "Pär",
         10: "Pat", 11: "Mara", 12: "Henry", 13: "Etienne", 14: "Isa", 15: "Matt", 16: "Andrea", 17: "Ertan"}
# Full names where YB's text needs fixing (YB writes "Par Nyman" and a long bracketed form for Mara).
FULL = {2: "Louis Kerdelhué", 9: "Pär Nyman", 11: "Mara Løvenskiold Kveseth", 940: "Kirsten Neuschäfer"}   # GGR's official spellings; YB strips the diacritics
# Design name only (the builder's model name; a rig word only where it distinguishes, as the Biscay 36 was sold as sloop or
# ketch). Yacht names live in YACHT and are set in italics on the pages, never in quotes.
MODEL = {1: "Hans Christian 34", 2: "Biscay 36 ketch", 3: "Vancouver 34 Classic", 4: "Baba 35", 5: "Tashiba 36",
         6: "Rustler 36", 8: "Endurance 35", 9: "Rustler 36", 10: "Saltram Saga 36", 11: "Saltram Saga 36",
         12: "Cape George 36", 13: "Tradewind 35", 14: "OE 32", 15: "Cape George 36", 16: "Rustler 36", 17: "Rustler 36"}
# Yacht names, from YB RaceSetup `owner` (checked against goldengloberace.com skipper pages).
YACHT = {1: "Pompoen", 2: "IE Charge", 3: "Hannah of Cowes", 4: "Exodus", 5: "Spirit", 6: "Solarem", 8: "Help Disabled Children",
         9: "Lazy Otter", 10: "Silvermines Hydro", 11: "Showgirl", 12: "Privateer", 13: "Bernard", 14: "Olleanna", 15: "Tipi Haere",
         16: "BiBi", 17: "Miss Beagle", 978: "Matmut", 940: "Minnehaha", 957: "Suhaili", 985: "Joshua"}
DESIGN_CLASS = {1: "Hans Christian 34", 2: "Biscay 36", 3: "Vancouver 34", 4: "Baba 35", 5: "Tashiba 36",
                6: "Rustler 36", 8: "Endurance 35", 9: "Rustler 36", 10: "Saltram Saga 36", 11: "Saltram Saga 36",
                12: "Cape George 36", 13: "Tradewind 35", 14: "OE 32", 15: "Cape George 36", 16: "Rustler 36", 17: "Rustler 36"}
# 13: YB's model field holds the skipper's name by mistake; GGR's boat-tour video says Tradewind 35 "Bernard".
GHOST_BOAT = {978: "Rustler 36", 940: "Cape George 36", 957: "32 ft Bermudan ketch", 985: "Steel ketch"}   # design; yacht name in YACHT
COUNTRY_CODE = {"United States": "USA", "France": "FRA", "Italy": "ITA", "Israel": "ISR", "Turkey": "TUR", "Sweden": "SWE",
                "Ireland": "IRL", "Norway": "NOR", "United Kingdom": "GBR", "Switzerland": "SUI", "Canada": "CAN",
                "South Africa": "RSA"}
